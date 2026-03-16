#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");

function expandHome(input) {
  if (!input.startsWith("~")) {
    return input;
  }
  return path.join(os.homedir(), input.slice(1));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mergeAgentNames(targetCfg, templateCfg) {
  const targetAgents = Array.isArray(targetCfg?.agents?.list)
    ? targetCfg.agents.list
    : Array.isArray(targetCfg?.agents)
      ? targetCfg.agents
      : [];

  const templateAgents = Array.isArray(templateCfg?.agents?.list)
    ? templateCfg.agents.list
    : Array.isArray(templateCfg?.agents)
      ? templateCfg.agents
      : [];

  if (templateAgents.length === 0 || targetAgents.length === 0) {
    return;
  }

  const nameById = new Map(
    templateAgents
      .filter((agent) => agent && typeof agent.id === "string" && typeof agent.name === "string")
      .map((agent) => [agent.id, agent.name])
  );

  for (const agent of targetAgents) {
    if (!agent || typeof agent.id !== "string") {
      continue;
    }
    const nextName = nameById.get(agent.id);
    if (nextName) {
      agent.name = nextName;
    }
  }
}

function mergeFeishuAccounts(targetCfg, templateCfg) {
  targetCfg.channels = ensureObject(targetCfg.channels);
  targetCfg.channels.feishu = ensureObject(targetCfg.channels.feishu);

  const targetAccounts = ensureObject(targetCfg.channels.feishu.accounts);
  const templateAccounts = ensureObject(templateCfg?.channels?.feishu?.accounts);

  for (const [accountId, templateAccount] of Object.entries(templateAccounts)) {
    const current = ensureObject(targetAccounts[accountId]);
    targetAccounts[accountId] = {
      ...current,
      ...templateAccount
    };
  }

  targetCfg.channels.feishu.accounts = targetAccounts;
}

function mergeAgentHandoff(targetCfg, templateCfg) {
  targetCfg.channels = ensureObject(targetCfg.channels);
  targetCfg.channels.feishu = ensureObject(targetCfg.channels.feishu);

  const current = ensureObject(targetCfg.channels.feishu.agentHandoff);
  const incoming = ensureObject(templateCfg?.channels?.feishu?.agentHandoff);

  targetCfg.channels.feishu.agentHandoff = {
    ...current,
    ...incoming
  };
}

function main() {
  const targetPath = path.resolve(expandHome(process.argv[2] || "~/.openclaw/openclaw.json"));
  const templatePath = path.resolve(
    expandHome(
      process.argv[3] ||
        path.join(__dirname, "..", "templates", "feishu-agent-handoff.config.json")
    )
  );

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Target config not found: ${targetPath}`);
  }

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template config not found: ${templatePath}`);
  }

  const targetCfg = readJson(targetPath);
  const templateCfg = readJson(templatePath);

  mergeAgentNames(targetCfg, templateCfg);
  mergeFeishuAccounts(targetCfg, templateCfg);
  mergeAgentHandoff(targetCfg, templateCfg);

  const backupPath = `${targetPath}.bak.handoff-${new Date().toISOString().replace(/[:]/g, "-")}`;
  fs.copyFileSync(targetPath, backupPath);
  fs.writeFileSync(targetPath, `${JSON.stringify(targetCfg, null, 2)}\n`, "utf8");

  console.log(`Merged handoff config into: ${targetPath}`);
  console.log(`Backup saved to: ${backupPath}`);
}

main();
