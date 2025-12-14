import { COMMIT_TYPES, type CommitType } from "./constant.js";

export type StatusFile = {
  path: string;
  index?: string;
  working_dir?: string;
};

export function formatStatusLine(file: StatusFile): string {
  const x = file.index ?? " ";
  const y = file.working_dir ?? " ";
  return `${x}${y} ${file.path}`;
}

export function isRecognizedCommitType(value: string | undefined): value is CommitType {
  if (!value) return false;
  return (COMMIT_TYPES as readonly { value: string }[]).some((t) => t.value === value);
}

export function allowedCommitTypesText(): string {
  return COMMIT_TYPES.map((t) => t.value).join(", ");
}

export function hasConventionalPrefix(message: string): boolean {
  // Treat "<type>: ..." and "<type>(scope): ..." as already prefixed.
  return /^[a-z]+(\([^)]+\))?!?:\s+/.test(message.trim());
}

export function getRemoteFromUpstream(upstream: string): string | null {
  const slashIndex = upstream.indexOf("/");
  if (slashIndex <= 0) return null;
  return upstream.slice(0, slashIndex);
}
