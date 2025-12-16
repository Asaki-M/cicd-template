import { spawn } from "node:child_process";
import { logSuccess } from "./log.js";

export type ParsedRemote = {
  host: string;
  ownerPath: string;
  repo: string;
  provider: "github" | "gitlab" | "unknown";
};

/**
 * 解析 git remote url，提取出 host/owner/repo 以及平台类型（GitHub/GitLab）。
 * 支持常见格式：
 * - `git@github.com:owner/repo.git`
 * - `ssh://git@github.com/owner/repo.git`
 * - `https://github.com/owner/repo.git`
 * @param remoteUrl `git remote get-url <remote>` 的输出
 * @returns 解析结果；不支持/解析失败则返回 `null`
 */
export function parseRemoteUrl(remoteUrl: string): ParsedRemote | null {
  const trimmed = remoteUrl.trim();
  if (!trimmed) return null;

  let host: string | null = null;
  let path: string | null = null;

  if (/^[^@]+@[^:]+:.+/.test(trimmed)) {
    const atIndex = trimmed.indexOf("@");
    const colonIndex = trimmed.indexOf(":", atIndex);
    host = trimmed.slice(atIndex + 1, colonIndex);
    path = trimmed.slice(colonIndex + 1);
  } else if (trimmed.startsWith("ssh://") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      host = url.host;
      path = url.pathname.replace(/^\/+/, "");
    } catch {
      return null;
    }
  } else {
    return null;
  }

  if (!host || !path) return null;
  const normalized = path.replace(/\.git$/, "").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const repo = parts[parts.length - 1]!;
  const ownerPath = parts.slice(0, -1).join("/");
  const provider: ParsedRemote["provider"] =
    host.includes("github") ? "github" : host.includes("gitlab") ? "gitlab" : "unknown";

  return { host, ownerPath, repo, provider };
}

/**
 * 构造“手动创建 MR/PR”的网页地址（用于工具不可用时兜底）。
 * @param parsed 解析后的 remote 信息
 * @param sourceBranch 源分支
 * @param targetBranch 目标分支
 * @returns 可打开的 URL；未知平台则返回 `null`
 */
export function buildCreateMrUrl(parsed: ParsedRemote, sourceBranch: string, targetBranch: string): string | null {
  const base = `https://${parsed.host}/${parsed.ownerPath}/${parsed.repo}`;
  const source = encodeURIComponent(sourceBranch);
  const target = encodeURIComponent(targetBranch);

  if (parsed.provider === "github") {
    return `${base}/compare/${target}...${source}?expand=1`;
  }
  if (parsed.provider === "gitlab") {
    return `${base}/-/merge_requests/new?merge_request[source_branch]=${source}&merge_request[target_branch]=${target}`;
  }
  return null;
}

/**
 * 执行一个外部命令并收集 stdout/stderr（不直接输出到终端）。
 * @param command 可执行文件名
 * @param args 参数数组
 * @param cwd 工作目录
 */
export async function runCommandCapture(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", (error) => {
      resolve({ code: 1, stdout, stderr: `${stderr}\n${String(error)}`.trim() });
    });
  });
}

/**
 * 判断命令是否存在（基于 `which`）。
 * @param command 命令名（如 `gh`/`glab`）
 */
export async function commandExists(command: string): Promise<boolean> {
  const { code } = await runCommandCapture("which", [command], process.cwd());
  return code === 0;
}

/**
 * 基于当前仓库创建 MR/PR：
 * - GitLab：优先使用 `glab mr create`
 * - GitHub：优先使用 `gh pr create`
 * 若工具不存在，会抛出错误并附带一个可手动打开的 URL（如果能解析 remote）。
 *
 * @param options 参数
 * @throws 创建失败/工具缺失时抛错
 */
export async function createMergeRequest(options: {
  cwd: string;
  parsedRemote: ParsedRemote | null;
  sourceBranch: string;
  targetBranch: string;
}): Promise<void> {
  const { cwd, parsedRemote, sourceBranch, targetBranch } = options;

  // 优先根据远端类型选择工具；如果无法识别，则按 glab -> gh 的顺序尝试。
  const preferGitLab = parsedRemote?.provider === "gitlab";
  const preferGitHub = parsedRemote?.provider === "github";

  const candidates = preferGitLab
    ? ["glab", "gh"]
    : preferGitHub
      ? ["gh", "glab"]
      : ["glab", "gh"];

  const mrUrl = parsedRemote ? buildCreateMrUrl(parsedRemote, sourceBranch, targetBranch) : null;

  for (const tool of candidates) {
    if (!(await commandExists(tool))) continue;

    if (tool === "glab") {
      const args = [
        "mr",
        "create",
        "--source-branch",
        sourceBranch,
        "--target-branch",
        targetBranch,
        "--fill",
        "--yes",
      ];
      const { code, stdout, stderr } = await runCommandCapture("glab", args, cwd);
      if (code === 0) {
        const urlFromOutput = stdout.match(/https?:\/\/\S+/)?.[0] ?? mrUrl;
        if (urlFromOutput) logSuccess(`Merge request created: ${urlFromOutput}`);
        return;
      }
      throw new Error(`failed to create merge request via glab.\n${stderr || stdout || ""}`.trim());
    }

    if (tool === "gh") {
      const args = [
        "pr",
        "create",
        "--base",
        targetBranch,
        "--head",
        sourceBranch,
        "--fill",
        "--json",
        "url",
        "-q",
        ".url",
      ];
      const { code, stdout, stderr } = await runCommandCapture("gh", args, cwd);
      if (code === 0) {
        const urlFromOutput = stdout.trim() || mrUrl;
        if (urlFromOutput) logSuccess(`Pull request created: ${urlFromOutput}`);
        return;
      }
      throw new Error(`failed to create pull request via gh.\n${stderr || stdout || ""}`.trim());
    }
  }

  const hint = [
    "no supported MR/PR tool found (install one):",
    "- GitLab: glab (https://github.com/profclems/glab)",
    "- GitHub: gh (https://github.com/cli/cli)",
    mrUrl ? `manual link: ${mrUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  throw new Error(hint);
}

