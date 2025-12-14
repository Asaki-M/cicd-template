export const COMMIT_TYPES = [
  { value: "feat", name: "feat: 新功能（feature）" },
  { value: "fix", name: "fix: 修复bug（直接修复）" },
  { value: "to", name: "to: 修复bug（只产生diff不自动修复）" },
  { value: "docs", name: "docs: 文档（documentation）" },
  { value: "style", name: "style: 格式（不影响代码运行的变动）" },
  { value: "refactor", name: "refactor: 重构（非新增功能/非修改bug）" },
  { value: "perf", name: "perf: 优化（性能/体验）" },
  { value: "test", name: "test: 增加测试" },
  { value: "chore", name: "chore: 构建过程或辅助工具变动" },
  { value: "revert", name: "revert: 回滚到上一个版本" },
  { value: "merge", name: "merge: 代码合并" },
  { value: "sync", name: "sync: 同步主线或分支Bug" },
] as const;

export type CommitType = (typeof COMMIT_TYPES)[number]["value"];

