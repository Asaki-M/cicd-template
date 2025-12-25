#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { toInit } from "../core/init/toInit.js";
import { formatCliError } from "../utils/log.js";

type PackageJson = { name?: string; version?: string; description?: string };

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as PackageJson;

const program = new Command();
program
  .name("to-init")
  .description("Initialize CI/CD workflow file from templates (GitHub/GitLab).")
  .version(pkg.version ?? "0.0.0")
  .option("--cwd <path>", "target project directory (default: current working directory)")
  .option("-p, --platform <name>", "platform: github|gitlab")
  .option("-o, --output <path>", "output file path (relative to --cwd)")
  .option("--force", "overwrite existing file without prompt")
  .action(async (options: { cwd?: string; platform?: string; output?: string; force?: boolean }) => {
    const platform = options.platform === "github" || options.platform === "gitlab" ? options.platform : undefined;
    await toInit({
      cwd: options.cwd,
      platform,
      output: options.output,
      force: Boolean(options.force),
    });
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${formatCliError(program.name(), message)}\n`);
  process.exitCode = 1;
});

