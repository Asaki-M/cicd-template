# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains the TypeScript source.
  - `src/cli.ts` is the CLI entrypoint (`to-self`).
  - `src/core/toSelf.ts` implements the main “add/commit/pull/push” workflow.
  - `src/utils/` holds shared helpers and constants (e.g., commit type list).
- `build/` is the compiled output from `tsc` (generated; do not edit manually).

## Build, Test, and Development Commands

- `pnpm install`: install dependencies (repo uses `pnpm`, see `package.json` `engines.pnpm`).
- `pnpm run build`: compile TypeScript to `build/`.
- `pnpm start -- --help`: run the compiled CLI via Node (use `--` to pass args).
- `pnpm link --global`: link the CLI globally for local manual testing.
  - Example: `to-self --cwd ./path/to/other/repo`

## Coding Style & Naming Conventions

- Language: TypeScript (ESM). Keep imports compatible with Node ESM output (imports use `.js` extensions in `src/`).
- Formatting: 2-space indentation, double quotes, semicolons (match existing `src/*.ts`).
- Naming: `camelCase` for variables/functions, `PascalCase` for types, files in `camelCase.ts` (e.g., `toSelf.ts`).
- Keep `pnpm-lock.yaml` updated when changing dependencies.

## Testing Guidelines

- No automated test framework is configured in this repo currently.
- Validate changes by running the CLI against a throwaway git repo:
  - `pnpm run build`
  - `node build/cli.js --cwd /path/to/repo --help` (or run without `--help`)

## Commit & Pull Request Guidelines

- Prefer Conventional Commit-style messages (the tool supports/encourages these types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, etc.).
- PRs should include: purpose, notable behavior changes, and how you validated (commands + a brief manual test note). If CLI prompts/UX changes, include a short terminal transcript or screenshot.

## Security & Configuration Tips

- This CLI runs `git add/commit/pull/push`; only use it in repos you trust and with a configured remote.
- In non-interactive environments, pass `--message` (and `--type` if your message lacks a prefix).
- `pnpm` is configured to use a local store directory (`.pnpm-store/`); it is gitignored and should not be committed.
