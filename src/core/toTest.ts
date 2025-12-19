import { cwd as getCwd } from "node:process";
import { simpleGit } from "simple-git";
import {
  commitIfDirty,
  ensureLocalBranchFromRemote,
  getPreferredRemote,
  mergeRemoteBranchIntoCurrent,
  pullIfPossible,
  pushCurrentBranch,
} from "../utils/index.js";
import { logStep, logSuccess, logWarning } from "../utils/log.js";

type ToTestOptions = {
  branch?: string;
  commitMessage?: string;
  commitType?: string;
};

export async function toTest(options: ToTestOptions = {}): Promise<void> {
  const cwd = getCwd();
  const targetBranch = options.branch?.trim() ? options.branch.trim() : "test";
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

  logStep("Resolving remote");
  const remote = await getPreferredRemote(git);

  if (currentBranch === targetBranch) {
    logStep(`On '${targetBranch}'; pushing current branch`);
    await commitIfDirty(git, options);
    logStep(`Pulling latest from ${remote}/${targetBranch}`);
    await pullIfPossible(git, remote, targetBranch, "to-test");
    logStep(`Pushing to ${remote}/${targetBranch}`);
    await pushCurrentBranch(git, remote, targetBranch);
    logSuccess(`Pushed ${targetBranch} -> ${remote}/${targetBranch}`);
    return;
  }

  const sourceBranch = currentBranch;
  logStep(`Source branch: ${sourceBranch}`);
  logStep(`Target branch: ${targetBranch}`);

  await commitIfDirty(git, options);

  logStep(`Syncing ${sourceBranch} before merge`);
  logStep(`Pulling latest from ${remote}/${sourceBranch}`);
  await pullIfPossible(git, remote, sourceBranch, "to-test");
  logStep(`Pushing to ${remote}/${sourceBranch}`);
  await pushCurrentBranch(git, remote, sourceBranch);

  const restoreBranch = async (): Promise<void> => {
    try {
      const now = (await git.branch()).current;
      if (now !== sourceBranch) await git.checkout(sourceBranch);
    } catch {
      logWarning(`Could not restore branch '${sourceBranch}'. Resolve git state manually if needed.`);
    }
  };

  try {
    logStep(`Checking out target branch '${targetBranch}'`);
    await ensureLocalBranchFromRemote(git, remote, targetBranch);

    logStep(`Pulling latest from ${remote}/${targetBranch}`);
    await pullIfPossible(git, remote, targetBranch, "to-test");

    logStep(`Merging ${remote}/${sourceBranch} -> ${targetBranch}`);
    await mergeRemoteBranchIntoCurrent(git, remote, sourceBranch, "to-test");

    logStep(`Pushing to ${remote}/${targetBranch}`);
    await pushCurrentBranch(git, remote, targetBranch);

    logSuccess(`Pushed ${targetBranch} -> ${remote}/${targetBranch}`);
  } finally {
    await restoreBranch();
  }
}
