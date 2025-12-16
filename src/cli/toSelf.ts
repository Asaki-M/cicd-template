#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { toSelf } from "../core/toSelf.js";
import { formatCliError } from "../utils/log.js";

type PackageJson = { name?: string; version?: string; description?: string };

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as PackageJson;

const program = new Command();
program
  .name("to-self")
  .description(pkg.description ?? "Commit (if needed) and push current branch.")
  .version(pkg.version ?? "0.0.0")
  .option("-C, --cwd <path>", "run as if started in <path>")
  .option("-t, --type <type>", "commit type prefix (feat/fix/to/docs/style/refactor/perf/test/chore/revert/merge/sync)")
  .option("-m, --message <msg>", "commit message (skip interactive prompt)")
  .action(async (options: { cwd?: string; message?: string; type?: string }) => {
    await toSelf({ cwd: options.cwd, commitMessage: options.message, commitType: options.type });
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${formatCliError(program.name(), message)}\n`);
  process.exitCode = 1;
});
