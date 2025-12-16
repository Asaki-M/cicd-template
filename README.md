# to-self

一个很小的 CLI：自动 `git add -A` → （如有变更则提交）→ `git push` 到同名远程分支。

另提供 `to-test`：把当前分支合并到目标测试分支并推送。
另提供 `to-main`：推送当前分支并创建合并到 main 的 MR/PR。

## 安装

```bash
pnpm install
pnpm run build
pnpm link --global
```

也可以当作 npm 包全局安装（发布后）：

```bash
npm i -g to-self
```

## 使用

```bash
to-self
```

如果当前工作区有未提交变更，会先列出变更文件，然后用交互式提示让你输入 commit message；如果工作区是干净的，会跳过提交直接 push。

交互模式会先让你选择类型前缀（`feat/fix/to/...`），最终提交信息形如 `feat: xxx`。

也可以直接传 commit message（适合脚本/CI）；如果你的 message 没带前缀，也可以额外传 `--type`：

```bash
to-self --message "chore: update"
to-self --type feat --message "add something"
```

查看帮助：

```bash
to-self --help
```

指定工作目录（不需要 `cd`）：

```bash
to-self --cwd ./test/testcicd
```

## to-test

- 在 `feat/xx` 等分支执行：先同步并推送当前分支到远程，然后切到目标分支（默认 `test`），合并 `origin/feat/xx`，再推送 `origin/test`
- 在目标分支（默认 `test`）执行：行为类似 `to-self`，直接推送当前分支
- 支持自定义目标分支：`to-test --branch test-env`

```bash
to-test
to-test --branch test-env
to-test --message "chore: sync"   # 非交互提交
```

## to-main

- 只能在非目标分支执行（默认目标分支 `main`）；在 `main` 上会直接报错
- 执行时会先把当前分支 push 到远程同名分支，然后创建从当前分支合并到目标分支的 MR/PR
- 支持自定义目标分支：`to-main --branch master`

```bash
to-main
to-main --branch master
to-main --message "feat: something"   # 非交互提交
```

## 本地测试（在其他目录运行）

在本项目根目录执行一次：

```bash
pnpm install
pnpm link --global
```

然后进入任意 git 仓库目录（例如 `test/testcicd`）直接运行：

```bash
to-self
```
