import { cwd as getCwd } from "node:process";
import { resolve as resolvePath } from "node:path";
import { simpleGit } from "simple-git";
import {
  commitIfDirty,
  getPreferredRemote,
  pullIfPossible,
  pushCurrentBranch,
} from "../utils/index.js";
import { logStep, logSuccess, logWarning } from "../utils/log.js";
import { createMergeRequest, parseRemoteUrl } from "../utils/mr.js";

type ToMainOptions = {
  branch?: string;
  commitMessage?: string;
  commitType?: string;
  cwd?: string;
};

export async function toMain(options: ToMainOptions = {}): Promise<void> {
  const cwd = options.cwd ? resolvePath(options.cwd) : getCwd();
  const targetBranch = options.branch?.trim() ? options.branch.trim() : "main";
  const git = simpleGit({ baseDir: cwd });

  logStep(`Working directory: ${cwd}`);
  logStep("Checking git repository");
  const isRepo = await git.checkIsRepo();
  if (!isRepo) throw new Error("not inside a git repository");

  logStep("Detecting current branch");
  const currentBranch = (await git.branch()).current;
  if (!currentBranch || currentBranch === "HEAD") {
    throw new Error("detached HEAD; checkout a branch first");
  }
  if (currentBranch === targetBranch) {
    throw new Error(`cannot run to-main on '${targetBranch}' branch; checkout another branch first`);
  }

  await commitIfDirty(git, { commitMessage: options.commitMessage, commitType: options.commitType });

  logStep("Resolving remote/upstream");
  const remote = await getPreferredRemote(git);

  logStep(`Pulling latest from ${remote}/${currentBranch}`);
  await pullIfPossible(git, remote, currentBranch, "to-main");

  logStep(`Pushing to ${remote}/${currentBranch}`);
  await pushCurrentBranch(git, remote, currentBranch);
  logSuccess(`Pushed ${currentBranch} -> ${remote}/${currentBranch}`);

  logStep(`Creating MR/PR: ${currentBranch} -> ${targetBranch}`);
  const remoteUrl = (await git.raw(["remote", "get-url", remote])).trim();
  const parsed = parseRemoteUrl(remoteUrl);
  if (!parsed) {
    logWarning(`Could not parse remote url: ${remoteUrl}`);
  }

  await createMergeRequest({
    cwd,
    parsedRemote: parsed,
    sourceBranch: currentBranch,
    targetBranch,
  });
}
