"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Agent dispatch for inbound Feishu messages.
 *
 * Builds the agent envelope, prepends chat history context, and
 * dispatches through the appropriate reply path (system command
 * vs. normal streaming/static flow).
 *
 * Implementation details are split across focused modules:
 * - dispatch-context.ts  — DispatchContext type, route/session/event
 * - dispatch-builders.ts — pure payload/body/envelope construction
 * - dispatch-commands.ts — system command & permission notification
 */
import { clearHistoryEntriesIfEnabled } from 'openclaw/plugin-sdk';
import { getLarkAccount } from '../../core/accounts';
import { LarkClient } from '../../core/lark-client';
import { larkLogger } from '../../core/lark-logger';
import { ticketElapsed } from '../../core/lark-ticket';
import { createFeishuReplyDispatcher } from '../../card/reply-dispatcher';
import { mentionedBot } from './mention';
import { buildQueueKey, threadScopedKey, registerActiveDispatcher, unregisterActiveDispatcher, enqueueFeishuChatTask, } from '../../channel/chat-queue';
import { isLikelyAbortText } from '../../channel/abort-detect';
import { buildDispatchContext, resolveThreadSessionKey } from './dispatch-context';
import { buildMessageBody, buildBodyForAgent, buildInboundPayload, buildEnvelopeWithHistory, } from './dispatch-builders';
import { dispatchPermissionNotification, dispatchSystemCommand } from './dispatch-commands';
import { encodeFeishuRouteTarget } from '../../core/targets';
import { runFeishuDoctorI18n } from '../../commands/doctor';
import { runFeishuAuthI18n } from '../../commands/auth';
import { runFeishuStartI18n, getFeishuHelpI18n } from '../../commands/index';
import { resolveFeishuGroupConfig } from './policy';
import { getAgentMentionDirectory, extractAgentMentions } from '../shared/agent-mentions';
import { sendCardFeishu, buildI18nMarkdownCard, sendMessageFeishu } from '../outbound/send';
const log = larkLogger('inbound/dispatch');
const DEFAULT_AGENT_HANDOFF_MAX_ROUNDS = 3;
const DEFAULT_AGENT_HANDOFF_TASK_TEMPLATE = [
    '[System: 这是来自 {sourceDisplayName} 的 agent 协作任务。]',
    '[System: 当前协作轮次 {handoffRound}/{maxRounds}。若需要继续转交其他 agent，不得超过最大轮次。]',
    '[System: 协作顺序、回执策略、汇总方式以当前 agent 的提示词/AGENTS 规则为准；基础收发能力与轮次控制由系统负责。]',
    '{taskBody}',
].join('\n\n');
const DEFAULT_AGENT_HANDOFF_RETURN_TEMPLATE = [
    '[System: 这是来自 {sourceDisplayName} 的下游协作结果回传。]',
    '[System: 当前协作轮次 {handoffRound}/{maxRounds}。请先汇总下游结果，再决定是否继续向用户回复或转交其他 agent。]',
    '{taskBody}',
].join('\n\n');
const DEFAULT_AGENT_HANDOFF_RECEIPT_TEMPLATE = '任务已收到，第 {handoffRound} 轮协作开始处理。';
const DEFAULT_AGENT_HANDOFF_COMPLETE_TEMPLATE = '任务已完成，第 {handoffRound} 轮协作已处理完毕，相关结果已发在群里。';
function renderAgentHandoffTemplate(template, variables) {
    return String(template).replace(/\{(\w+)\}/g, (_match, key) => {
        const value = variables[key];
        return value == null ? '' : String(value);
    }).trim();
}
function normalizeAgentReturnEntry(entry) {
    if (!entry || typeof entry.agentId !== 'string' || typeof entry.accountId !== 'string' || typeof entry.displayName !== 'string') {
        return null;
    }
    return {
        agentId: entry.agentId,
        accountId: entry.accountId,
        displayName: entry.displayName,
        botOpenId: typeof entry.botOpenId === 'string' && entry.botOpenId ? entry.botOpenId : undefined,
    };
}
function getSyntheticReturnChain(syntheticMeta) {
    if (Array.isArray(syntheticMeta?.returnChain)) {
        return syntheticMeta.returnChain
            .map((entry) => normalizeAgentReturnEntry(entry))
            .filter((entry) => entry);
    }
    const notifySource = normalizeAgentReturnEntry(syntheticMeta?.notifySource);
    return notifySource ? [notifySource] : [];
}
function getImmediateNotifySource(syntheticMeta) {
    return getSyntheticReturnChain(syntheticMeta)[0];
}
function resolveAgentHandoffSettings(cfg) {
    const handoffCfg = cfg?.channels?.feishu?.agentHandoff ?? {};
    const parsedMaxRounds = Number(handoffCfg.maxRounds);
    return {
        maxRounds: Number.isFinite(parsedMaxRounds) ? Math.max(1, Math.floor(parsedMaxRounds)) : DEFAULT_AGENT_HANDOFF_MAX_ROUNDS,
        autoReceipt: handoffCfg.autoReceipt !== false,
        autoComplete: handoffCfg.autoComplete !== false,
        taskTemplate: typeof handoffCfg.taskTemplate === 'string' && handoffCfg.taskTemplate.trim()
            ? handoffCfg.taskTemplate
            : DEFAULT_AGENT_HANDOFF_TASK_TEMPLATE,
        receiptTemplate: typeof handoffCfg.receiptTemplate === 'string' && handoffCfg.receiptTemplate.trim()
            ? handoffCfg.receiptTemplate
            : DEFAULT_AGENT_HANDOFF_RECEIPT_TEMPLATE,
        completeTemplate: typeof handoffCfg.completeTemplate === 'string' && handoffCfg.completeTemplate.trim()
            ? handoffCfg.completeTemplate
            : DEFAULT_AGENT_HANDOFF_COMPLETE_TEMPLATE,
    };
}
function buildAgentHandoffTaskText(params) {
    const { sourceDisplayName, cleanedTaskText, handoffRound, maxRounds, targetDisplayName, targetAgentId, sourceAgentId, handoffSettings } = params;
    const taskBody = cleanedTaskText || '请继续处理当前群聊上下文。';
    return renderAgentHandoffTemplate(handoffSettings.taskTemplate, {
        sourceDisplayName,
        sourceAgentId,
        targetDisplayName,
        targetAgentId,
        handoffRound,
        maxRounds,
        taskBody,
    });
}
function buildAgentReturnTaskText(params) {
    const { sourceDisplayName, cleanedTaskText, handoffRound, maxRounds, sourceAgentId } = params;
    const taskBody = cleanedTaskText || '下游 agent 已完成当前任务，但没有输出可回传的正文。';
    return renderAgentHandoffTemplate(DEFAULT_AGENT_HANDOFF_RETURN_TEMPLATE, {
        sourceDisplayName,
        sourceAgentId,
        handoffRound,
        maxRounds,
        taskBody,
    });
}
async function sendAgentHandoffStatusMessage(params) {
    const { dc, replyToMessageId, phase, syntheticMeta, handoffSettings } = params;
    const notifySource = getImmediateNotifySource(syntheticMeta);
    if (!notifySource) {
        return;
    }
    const handoffRound = Math.max(1, syntheticMeta?.handoffDepth ?? 1);
    const currentDisplayName = dc.account.name ?? dc.route.agentId;
    const text = renderAgentHandoffTemplate(phase === 'accepted' ? handoffSettings.receiptTemplate : handoffSettings.completeTemplate, {
        phase,
        handoffRound,
        maxRounds: handoffSettings.maxRounds,
        sourceDisplayName: notifySource.displayName,
        sourceAgentId: notifySource.agentId,
        currentDisplayName,
        currentAgentId: dc.route.agentId,
    });
    const mentions = notifySource.botOpenId
        ? [{ openId: notifySource.botOpenId, name: notifySource.displayName }]
        : [];
    try {
        await sendMessageFeishu({
            cfg: dc.accountScopedCfg,
            to: dc.ctx.chatId,
            text,
            replyToMessageId: replyToMessageId ?? dc.ctx.messageId,
            accountId: dc.account.accountId,
            replyInThread: dc.isThread,
            mentions,
        });
        dc.log(`feishu[${dc.account.accountId}]: sent handoff ${phase} notice to ${notifySource.agentId}`);
    }
    catch (err) {
        dc.error(`feishu[${dc.account.accountId}]: failed to send handoff ${phase} notice: ${String(err)}`);
    }
}
async function dispatchAgentMentionHandoffs(params) {
    const { dc, chatHistories, completedReplyText, completedHandoffText, completedMentionTargets, historyLimit, replyToMessageId, syntheticMeta } = params;
    if (!dc.isGroup || !completedReplyText.trim()) {
        return;
    }
    const handoffSettings = resolveAgentHandoffSettings(dc.accountScopedCfg);
    const currentDepth = syntheticMeta?.handoffDepth ?? 0;
    if (currentDepth >= handoffSettings.maxRounds) {
        dc.log(`feishu[${dc.account.accountId}]: handoff round limit reached (${currentDepth}/${handoffSettings.maxRounds}), skipping nested mentions`);
        return;
    }
    const globalCfg = LarkClient.globalConfig ?? dc.accountScopedCfg;
    const directory = await getAgentMentionDirectory(globalCfg);
    const mentionResolution = completedMentionTargets && completedMentionTargets.length > 0
        ? {
            cleanedText: completedHandoffText?.trim() || completedReplyText,
            targets: completedMentionTargets,
        }
        : extractAgentMentions({
            text: completedReplyText,
            directory,
            currentAgentId: dc.route.agentId,
            currentAccountId: dc.account.accountId,
        });
    if (mentionResolution.targets.length === 0) {
        return;
    }
    const sourceEntry = directory.find((entry) => entry.agentId === dc.route.agentId || entry.accountId === dc.account.accountId);
    const sourceDisplayName = sourceEntry?.displayName ??
        dc.account.name ??
        dc.route.agentId;
    const currentSource = normalizeAgentReturnEntry(sourceEntry) ?? {
        agentId: dc.route.agentId,
        accountId: dc.account.accountId,
        displayName: sourceDisplayName,
        botOpenId: undefined,
    };
    const handoffPath = Array.isArray(syntheticMeta?.handoffPath) ? syntheticMeta.handoffPath : [];
    const upstreamReturnChain = getSyntheticReturnChain(syntheticMeta);
    const nextReturnChain = [currentSource, ...upstreamReturnChain];
    const nextPath = [...handoffPath, dc.route.agentId];
    const returnedFromAgentId = typeof syntheticMeta?.returnedFromAgentId === 'string'
        ? syntheticMeta.returnedFromAgentId
        : undefined;
    for (const target of mentionResolution.targets) {
        if (target.agentId === dc.route.agentId ||
            (handoffPath.includes(target.agentId) && target.agentId !== returnedFromAgentId)) {
            continue;
        }
        const targetAccount = getLarkAccount(globalCfg, target.accountId);
        if (!targetAccount.enabled || !targetAccount.configured) {
            dc.log(`feishu[${dc.account.accountId}]: target ${target.agentId} is not configured, skipping handoff`);
            continue;
        }
        const targetAccountScopedCfg = {
            ...globalCfg,
            channels: { ...globalCfg.channels, feishu: targetAccount.config },
        };
        const targetHistoryLimit = Math.max(0, targetAccount.config?.historyLimit ?? targetAccountScopedCfg.messages?.groupChat?.historyLimit ?? historyLimit);
        const targetGroupConfig = resolveFeishuGroupConfig({ cfg: targetAccount.config, groupId: dc.ctx.chatId });
        const targetDefaultGroupConfig = targetAccount.config?.groups?.['*'];
        const syntheticMessageId = `${replyToMessageId ?? dc.ctx.messageId}:agent-handoff:${dc.route.agentId}:${target.agentId}:${Date.now()}`;
        const handoffRound = currentDepth + 1;
        const handoffText = buildAgentHandoffTaskText({
            sourceDisplayName,
            cleanedTaskText: mentionResolution.cleanedText,
            handoffRound,
            maxRounds: handoffSettings.maxRounds,
            targetDisplayName: target.displayName,
            targetAgentId: target.agentId,
            sourceAgentId: dc.route.agentId,
            handoffSettings,
        });
        const syntheticCtx = {
            chatId: dc.ctx.chatId,
            messageId: syntheticMessageId,
            senderId: `agent:${dc.route.agentId}`,
            senderName: sourceDisplayName,
            chatType: dc.ctx.chatType,
            content: handoffText,
            contentType: 'text',
            resources: [],
            mentions: [],
            threadId: dc.ctx.threadId,
            rawMessage: {
                message_id: syntheticMessageId,
                chat_id: dc.ctx.chatId,
                chat_type: dc.ctx.chatType,
                message_type: 'text',
                content: JSON.stringify({ text: handoffText }),
                thread_id: dc.ctx.threadId,
                create_time: String(Date.now()),
            },
            rawSender: {
                sender_id: { open_id: `agent:${dc.route.agentId}` },
                sender_type: 'app',
            },
        };
        const syntheticRuntime = {
            log: (message) => dc.log(message),
            error: (message) => dc.error(message),
        };
        const { status, promise } = enqueueFeishuChatTask({
            accountId: target.accountId,
            chatId: dc.ctx.chatId,
            threadId: dc.ctx.threadId,
            task: async () => {
                await dispatchToAgent({
                    ctx: syntheticCtx,
                    permissionError: undefined,
                    mediaPayload: {},
                    quotedContent: undefined,
                    account: targetAccount,
                    accountScopedCfg: targetAccountScopedCfg,
                    runtime: syntheticRuntime,
                    chatHistories,
                    historyLimit: targetHistoryLimit,
                    replyToMessageId: replyToMessageId ?? dc.ctx.messageId,
                    commandAuthorized: false,
                    groupConfig: targetGroupConfig,
                    defaultGroupConfig: targetDefaultGroupConfig,
                    skipTyping: true,
                    syntheticMeta: {
                        handoffDepth: handoffRound,
                        handoffPath: nextPath,
                        notifySource: currentSource,
                        returnChain: nextReturnChain,
                    },
                });
            },
        });
        dc.log(`feishu[${dc.account.accountId}]: queued agent handoff ${dc.route.agentId} -> ${target.agentId} (round ${handoffRound}/${handoffSettings.maxRounds}, ${status})`);
        await promise;
    }
}
async function dispatchAgentResultReturn(params) {
    const { dc, chatHistories, completedReplyText, completedHandoffText, historyLimit, replyToMessageId, syntheticMeta } = params;
    const returnChain = getSyntheticReturnChain(syntheticMeta);
    const notifySource = returnChain[0];
    if (!dc.isGroup || !notifySource) {
        return;
    }
    const remainingReturnChain = returnChain.slice(1);
    const globalCfg = LarkClient.globalConfig ?? dc.accountScopedCfg;
    const sourceAccount = getLarkAccount(globalCfg, notifySource.accountId);
    if (!sourceAccount.enabled || !sourceAccount.configured) {
        dc.log(`feishu[${dc.account.accountId}]: source ${notifySource.agentId} is not configured, skipping result return`);
        return;
    }
    const handoffSettings = resolveAgentHandoffSettings(dc.accountScopedCfg);
    const handoffRound = Math.max(1, syntheticMeta?.handoffDepth ?? 1);
    const sourceAccountScopedCfg = {
        ...globalCfg,
        channels: { ...globalCfg.channels, feishu: sourceAccount.config },
    };
    const sourceHistoryLimit = Math.max(0, sourceAccount.config?.historyLimit ?? sourceAccountScopedCfg.messages?.groupChat?.historyLimit ?? historyLimit);
    const sourceGroupConfig = resolveFeishuGroupConfig({ cfg: sourceAccount.config, groupId: dc.ctx.chatId });
    const sourceDefaultGroupConfig = sourceAccount.config?.groups?.['*'];
    const currentDisplayName = dc.account.name ?? dc.route.agentId;
    const returnText = buildAgentReturnTaskText({
        sourceDisplayName: currentDisplayName,
        cleanedTaskText: completedHandoffText?.trim() || completedReplyText?.trim(),
        handoffRound,
        maxRounds: handoffSettings.maxRounds,
        sourceAgentId: dc.route.agentId,
    });
    const handoffPath = Array.isArray(syntheticMeta?.handoffPath) ? syntheticMeta.handoffPath : [];
    const nextPath = handoffPath.includes(dc.route.agentId)
        ? handoffPath
        : [...handoffPath, dc.route.agentId];
    const syntheticMessageId = `${replyToMessageId ?? dc.ctx.messageId}:agent-return:${dc.route.agentId}:${notifySource.agentId}:${Date.now()}`;
    const syntheticCtx = {
        chatId: dc.ctx.chatId,
        messageId: syntheticMessageId,
        senderId: `agent:${dc.route.agentId}`,
        senderName: currentDisplayName,
        chatType: dc.ctx.chatType,
        content: returnText,
        contentType: 'text',
        resources: [],
        mentions: [],
        threadId: dc.ctx.threadId,
        rawMessage: {
            message_id: syntheticMessageId,
            chat_id: dc.ctx.chatId,
            chat_type: dc.ctx.chatType,
            message_type: 'text',
            content: JSON.stringify({ text: returnText }),
            thread_id: dc.ctx.threadId,
            create_time: String(Date.now()),
        },
        rawSender: {
            sender_id: { open_id: `agent:${dc.route.agentId}` },
            sender_type: 'app',
        },
    };
    const syntheticRuntime = {
        log: (message) => dc.log(message),
        error: (message) => dc.error(message),
    };
    const { status, promise } = enqueueFeishuChatTask({
        accountId: notifySource.accountId,
        chatId: dc.ctx.chatId,
        threadId: dc.ctx.threadId,
        task: async () => {
            await dispatchToAgent({
                ctx: syntheticCtx,
                permissionError: undefined,
                mediaPayload: {},
                quotedContent: undefined,
                account: sourceAccount,
                accountScopedCfg: sourceAccountScopedCfg,
                runtime: syntheticRuntime,
                chatHistories,
                historyLimit: sourceHistoryLimit,
                replyToMessageId: replyToMessageId ?? dc.ctx.messageId,
                commandAuthorized: false,
                groupConfig: sourceGroupConfig,
                defaultGroupConfig: sourceDefaultGroupConfig,
                skipTyping: true,
                syntheticMeta: {
                    handoffDepth: handoffRound,
                    handoffPath: nextPath,
                    returnedFromAgentId: dc.route.agentId,
                    notifySource: remainingReturnChain[0],
                    returnChain: remainingReturnChain,
                },
            });
        },
    });
    dc.log(`feishu[${dc.account.accountId}]: queued agent result return ${dc.route.agentId} -> ${notifySource.agentId} (round ${handoffRound}/${handoffSettings.maxRounds}, ${status})`);
    void promise.catch((err) => {
        dc.error(`feishu[${dc.account.accountId}]: failed queued result return ${dc.route.agentId} -> ${notifySource.agentId}: ${String(err)}`);
    });
}
// ---------------------------------------------------------------------------
// Internal: normal message dispatch
// ---------------------------------------------------------------------------
/**
 * Dispatch a normal (non-command) message via the streaming card flow.
 * Cleans up consumed history entries after dispatch completes.
 *
 * Note: history cleanup is intentionally placed here and NOT in the
 * system-command path — command handlers don't consume history context,
 * so the entries should be preserved for the next normal message.
 */
