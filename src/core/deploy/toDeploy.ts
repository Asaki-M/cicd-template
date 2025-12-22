import { cwd as getCwd } from "node:process";
import { basename } from "node:path";
import { simpleGit } from "simple-git";
import { logStep, logSuccess, logWarning } from "../../utils/log.js";
import type { DeployArtifact, DeployContext, DeployHooks, DeployResult } from "./template.js";
import { runCdDeployment } from "./template.js";

export type ToDeployOptions = {
  cwd?: string;
  env?: string;
  appName?: string;
  version?: string;
  execute?: boolean;
};

async function resolveDefaultVersion(cwd: string): Promise<string> {
  try {
    const git = simpleGit({ baseDir: cwd });
    const isRepo = await git.checkIsRepo();
    if (!isRepo) return "local";
    const sha = (await git.raw(["rev-parse", "--short", "HEAD"])).trim();
    return sha || "local";
  } catch {
    return "local";
  }
}

export async function toDeploy(options: ToDeployOptions = {}): Promise<DeployResult> {
  const cwd = options.cwd ?? getCwd();
  const env = options.env?.trim() ? options.env.trim() : "staging";
  const appName = options.appName?.trim() ? options.appName.trim() : basename(cwd);
  const version = options.version?.trim() ? options.version.trim() : await resolveDefaultVersion(cwd);
  const dryRun = !options.execute;

  const ctx: DeployContext = { cwd, env, appName, version, dryRun };

  const hooks: DeployHooks = {
    async preflight() {
      logStep("Sample deploy preflight (no-op)");
    },

    async build() {
      logStep("Sample deploy build (no-op)");
      const artifact: DeployArtifact = { kind: "none" };
      return artifact;
    },

    async deploy(_ctx, _artifact) {
      if (dryRun) {
        logWarning("Sample deploy (dry-run): skipping real deploy.");
        return { env, appName, version, revision: version };
      }

      throw new Error("Sample deploy only: real deployment is not implemented.");
    },

    async verify(_ctx, result) {
      logStep("Sample deploy verify (no-op)");
      logSuccess(`Deployed ${result.appName}@${result.version} to ${String(result.env)}`);
    },
  };

  return await runCdDeployment(ctx, hooks);
}

