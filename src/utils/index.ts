import { COMMIT_TYPES, type CommitType } from "./constant.js";
import inquirer from "inquirer";
import { type SimpleGit } from "simple-git";
import { loadCicdConfigScopes } from "./config.js";
import { formatGitStatusLine, logHeading, logStep, logWarning } from "./log.js";

/**
 * `simple-git` 的文件状态结构（本项目只用到其中几个字段）。
 * 用于展示 `git status` 的简化版信息。
 */
export type StatusFile = {
  path: string;
  index?: string;
  working_dir?: string;
};

/**
 * 将 `git status` 的单个文件变更格式化为一行文本（不带颜色）。
 * @param file git 状态里的文件信息
 * @returns 形如 `"XY path/to/file"` 的字符串
 */
export function formatStatusLine(file: StatusFile): string {
  const x = file.index ?? " ";
  const y = file.working_dir ?? " ";
  return `${x}${y} ${file.path}`;
}

/**
 * 判断提交类型是否为预置的 Conventional Commit type。
 * @param value 待校验的类型字符串
 * @returns 是否为合法的提交类型
 */
export function isRecognizedCommitType(value: string | undefined): value is CommitType {
  if (!value) return false;
  return (COMMIT_TYPES as readonly { value: string }[]).some((t) => t.value === value);
}

/**
 * 获取允许的提交类型列表（逗号分隔），用于错误提示。
 * @returns 形如 `"feat, fix, docs, ..."` 的字符串
 */
export function allowedCommitTypesText(): string {
  return COMMIT_TYPES.map((t) => t.value).join(", ");
}

/**
 * 判断提交信息是否已包含 Conventional Commit 前缀。
 * 支持 `<type>: ...` 和 `<type>(scope): ...` 等格式。
 * @param message 提交信息
 * @returns 是否已包含前缀
 */
export function hasConventionalPrefix(message: string): boolean {
  // Treat "<type>: ..." and "<type>(scope): ..." as already prefixed.
  return /^[a-z]+(\([^)]+\))?!?:\s+/.test(message.trim());
}

/**
 * 从 upstream 引用中解析 remote 名称。
 * 例如：`origin/main` -> `origin`
 * @param upstream upstream 字符串（通常来自 `@{u}`）
 * @returns remote 名称；无法解析则返回 `null`
 */
export function getRemoteFromUpstream(upstream: string): string | null {
  const slashIndex = upstream.indexOf("/");
  if (slashIndex <= 0) return null;
  return upstream.slice(0, slashIndex);
}

/**
 * 交互式选择提交类型（prefix）。
 * @returns 选中的提交类型
 */
export async function promptCommitType(): Promise<CommitType> {
  const answers = await inquirer.prompt<{ type: CommitType }>([
    {
      type: "list",
      name: "type",
      message: "Select commit type (prefix):",
      choices: COMMIT_TYPES.map((t) => ({ name: t.name, value: t.value })),
    },
  ]);
  return answers.type;
}

/**
 * 交互式输入提交说明（不包含 type 前缀）。
 * @returns 用户输入的 subject（已 trim）
 */
export async function promptCommitSubject(): Promise<string> {
  const answers = await inquirer.prompt<{ subject: string }>([
    {
      type: "input",
      name: "subject",
      message: "Enter commit subject (without prefix):",
      validate: (value: string) => (value.trim().length > 0 ? true : "Commit message cannot be empty"),
    },
  ]);
  return answers.subject.trim();
}

/**
 * 交互式输入/选择提交 scope（可为空）。
 * - 若 `${basename(cwd)}.cicd.config` 提供 `scopes: string[]`，则以列表方式选择
 * - 否则让用户自行输入（可留空）
 * @param cwd git 仓库工作目录
 * @returns scope（trim 后；允许返回空字符串）
 */
