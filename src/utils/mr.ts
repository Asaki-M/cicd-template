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
 * 构造“手动创建 MR/PR”的网页地址。
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
