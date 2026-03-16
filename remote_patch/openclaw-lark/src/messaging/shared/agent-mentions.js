"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Agent mention discovery and parsing helpers.
 *
 * Supports matching against multiple visible names for the same target:
 * - agentId
 * - bound Feishu accountId
 * - agent.name
 * - channels.feishu.accounts.<accountId>.name
 * - Feishu botName resolved from bot/v3/info
 */
import { getLarkAccount } from '../../core/accounts';
import { LarkClient } from '../../core/lark-client';
const DIRECTORY_CACHE_TTL_MS = 30_000;
const MENTION_END_BOUNDARY = '(?=$|[\\s\\n,.!?;:，。！？；：、)）\\]】}>])';
let cachedDirectory = null;
let cachedDirectoryAt = 0;
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function normalizeName(value) {
    if (typeof value !== 'string')
        return '';
    return value.trim();
}
function normalizeAliasKey(value) {
    return normalizeName(value).toLocaleLowerCase();
}
function getAgentsList(cfg) {
    if (Array.isArray(cfg?.agents)) {
        return cfg.agents;
    }
    if (Array.isArray(cfg?.agents?.list)) {
        return cfg.agents.list;
    }
    return [];
}
function getFeishuBindings(cfg) {
    return Array.isArray(cfg?.bindings)
        ? cfg.bindings.filter((binding) => binding?.agentId && binding?.match?.accountId && binding?.match?.channel === 'feishu')
        : [];
}
function resolveAgentAccountId(cfg, agentId) {
    const binding = getFeishuBindings(cfg).find((entry) => entry.agentId === agentId);
    return normalizeName(binding?.match?.accountId) || agentId;
}
async function resolveBotIdentity(cfg, accountId) {
    const account = getLarkAccount(cfg, accountId);
    let botOpenId;
    let botName = normalizeName(account.name);
    if (!account.configured) {
        return { botOpenId, botName };
    }
    try {
        const client = LarkClient.fromCfg(cfg, accountId);
        botOpenId = client.botOpenId;
        botName = botName || normalizeName(client.botName);
        if (!botOpenId || !botName) {
            const probe = await client.probe({ maxAgeMs: 300_000 });
            if (probe?.ok) {
                botOpenId = botOpenId || probe.botOpenId || undefined;
                botName = botName || normalizeName(probe.botName);
            }
        }
    }
    catch {
        // Best-effort only; fallback names still allow synthetic handoff.
    }
    return { botOpenId, botName };
}
function normalizeMentionBody(text) {
    return text
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
function collectTarget(entry, seenTargets) {
    if (!seenTargets.has(entry.agentId)) {
        seenTargets.set(entry.agentId, entry);
    }
}
export async function getAgentMentionDirectory(cfg) {
    const globalCfg = LarkClient.globalConfig ?? cfg;
    const now = Date.now();
    if (cachedDirectory && now - cachedDirectoryAt < DIRECTORY_CACHE_TTL_MS) {
        return cachedDirectory;
    }
    const agents = getAgentsList(globalCfg);
    const directory = [];
    for (const agent of agents) {
        const agentId = normalizeName(agent?.id);
        if (!agentId) {
            continue;
        }
        const accountId = resolveAgentAccountId(globalCfg, agentId);
        const account = getLarkAccount(globalCfg, accountId);
        const { botOpenId, botName } = await resolveBotIdentity(globalCfg, accountId);
        const names = new Set();
        for (const value of [agentId, accountId, agent?.name, account?.name, botName]) {
            const normalized = normalizeName(value);
            if (normalized) {
                names.add(normalized);
            }
        }
        directory.push({
            agentId,
            accountId,
            displayName: botName || normalizeName(account?.name) || normalizeName(agent?.name) || agentId,
            botOpenId,
            names: [...names],
        });
    }
    cachedDirectory = directory;
    cachedDirectoryAt = now;
    return directory;
}
export function extractAgentMentions(params) {
    const { text, directory, currentAgentId, currentAccountId } = params;
    const rawText = typeof text === 'string' ? text : '';
    const hasPlainMention = rawText.includes('@');
    const hasAtTagMention = /<at\s+(?:id|open_id|user_id)\s*=/iu.test(rawText);
    if ((!hasPlainMention && !hasAtTagMention) || directory.length === 0) {
        return {
            cleanedText: rawText,
            targets: [],
        };
    }
    const aliasToEntries = new Map();
    for (const entry of directory) {
        if (entry.agentId === currentAgentId || entry.accountId === currentAccountId) {
            continue;
        }
        for (const name of entry.names) {
            const key = normalizeAliasKey(name);
            if (!key) {
                continue;
            }
            const list = aliasToEntries.get(key) ?? [];
            list.push({ entry, name });
            aliasToEntries.set(key, list);
        }
    }
    const uniqueAliasToEntry = new Map([...aliasToEntries.entries()]
        .filter(([, matches]) => matches.length === 1)
        .map(([key, matches]) => [key, matches[0].entry]));
    const candidates = [...aliasToEntries.entries()]
        .filter(([, matches]) => matches.length === 1)
        .map(([, matches]) => matches[0])
        .sort((left, right) => right.name.length - left.name.length);
    const seenTargets = new Map();
    let cleanedText = rawText;
    const openIdToEntry = new Map();
    for (const entry of directory) {
        if (entry.agentId === currentAgentId || entry.accountId === currentAccountId || !entry.botOpenId) {
            continue;
        }
        openIdToEntry.set(entry.botOpenId, entry);
    }
    for (const candidate of candidates) {
        const pattern = new RegExp(`@${escapeRegExp(candidate.name)}${MENTION_END_BOUNDARY}`, 'giu');
        cleanedText = cleanedText.replace(pattern, () => {
            collectTarget(candidate.entry, seenTargets);
            return '';
        });
    }
    cleanedText = cleanedText.replace(/<at\s+(?:id|open_id|user_id)\s*=\s*"?([^">\s]+)"?[^>]*>(.*?)<\/at>/giu, (fullMatch, targetId, label) => {
        const entry = openIdToEntry.get(String(targetId)) ??
            uniqueAliasToEntry.get(normalizeAliasKey(String(label).replace(/<[^>]*>/g, '')));
        if (!entry) {
            return fullMatch;
        }
        collectTarget(entry, seenTargets);
        return '';
    });
    return {
        cleanedText: normalizeMentionBody(cleanedText),
        targets: [...seenTargets.values()],
    };
}
