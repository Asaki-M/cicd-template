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
  .action(async () => {
    await toSelf();
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${formatCliError(program.name(), message)}\n`);
  process.exitCode = 1;
});
