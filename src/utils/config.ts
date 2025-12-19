import { basename, join } from "node:path";
import { readFile } from "node:fs/promises";
import { logWarning } from "./log.js";

export type CicdConfig = {
  scopes?: string[];
};

function normalizeScope(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/\s/.test(trimmed)) return null;
  if (/[()]/.test(trimmed)) return null;
  return trimmed;
}

function getDefaultCicdConfigPath(cwd: string): string {
  return join(cwd, `${basename(cwd)}.cicd.config`);
}

export async function loadCicdConfigScopes(cwd: string): Promise<string[] | null> {
  const configPath = getDefaultCicdConfigPath(cwd);
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as CicdConfig;
    const scopes = Array.isArray(parsed.scopes) ? parsed.scopes : null;
    if (!scopes) return null;

    const normalized = scopes
      .map((s) => normalizeScope(s))
      .filter((s): s is string => Boolean(s));
    const unique = Array.from(new Set(normalized));
    return unique.length > 0 ? unique : null;
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      const code = (error as Error & { code?: string }).code;
      if (code === "ENOENT") return null;
    }
    logWarning(`Failed to read cicd config scopes from ${configPath}; ignoring.`);
    return null;
  }
}

