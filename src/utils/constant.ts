export const COMMIT_TYPES = [
  { value: "feat", name: "feat: New feature" },
  { value: "fix", name: "fix: Bug fix" },
  { value: "to", name: "to: Fix via diff only" },
  { value: "docs", name: "docs: Documentation" },
  { value: "style", name: "style: Formatting (no logic change)" },
  { value: "refactor", name: "refactor: Refactor (no feature/bugfix)" },
  { value: "perf", name: "perf: Performance improvement" },
  { value: "test", name: "test: Add/update tests" },
  { value: "chore", name: "chore: Tooling/maintenance" },
  { value: "revert", name: "revert: Revert previous change" },
  { value: "merge", name: "merge: Merge changes" },
  { value: "sync", name: "sync: Sync branch changes" },
] as const;

export type CommitType = (typeof COMMIT_TYPES)[number]["value"];
