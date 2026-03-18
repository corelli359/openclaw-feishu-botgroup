#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline/promises");

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

function normalizeName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getTargetAgents(targetCfg) {
  if (Array.isArray(targetCfg?.agents?.list)) {
    return targetCfg.agents.list;
  }
  if (Array.isArray(targetCfg?.agents)) {
    return targetCfg.agents;
  }
  return [];
}

function getFeishuAccounts(targetCfg) {
  return ensureObject(targetCfg?.channels?.feishu?.accounts);
}

function collectBots(targetCfg) {
  const targetAgents = getTargetAgents(targetCfg);
  const feishuAccounts = getFeishuAccounts(targetCfg);
  const bots = [];
  const byId = new Map();

  for (const agent of targetAgents) {
    if (!agent || typeof agent.id !== "string" || agent.id.trim() === "") {
      continue;
    }
    const id = agent.id;
    const currentName = normalizeName(agent.name);
    const next = {
      id,
      currentName,
      hasAgent: true,
      hasAccount: Object.prototype.hasOwnProperty.call(feishuAccounts, id)
    };
    bots.push(next);
    byId.set(id, next);
  }

  for (const [accountId, accountCfg] of Object.entries(feishuAccounts)) {
    if (typeof accountId !== "string" || accountId.trim() === "") {
      continue;
    }
    const existing = byId.get(accountId);
    const accountName = normalizeName(accountCfg?.name);
    if (existing) {
      if (!existing.currentName && accountName) {
        existing.currentName = accountName;
      }
      existing.hasAccount = true;
      continue;
    }

    const next = {
      id: accountId,
      currentName: accountName,
      hasAgent: false,
      hasAccount: true
    };
    bots.push(next);
    byId.set(accountId, next);
  }

  return bots;
}

function buildConfig(targetCfg, defaultsCfg, namesById) {
  const targetAgents = getTargetAgents(targetCfg);
  const targetAccounts = getFeishuAccounts(targetCfg);
  const result = {
    agents: {
      list: []
    },
    channels: {
      feishu: {
        accounts: {},
        agentHandoff: ensureObject(defaultsCfg?.channels?.feishu?.agentHandoff)
      }
    }
  };

  for (const agent of targetAgents) {
    if (!agent || typeof agent.id !== "string" || agent.id.trim() === "") {
      continue;
    }
    result.agents.list.push({
      id: agent.id,
      name: namesById.get(agent.id) || ""
    });
  }

  for (const [accountId] of Object.entries(targetAccounts)) {
    result.channels.feishu.accounts[accountId] = {
      name: namesById.get(accountId) || ""
    };
  }

  if (result.agents.list.length === 0) {
    delete result.agents;
  }

  if (Object.keys(result.channels.feishu.accounts).length === 0) {
    delete result.channels.feishu.accounts;
  }

  return result;
}

async function promptForNames(bots) {
  const namesById = new Map();

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    for (const bot of bots) {
      namesById.set(bot.id, bot.currentName || "");
    }
    return namesById;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    console.log("Discovered bot IDs from the current OpenClaw config.");
    console.log("Fill in the visible bot names shown in Feishu group mentions.");
    console.log("Press Enter to keep the current value.");
    console.log("");

    for (const bot of bots) {
      const hint = bot.currentName ? ` [${bot.currentName}]` : "";
      const answer = await rl.question(`Feishu display name for "${bot.id}"${hint}: `);
      const name = normalizeName(answer) || bot.currentName || "";
      namesById.set(bot.id, name);
    }
  } finally {
    rl.close();
  }

  return namesById;
}

async function main() {
  const targetPath = path.resolve(expandHome(process.argv[2] || "~/.openclaw/openclaw.json"));
  const outputPath = path.resolve(
    expandHome(process.argv[3] || "~/.openclaw/feishu-agent-handoff.config.json")
  );
  const defaultsPath = path.resolve(
    path.join(__dirname, "..", "templates", "feishu-agent-handoff.config.json")
  );

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Target config not found: ${targetPath}`);
  }

  if (!fs.existsSync(defaultsPath)) {
    throw new Error(`Default config template not found: ${defaultsPath}`);
  }

  const targetCfg = readJson(targetPath);
  const defaultsCfg = readJson(defaultsPath);
  const bots = collectBots(targetCfg);
  const namesById = await promptForNames(bots);
  const nextCfg = buildConfig(targetCfg, defaultsCfg, namesById);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(nextCfg, null, 2)}\n`, "utf8");

  console.log(`Initialized local handoff config: ${outputPath}`);
  console.log(`Discovered bot IDs: ${bots.length}`);
  console.log(`Target OpenClaw config: ${targetPath}`);

  if (process.env.OPENCLAW_BOTGROUP_SETUP !== "1") {
    console.log("");
    console.log("Next step:");
    console.log(`  node bin/openclaw-feishu-botgroup.js merge-config ${targetPath} ${outputPath}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
