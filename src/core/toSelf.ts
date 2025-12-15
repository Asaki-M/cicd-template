import { cwd as getCwd } from "node:process";
import { resolve as resolvePath } from "node:path";
import inquirer from "inquirer";
import { simpleGit, type SimpleGit } from "simple-git";
import { COMMIT_TYPES, type CommitType } from "../utils/constant.js";
import {
  allowedCommitTypesText,
  getRemoteFromUpstream,
  hasConventionalPrefix,
  isRecognizedCommitType,
} from "../utils/index.js";
import { formatGitStatusLine, logHeading, logStep, logSuccess, logWarning } from "../utils/log.js";

type ToSelfOptions = {
  commitMessage?: string;
  commitType?: string;
  cwd?: string;
};

async function promptCommitType(): Promise<CommitType> {
  const answers = await inquirer.prompt<{ type: CommitType }>([
    {
      type: "list",
      name: "type",
      message: "选择提交类型（prefix）:",
      choices: COMMIT_TYPES.map((t) => ({ name: t.name, value: t.value })),
    },
  ]);
  return answers.type;
}

async function promptCommitSubject(): Promise<string> {
  const answers = await inquirer.prompt<{ subject: string }>([
    {
      type: "input",
      name: "subject",
      message: "输入提交说明（不含前缀）:",
      validate: (value: string) => (value.trim().length > 0 ? true : "Commit message cannot be empty"),
    },
  ]);
  return answers.subject.trim();
}

async function getUpstreamRef(git: SimpleGit): Promise<string | null> {
  try {
    const upstream = (await git.raw([
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{u}",
    ])).trim();
    return upstream.length > 0 ? upstream : null;
  } catch {
    return null;
  }
}

async function getPreferredRemote(git: SimpleGit): Promise<string> {
  const upstream = await getUpstreamRef(git);
  if (upstream) {
    const remote = getRemoteFromUpstream(upstream);
    if (remote) return remote;
  }

  const remotes = await git.getRemotes(true);
  const names = remotes.map((r) => r.name);
  if (names.includes("origin")) return "origin";
  if (names.length > 0) return names[0]!;
  throw new Error("no git remotes found (expected 'origin')");
}

async function remoteBranchExists(git: SimpleGit, remote: string, branch: string): Promise<boolean> {
  try {
    const output = await git.raw(["ls-remote", "--heads", remote, branch]);
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

export async function toSelf(options: ToSelfOptions = {}): Promise<void> {
  const cwd = options.cwd ? resolvePath(options.cwd) : getCwd();
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

  logStep("Scanning working tree status");
  const status = await git.status();
  const isDirty = status.files.length > 0;

  if (isDirty) {
    logStep("Found uncommitted changes");
    logHeading("Uncommitted changes:");
    for (const file of status.files) {
      process.stdout.write(`  ${formatGitStatusLine(file)}\n`);
    }
    process.stdout.write("\n");

    logStep("Staging changes (git add -A)");
    await git.add(["-A"]);

    const staged = (await git.diff(["--cached", "--name-only"])).trim();
    if (staged.length > 0) {
      logStep("Preparing commit message");
      let message = options.commitMessage?.trim();
      let type: CommitType | undefined;

      if (options.commitType) {
        const candidate = options.commitType.trim();
        if (!isRecognizedCommitType(candidate)) {
          throw new Error(
            `unknown commit type: ${candidate} (allowed: ${allowedCommitTypesText()})`,
          );
        }
        type = candidate;
      }

      if (!message || !type) {
        if (!process.stdin.isTTY) {
          if (!message) {
            throw new Error("working tree has changes; pass --message in non-interactive mode");
          }
          // If caller passed full message, allow skipping the interactive type selection.
          if (!type && !hasConventionalPrefix(message)) {
            throw new Error(
              "commit message has no type prefix; pass --type or use an already-prefixed message like 'feat: ...'",
            );
          }
        }

        // Per expected UX: let user type the message first, then choose the prefix/type.
        if (!message) message = await promptCommitSubject();
        if (!type && !hasConventionalPrefix(message)) type = await promptCommitType();
      }

      const finalMessage =
        hasConventionalPrefix(message) || !type ? message : `${type}: ${message.trim()}`;

      logStep(`Committing: ${finalMessage}`);
      await git.commit(finalMessage);
    }
  }

  logStep("Resolving remote/upstream");
  const remote = await getPreferredRemote(git);
  const hasUpstream = (await getUpstreamRef(git)) !== null;

  // Ensure we are up-to-date before pushing.
  logStep(`Pulling latest from ${remote}/${branch}`);
  const canPull = hasUpstream || (await remoteBranchExists(git, remote, branch));
  if (canPull) {
    try {
      if (hasUpstream) {
        await git.pull();
      } else {
        await git.pull(remote, branch);
      }
    } catch {
      const after = await git.status();
      if (after.conflicted && after.conflicted.length > 0) {
        process.stderr.write(`\nPull resulted in conflicts:\n${after.conflicted.map((p) => `  ${p}`).join("\n")}\n`);
        throw new Error("please resolve conflicts, then rerun to-self");
      }
      throw new Error("git pull failed; please fix and rerun");
    }
  } else {
    logWarning("Remote branch not found yet; skipping pull.");
  }

  // Push current branch to a same-named branch on the selected remote.
  logStep(`Pushing to ${remote}/${branch}`);
  const pushOptions = hasUpstream ? [] : ["-u"];
  await git.push(remote, branch, pushOptions);

  logSuccess(`Pushed ${branch} -> ${remote}/${branch}`);
}
