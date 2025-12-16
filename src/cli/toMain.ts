#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { toMain } from "../core/toMain.js";
import { formatCliError } from "../utils/log.js";

type PackageJson = { name?: string; version?: string; description?: string };

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as PackageJson;

const program = new Command();
program
  .name("to-main")
  .description("Push current branch and create an MR/PR into target branch.")
  .version(pkg.version ?? "0.0.0")
  .option("-C, --cwd <path>", "run as if started in <path>")
  .option("-b, --branch <name>", "target branch name (default: main)")
  .option("-t, --type <type>", "commit type prefix (feat/fix/to/docs/style/refactor/perf/test/chore/revert/merge/sync)")
  .option("-m, --message <msg>", "commit message (skip interactive prompt)")
  .action(async (options: { cwd?: string; branch?: string; message?: string; type?: string }) => {
    await toMain({
      cwd: options.cwd,
      branch: options.branch,
      commitMessage: options.message,
      commitType: options.type,
    });
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${formatCliError(program.name(), message)}\n`);
  process.exitCode = 1;
});