export async function promptCommitScope(cwd: string): Promise<string> {
  const scopes = await loadCicdConfigScopes(cwd);
  if (scopes && scopes.length > 0) {
    const answers = await inquirer.prompt<{ scope: string }>([
      {
        type: "list",
        name: "scope",
        message: "Select commit scope (optional):",
        choices: [
          { name: "(none)", value: "" },
          ...scopes.map((s) => ({ name: s, value: s })),
          { name: "(custom)", value: "__custom__" },
        ],
      },
    ]);

    if (answers.scope !== "__custom__") return answers.scope;
  }

  const answers = await inquirer.prompt<{ scope: string }>([
    {
      type: "input",
      name: "scope",
      message: "Enter commit scope (optional):",
      validate: (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return true;
        if (/\s/.test(trimmed)) return "Scope should not contain spaces";
        if (/[()]/.test(trimmed)) return "Scope should not include parentheses";
        return true;
      },
    },
  ]);
  return answers.scope.trim();
}

/**
 * 获取当前分支的 upstream 引用（如 `origin/main`）。
 * @param git `simple-git` 实例
 * @returns upstream 字符串；没有 upstream 时返回 `null`
 */
export async function getUpstreamRef(git: SimpleGit): Promise<string | null> {
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

/**
 * 选择一个“更合理”的 remote 名称：
 * - 优先使用当前分支的 upstream remote
 * - 否则优先 `origin`
 * - 否则使用第一个 remote
 * @param git `simple-git` 实例
 * @returns remote 名称
 * @throws 当仓库没有任何 remote 时抛错
 */
export async function getPreferredRemote(git: SimpleGit): Promise<string> {
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

/**
 * 判断远程是否存在指定分支。
 * @param git `simple-git` 实例
 * @param remote remote 名称（如 `origin`）
 * @param branch 分支名（如 `main`）
 * @returns 是否存在
 */
export async function remoteBranchExists(git: SimpleGit, remote: string, branch: string): Promise<boolean> {
  try {
    const output = await git.raw(["ls-remote", "--heads", remote, branch]);
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * 若工作区有变更，则自动 `git add -A` 并提交：
 * - 交互模式：提示输入提交信息/选择 type
 * - 非交互模式：要求显式提供 `commitMessage`（且 message 必须自带前缀或提供 `commitType`）
 *
 * 该函数会输出日志并展示变更文件列表。
 * @param git `simple-git` 实例
 * @param options 提交相关参数
 * @throws 当 `commitType` 非法，或非交互模式参数不足时抛错
 */
export async function commitIfDirty(
  git: SimpleGit,
  options: { commitMessage?: string; commitType?: string; cwd?: string },
): Promise<void> {
  logStep("Scanning working tree status");
  const status = await git.status();
  const isDirty = status.files.length > 0;
  if (!isDirty) return;

  logStep("Found uncommitted changes");
  logHeading("Uncommitted changes:");
  for (const file of status.files) {
    process.stdout.write(`  ${formatGitStatusLine(file)}\n`);
  }
  process.stdout.write("\n");

  logStep("Staging changes (git add -A)");
  await git.add(["-A"]);

  const staged = (await git.diff(["--cached", "--name-only"])).trim();
  if (staged.length === 0) return;

  logStep("Preparing commit message");
  let message = options.commitMessage?.trim();
  let type: CommitType | undefined;
  let scope = "";
  const shouldPromptScope = process.stdin.isTTY && !options.commitMessage;

  if (options.commitType) {
    const candidate = options.commitType.trim();
    if (!isRecognizedCommitType(candidate)) {
      throw new Error(`unknown commit type: ${candidate} (allowed: ${allowedCommitTypesText()})`);
    }
    type = candidate;
  }

  if (!message || !type) {
    if (!process.stdin.isTTY) {
      if (!message) {
        throw new Error("working tree has changes; pass --message in non-interactive mode");
      }
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

  if (shouldPromptScope && type && message && !hasConventionalPrefix(message)) {
    scope = await promptCommitScope(options.cwd ?? process.cwd());
  }

  const finalMessage =
    hasConventionalPrefix(message) || !type
      ? message
      : scope
        ? `${type}(${scope}): ${message.trim()}`
        : `${type}: ${message.trim()}`;
  logStep(`Committing: ${finalMessage}`);
  await git.commit(finalMessage);
}

/**
 * 尝试 `git pull`（可用时才 pull）：
 * - 若当前分支有 upstream 或远端存在同名分支，则执行 pull
 * - 否则跳过并提示 warning
 *
 * 发生冲突时会打印冲突文件列表并抛错，提示重新运行对应命令。
 * @param git `simple-git` 实例
 * @param remote remote 名称
 * @param branch 分支名
 * @param rerunCommandName 发生冲突时提示用户重跑的命令名（如 `to-self`/`to-test`）
 * @throws pull 失败或产生冲突时抛错
 */
export async function pullIfPossible(
  git: SimpleGit,
  remote: string,
  branch: string,
  rerunCommandName: string,
): Promise<void> {
  const hasUpstream = (await getUpstreamRef(git)) !== null;
  const canPull = hasUpstream || (await remoteBranchExists(git, remote, branch));
  if (!canPull) {
    logWarning("Remote branch not found yet; skipping pull.");
    return;
  }

  try {
    if (hasUpstream) {
      await git.pull();
    } else {
      await git.pull(remote, branch);
    }
  } catch {
    const after = await git.status();
    if (after.conflicted && after.conflicted.length > 0) {
      process.stderr.write(
        `\nPull resulted in conflicts:\n${after.conflicted.map((p) => `  ${p}`).join("\n")}\n`,
      );
      throw new Error(`please resolve conflicts, then rerun ${rerunCommandName}`);
    }
    throw new Error("git pull failed; please fix and rerun");
  }
}

/**
 * 将当前本地分支推送到远程同名分支；若没有 upstream，会使用 `-u` 设置 upstream。
 * @param git `simple-git` 实例
 * @param remote remote 名称
 * @param branch 分支名
 */
export async function pushCurrentBranch(git: SimpleGit, remote: string, branch: string): Promise<void> {
  const hasUpstream = (await getUpstreamRef(git)) !== null;
  const pushOptions = hasUpstream ? [] : ["-u"];
  await git.push(remote, branch, pushOptions);
}

/**
 * 确保本地存在目标分支并切换过去：
 * - 本地存在：直接 checkout
 * - 仅远程存在：从 `${remote}/${branch}` 创建并 checkout
 * - 都不存在：从当前 HEAD 创建本地分支并 checkout（并给出 warning）
 * @param git `simple-git` 实例
 * @param remote remote 名称
 * @param branch 目标分支名
 */
export async function ensureLocalBranchFromRemote(git: SimpleGit, remote: string, branch: string): Promise<void> {
  const locals = await git.branchLocal();
  if (locals.all.includes(branch)) {
    await git.checkout(branch);
    return;
  }

  const existsOnRemote = await remoteBranchExists(git, remote, branch);
  if (existsOnRemote) {
    await git.checkoutBranch(branch, `${remote}/${branch}`);
    return;
  }

  logWarning(`Target branch '${branch}' not found on ${remote}; creating it locally from current HEAD.`);
  await git.checkoutLocalBranch(branch);
}

/**
 * 将远程的某个分支合并到当前分支（会先 fetch 再 merge）。
 * 发生冲突时会打印冲突文件列表并抛错，提示重新运行对应命令。
 * @param git `simple-git` 实例
 * @param remote remote 名称
 * @param sourceBranch 要合并进来的源分支名（通常是当前分支名）
 * @param rerunCommandName 发生冲突时提示用户重跑的命令名
 * @throws merge 失败或产生冲突时抛错
 */
export async function mergeRemoteBranchIntoCurrent(
  git: SimpleGit,
  remote: string,
  sourceBranch: string,
  rerunCommandName: string,
): Promise<void> {
  try {
    await git.fetch(remote, sourceBranch);
    await git.merge([`${remote}/${sourceBranch}`]);
  } catch {
    const after = await git.status();
    if (after.conflicted && after.conflicted.length > 0) {
      process.stderr.write(
        `\nMerge resulted in conflicts:\n${after.conflicted.map((p) => `  ${p}`).join("\n")}\n`,
      );
      throw new Error(`please resolve conflicts, then rerun ${rerunCommandName}`);
    }
    throw new Error("git merge failed; please fix and rerun");
  }
}
