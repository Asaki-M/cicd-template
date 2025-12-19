#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { toTest } from "../core/toTest.js";
import { formatCliError } from "../utils/log.js";

type PackageJson = { name?: string; version?: string; description?: string };

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as PackageJson;

const program = new Command();
program
  .name("to-test")
  .description("Merge current branch into target test branch and push.")
  .version(pkg.version ?? "0.0.0")
  .option("-b, --branch <name>", "target test branch name (default: test)")
  .action(async (options: { branch?: string }) => {
    await toTest({
      branch: options.branch,
    });
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${formatCliError(program.name(), message)}\n`);
  process.exitCode = 1;
});
