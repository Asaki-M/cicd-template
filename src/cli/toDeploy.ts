#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { toDeploy } from "../core/deploy/toDeploy.js";
import { formatCliError } from "../utils/log.js";

type PackageJson = { name?: string; version?: string; description?: string };

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as PackageJson;

const program = new Command();
program
  .name("to-deploy")
  .description("Sample CD deploy command (template-based). Dry-run by default.")
  .version(pkg.version ?? "0.0.0")
  .option("-e, --env <name>", "deploy environment (default: staging)")
  .option("-a, --app <name>", "application name (default: current folder name)")
  .option("-r, --revision <revision>", "version/revision (default: git short SHA or 'local')")
  .option("--execute", "execute real deploy (sample only; will error unless you implement it)")
  .action(async (options: { env?: string; app?: string; revision?: string; execute?: boolean }) => {
    await toDeploy({
      env: options.env,
      appName: options.app,
      version: options.revision,
      execute: Boolean(options.execute),
    });
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${formatCliError(program.name(), message)}\n`);
  process.exitCode = 1;
});
