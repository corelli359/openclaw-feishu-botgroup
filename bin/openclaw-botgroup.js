#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const installScript = path.join(rootDir, "scripts", "install-feishu-agent-handoff.sh");
const mergeScript = path.join(rootDir, "scripts", "merge-feishu-agent-handoff-config.js");
const configTemplate = path.join(rootDir, "templates", "feishu-agent-handoff.config.json");
const agentTemplate = path.join(rootDir, "templates", "agent-collaboration.AGENTS.md");

function printHelp() {
  console.log(`openclaw-botgroup

Usage:
  openclaw-botgroup install [--openclaw-home PATH] [--plugin-dir PATH] [--no-restart]
  openclaw-botgroup merge-config [target-config] [template-config]
  openclaw-botgroup print-config-template
  openclaw-botgroup print-agent-template
  openclaw-botgroup help
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

  process.exit(result.status || 0);
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

  if (subcommand === "merge-config") {
    run(process.execPath, [mergeScript, ...args]);
    return;
  }

  if (subcommand === "install") {
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

    run("bash", [installScript, ...passthrough], { env });
    return;
  }

  printHelp();
  process.exit(1);
}

main();