async function dispatchNormalMessage(dc, ctxPayload, chatHistories, historyKey, historyLimit, replyToMessageId, skillFilter, skipTyping, syntheticMeta) {
    // Abort messages should never create streaming cards — dispatch via the
    // plain-text system-command path so the SDK's abort handler can reply
    // without touching CardKit.
    if (isLikelyAbortText(dc.ctx.content?.trim() ?? '')) {
        dc.log(`feishu[${dc.account.accountId}]: abort message detected, using plain-text dispatch`);
        log.info('abort message detected, using plain-text dispatch');
        await dispatchSystemCommand(dc, ctxPayload, false, replyToMessageId);
        return;
    }
    const { dispatcher, replyOptions, markDispatchIdle, markFullyComplete, abortCard, getCompletedReplyText, getCompletedHandoffText, getCompletedMentionTargets } = createFeishuReplyDispatcher({
        cfg: dc.accountScopedCfg,
        agentId: dc.route.agentId,
        chatId: dc.ctx.chatId,
        replyToMessageId: replyToMessageId ?? dc.ctx.messageId,
        accountId: dc.account.accountId,
        chatType: dc.ctx.chatType,
        skipTyping,
        replyInThread: dc.isThread,
    });
    // Create an AbortController so the abort fast-path can cancel the
    // underlying LLM request (not just the streaming card UI).
    const abortController = new AbortController();
    // Register the active dispatcher so the monitor abort fast-path can
    // terminate the streaming card before this task completes.
    const queueKey = buildQueueKey(dc.account.accountId, dc.ctx.chatId, dc.ctx.threadId);
    registerActiveDispatcher(queueKey, { abortCard, abortController });
    const effectiveSessionKey = dc.threadSessionKey ?? dc.route.sessionKey;
    dc.log(`feishu[${dc.account.accountId}]: dispatching to agent (session=${effectiveSessionKey})`);
    log.info(`dispatching to agent (session=${effectiveSessionKey})`);
    try {
        const handoffSettings = resolveAgentHandoffSettings(dc.accountScopedCfg);
        if (getImmediateNotifySource(syntheticMeta) && handoffSettings.autoReceipt) {
            await sendAgentHandoffStatusMessage({
                dc,
                replyToMessageId,
                phase: 'accepted',
                syntheticMeta,
                handoffSettings,
            });
        }
        const { queuedFinal, counts } = await dc.core.channel.reply.dispatchReplyFromConfig({
            ctx: ctxPayload,
            cfg: dc.accountScopedCfg,
            dispatcher,
            replyOptions: {
                ...replyOptions,
                abortSignal: abortController.signal,
                ...(skillFilter ? { skillFilter } : {}),
            },
        });
        // Wait for all enqueued deliver() calls in the SDK's sendChain to
        // complete before marking the dispatch as done.  Without this,
        // dispatchReplyFromConfig() may return while the final deliver() is
        // still pending in the Promise chain, causing markFullyComplete() to
        // block it and leaving completedText incomplete — which in turn makes
        // the streaming card's final update show truncated content.
        await dispatcher.waitForIdle();
        markFullyComplete();
        markDispatchIdle();
        // Clean up consumed history entries
        if (dc.isGroup && historyKey && chatHistories) {
            clearHistoryEntriesIfEnabled({
                historyMap: chatHistories,
                historyKey,
                limit: historyLimit,
            });
        }
        dc.log(`feishu[${dc.account.accountId}]: dispatch complete (queuedFinal=${queuedFinal}, replies=${counts.final})`);
        log.info(`dispatch complete (replies=${counts.final}, elapsed=${ticketElapsed()}ms)`);
        await dispatchAgentMentionHandoffs({
            dc,
            chatHistories,
            completedReplyText: getCompletedReplyText?.() ?? '',
            completedHandoffText: getCompletedHandoffText?.() ?? '',
            completedMentionTargets: getCompletedMentionTargets?.() ?? [],
            historyLimit,
            replyToMessageId,
            syntheticMeta,
        });
        await dispatchAgentResultReturn({
            dc,
            chatHistories,
            completedReplyText: getCompletedReplyText?.() ?? '',
            completedHandoffText: getCompletedHandoffText?.() ?? '',
            historyLimit,
            replyToMessageId,
            syntheticMeta,
        });
        if (getImmediateNotifySource(syntheticMeta) && handoffSettings.autoComplete) {
            await sendAgentHandoffStatusMessage({
                dc,
                replyToMessageId,
                phase: 'completed',
                syntheticMeta,
                handoffSettings,
            });
        }
    }
    finally {
        unregisterActiveDispatcher(queueKey);
    }
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function dispatchToAgent(params) {
    // 1. Derive shared context (including route resolution + system event)
    const dc = buildDispatchContext(params);
    // 1b. Resolve thread session isolation (async: may query group info API)
    if (dc.isThread && dc.ctx.threadId) {
        dc.threadSessionKey = await resolveThreadSessionKey({
            accountScopedCfg: dc.accountScopedCfg,
            account: dc.account,
            chatId: dc.ctx.chatId,
            threadId: dc.ctx.threadId,
            baseSessionKey: dc.route.sessionKey,
        });
    }
    // 2. Build annotated message body
    const messageBody = buildMessageBody(params.ctx, params.quotedContent);
    // 3. Permission-error notification (optional side-effect).
    //    Isolated so a failure here does not block the main message dispatch.
    if (params.permissionError) {
        try {
            await dispatchPermissionNotification(dc, params.permissionError, params.replyToMessageId);
        }
        catch (err) {
            dc.error(`feishu[${dc.account.accountId}]: permission notification failed, continuing: ${String(err)}`);
        }
    }
    // 4. Build main envelope (with group chat history)
    const { combinedBody, historyKey } = buildEnvelopeWithHistory(dc, messageBody, params.chatHistories, params.historyLimit);
    // 5. Build BodyForAgent with mention annotation (if any).
    //    SDK >= 2026.2.10 no longer falls back to Body for BodyForAgent,
    //    so we must set it explicitly to preserve the annotation.
    const bodyForAgent = buildBodyForAgent(params.ctx);
    // 6. Build InboundHistory for SDK metadata injection (>= 2026.2.10).
    //    The SDK's buildInboundUserContextPrefix renders these as structured
    //    JSON blocks; earlier SDK versions simply ignore unknown fields.
    const threadHistoryKey = threadScopedKey(dc.ctx.chatId, dc.isThread ? dc.ctx.threadId : undefined);
    const inboundHistory = dc.isGroup && params.chatHistories && params.historyLimit > 0
        ? (params.chatHistories.get(threadHistoryKey) ?? []).map((entry) => ({
            sender: entry.sender,
            body: entry.body,
            timestamp: entry.timestamp ?? Date.now(),
        }))
        : undefined;
    // 7. Build inbound context payload
    const isBareNewOrReset = /^\/(?:new|reset)\s*$/i.test((params.ctx.content ?? '').trim());
    const groupSystemPrompt = dc.isGroup
        ? params.groupConfig?.systemPrompt?.trim() || params.defaultGroupConfig?.systemPrompt?.trim() || undefined
        : undefined;
    const originatingTo = isBareNewOrReset && dc.isThread
        ? encodeFeishuRouteTarget({
            target: dc.feishuTo,
            replyToMessageId: params.replyToMessageId ?? params.ctx.messageId,
            threadId: dc.ctx.threadId,
        })
        : undefined;
    const ctxPayload = buildInboundPayload(dc, {
        body: combinedBody,
        bodyForAgent,
        rawBody: params.ctx.content,
        commandBody: params.ctx.content,
        originatingTo,
        senderName: params.ctx.senderName ?? params.ctx.senderId,
        senderId: params.ctx.senderId,
        messageSid: params.ctx.messageId,
        wasMentioned: mentionedBot(params.ctx),
        replyToBody: params.quotedContent,
        inboundHistory,
        extraFields: {
            ...params.mediaPayload,
            ...(groupSystemPrompt ? { GroupSystemPrompt: groupSystemPrompt } : {}),
            ...(dc.ctx.threadId ? { MessageThreadId: dc.ctx.threadId } : {}),
        },
    });
    // 8a. Intercept /feishu commands for i18n multi-locale card dispatch
    //     Must run BEFORE the SDK command check — the SDK does not recognise
    //     plugin-registered commands via isControlCommandMessage, so
    //     /feishu_* falls through to the AI agent otherwise.
    const contentTrimmed = (params.ctx.content ?? '').trim();
    const isDoctorCommand = /^\/feishu[_ ]doctor\s*$/i.test(contentTrimmed);
    const isAuthCommand = /^\/feishu[_ ](?:auth|onboarding)\s*$/i.test(contentTrimmed);
    const isStartCommand = /^\/feishu[_ ]start\s*$/i.test(contentTrimmed);
    const isHelpCommand = /^\/feishu(?:[_ ]help)?\s*$/i.test(contentTrimmed);
    const i18nCommandName = isDoctorCommand
        ? 'doctor'
        : isAuthCommand
            ? 'auth'
            : isStartCommand
                ? 'start'
                : isHelpCommand
                    ? 'help'
                    : null;
    if (i18nCommandName) {
        dc.log(`feishu[${dc.account.accountId}]: ${i18nCommandName} command detected, using i18n dispatch`);
        log.info(`${i18nCommandName} command detected, using i18n dispatch`);
        try {
            let i18nTexts;
            if (isDoctorCommand) {
                i18nTexts = await runFeishuDoctorI18n(dc.accountScopedCfg, dc.account.accountId);
            }
            else if (isAuthCommand) {
                i18nTexts = await runFeishuAuthI18n(dc.accountScopedCfg);
            }
            else if (isStartCommand) {
                i18nTexts = runFeishuStartI18n(dc.accountScopedCfg);
            }
            else {
                i18nTexts = getFeishuHelpI18n();
            }
            const card = buildI18nMarkdownCard(i18nTexts);
            await sendCardFeishu({
                cfg: dc.accountScopedCfg,
                to: dc.ctx.chatId,
                card,
                replyToMessageId: params.replyToMessageId ?? dc.ctx.messageId,
                accountId: dc.account.accountId,
                replyInThread: dc.isThread,
            });
        }
        catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            dc.error(`feishu[${dc.account.accountId}]: ${i18nCommandName} i18n dispatch failed: ${errMsg}`);
            await sendMessageFeishu({
                cfg: dc.accountScopedCfg,
                to: dc.ctx.chatId,
                text: `${i18nCommandName} failed: ${errMsg}`,
                replyToMessageId: params.replyToMessageId ?? dc.ctx.messageId,
                accountId: dc.account.accountId,
                replyInThread: dc.isThread,
            });
        }
        return;
    }
    // 8. Dispatch: system command vs. normal message
    const isCommand = dc.core.channel.commands.isControlCommandMessage(params.ctx.content, params.accountScopedCfg);
    // Resolve per-group skill filter (per-group > default "*")
    const skillFilter = dc.isGroup ? (params.groupConfig?.skills ?? params.defaultGroupConfig?.skills) : undefined;
    if (isCommand) {
        await dispatchSystemCommand(dc, ctxPayload, isBareNewOrReset, params.replyToMessageId);
        // /new and /reset explicitly start a new session — clear pending history
        if (isBareNewOrReset && dc.isGroup && historyKey && params.chatHistories) {
            clearHistoryEntriesIfEnabled({
                historyMap: params.chatHistories,
                historyKey,
                limit: params.historyLimit,
            });
        }
    }
    else {
        // Normal message dispatch; history cleanup happens inside.
        // System commands intentionally skip history cleanup — command handlers
        // don't consume history context, so entries are preserved for the next
        // normal message.
        await dispatchNormalMessage(dc, ctxPayload, params.chatHistories, historyKey, params.historyLimit, params.replyToMessageId, skillFilter, params.skipTyping, params.syntheticMeta);
    }
}
