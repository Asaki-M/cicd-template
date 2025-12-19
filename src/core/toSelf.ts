import { cwd as getCwd } from "node:process";
import { simpleGit } from "simple-git";
import {
  commitIfDirty,
  getPreferredRemote,
  pullIfPossible,
  pushCurrentBranch,
} from "../utils/index.js";
import { logStep, logSuccess } from "../utils/log.js";

type ToSelfOptions = {
  commitMessage?: string;
  commitType?: string;
};

export async function toSelf(options: ToSelfOptions = {}): Promise<void> {
  const cwd = getCwd();
  const git = simpleGit({ baseDir: cwd });

  logStep(`Working directory: ${cwd}`);

  logStep("Checking git repository");
  const isRepo = await git.checkIsRepo();
  if (!isRepo) throw new Error("not inside a git repository");

  logStep("Detecting current branch");
  const branch = (await git.branch()).current;
  if (!branch || branch === "HEAD") {
    throw new Error("detached HEAD; checkout a branch first");
  }

  await commitIfDirty(git, { commitMessage: options.commitMessage, commitType: options.commitType });

  logStep("Resolving remote/upstream");
  const remote = await getPreferredRemote(git);

  // Ensure we are up-to-date before pushing.
  logStep(`Pulling latest from ${remote}/${branch}`);
  await pullIfPossible(git, remote, branch, "to-self");

  // Push current branch to a same-named branch on the selected remote.
  logStep(`Pushing to ${remote}/${branch}`);
  await pushCurrentBranch(git, remote, branch);

  logSuccess(`Pushed ${branch} -> ${remote}/${branch}`);
}
