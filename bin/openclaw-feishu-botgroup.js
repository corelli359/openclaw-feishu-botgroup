#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const installScript = path.join(rootDir, "scripts", "install-feishu-agent-handoff.sh");
const initScript = path.join(rootDir, "scripts", "init-feishu-agent-handoff-config.js");
const mergeScript = path.join(rootDir, "scripts", "merge-feishu-agent-handoff-config.js");
const configTemplate = path.join(rootDir, "templates", "feishu-agent-handoff.config.json");
const agentTemplate = path.join(rootDir, "templates", "agent-collaboration.AGENTS.md");
const defaultCommandName = "openclaw-feishu-botgroup";

function expandHome(input) {
  if (!input.startsWith("~")) {
    return input;
  }
  return path.join(os.homedir(), input.slice(1));
}

function resolveCommandName() {
  const invokedPath = process.argv[1];
  if (!invokedPath) {
    return defaultCommandName;
  }
  return path.basename(invokedPath) || defaultCommandName;
}

function printHelp() {
  const commandName = resolveCommandName();
  console.log(`${commandName}

Usage:
  ${commandName} setup [--openclaw-home PATH] [--plugin-dir PATH] [--no-restart] [target-config] [output-config]
  ${commandName} install [--openclaw-home PATH] [--plugin-dir PATH] [--no-restart]
  ${commandName} init-config [target-config] [output-config]
  ${commandName} merge-config [target-config] [template-config]
  ${commandName} print-config-template
  ${commandName} print-agent-template
  ${commandName} help

Notes:
  install requires an existing official Feishu openclaw-lark plugin install.
  setup is the recommended guided flow after the official plugin is installed.
  init-config discovers your current bots/accounts and scaffolds a local config.
`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: options.env || process.env
  });

  if (result.error) {
    throw result.error;
  }

  return result.status || 0;
}

function runOrExit(command, args, options = {}) {
  process.exit(run(command, args, options));
}

function parseInstallOptions(args) {
  const env = { ...process.env };
  const passthrough = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--openclaw-home") {
      env.OPENCLAW_HOME = args[index + 1];
      index += 1;
      continue;
    }
    if (value === "--plugin-dir") {
      env.PLUGIN_DIR = args[index + 1];
      index += 1;
      continue;
    }
    if (value === "--no-restart") {
      env.RESTART_GATEWAY = "0";
      continue;
    }
    passthrough.push(value);
  }

  return { env, passthrough };
}

function resolveSetupPaths(env, passthrough) {
  const openclawHome = path.resolve(expandHome(env.OPENCLAW_HOME || "~/.openclaw"));
  const targetConfig = path.resolve(expandHome(passthrough[0] || path.join(openclawHome, "openclaw.json")));
  const outputConfig = path.resolve(
    expandHome(passthrough[1] || path.join(openclawHome, "feishu-agent-handoff.config.json"))
  );

  return { targetConfig, outputConfig };
}

function runSetup(args) {
  const { env, passthrough } = parseInstallOptions(args);
  env.OPENCLAW_BOTGROUP_SETUP = "1";
  const { targetConfig, outputConfig } = resolveSetupPaths(env, passthrough);

  console.log("== Step 1/3: Patch local openclaw-lark plugin ==");
  let status = run("bash", [installScript], { env });
  if (status !== 0) {
    process.exit(status);
  }

  console.log("");
  console.log("== Step 2/3: Initialize local handoff config from current bots/accounts ==");
  status = run(process.execPath, [initScript, targetConfig, outputConfig], { env });
  if (status !== 0) {
    process.exit(status);
  }

  console.log("");
  console.log("== Step 3/3: Merge local handoff config into openclaw.json ==");
  status = run(process.execPath, [mergeScript, targetConfig, outputConfig], { env });
  if (status !== 0) {
    process.exit(status);
  }

  console.log("");
  console.log("Setup completed.");
  console.log("Next step: add templates/agent-collaboration.AGENTS.md rules into each agent prompt file.");
  console.log("Then test bot mentions and handoff flow in your Feishu group.");
}

function main() {
  const [, , subcommand = "help", ...args] = process.argv;

  if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    printHelp();
    return;
  }

  if (subcommand === "print-config-template") {
    process.stdout.write(fs.readFileSync(configTemplate, "utf8"));
    return;
  }

  if (subcommand === "print-agent-template") {
    process.stdout.write(fs.readFileSync(agentTemplate, "utf8"));
    return;
  }

  if (subcommand === "setup") {
    runSetup(args);
    return;
  }

  if (subcommand === "merge-config") {
    runOrExit(process.execPath, [mergeScript, ...args]);
    return;
  }

  if (subcommand === "init-config") {
    runOrExit(process.execPath, [initScript, ...args]);
    return;
  }

  if (subcommand === "install") {
    const { env, passthrough } = parseInstallOptions(args);
    runOrExit("bash", [installScript, ...passthrough], { env });
    return;
  }

  printHelp();
  process.exit(1);
}

main();
