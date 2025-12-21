import { spawn } from "node:child_process";
import { logStep, logSuccess, logWarning } from "../../utils/log.js";

export type DeployEnvironment = "staging" | "production" | (string & {});

export type DeployContext = {
  cwd: string;
  env: DeployEnvironment;
  appName: string;
  version: string;
  dryRun?: boolean;
};

export type DeployArtifact =
  | { kind: "docker-image"; ref: string }
  | { kind: "file"; path: string }
  | { kind: "none" };

export type DeployResult = {
  env: DeployEnvironment;
  appName: string;
  version: string;
  url?: string;
  revision?: string;
};

export type DeployHooks = {
  /**
   * 前置检查：例如验证必需环境变量、检查工具是否安装、权限/凭证是否可用等。
   */
  preflight?: (ctx: DeployContext) => Promise<void>;

  /**
   * 构建产物：例如 `pnpm build`、`docker build`、`zip` 等。
   * 返回的产物会传给后续 deploy。
   */
  build?: (ctx: DeployContext) => Promise<DeployArtifact>;

  /**
   * 部署执行：例如 `kubectl apply`、Helm、SSH 到服务器、调用云厂商 API 等。
   */
  deploy: (ctx: DeployContext, artifact: DeployArtifact) => Promise<DeployResult>;

  /**
   * 部署后验证：例如健康检查、冒烟测试、检查关键指标等。
   */
  verify?: (ctx: DeployContext, result: DeployResult) => Promise<void>;

  /**
   * 回滚：可选。失败时执行；若不实现则只打印 warning。
   */
  rollback?: (ctx: DeployContext, reason: unknown) => Promise<void>;

  /**
   * 通知：可选。成功/失败时通知到 IM/邮件等。
   */
  notify?: (ctx: DeployContext, payload: { ok: boolean; result?: DeployResult; error?: unknown }) => Promise<void>;
};

/**
 * 一个“可复用”的 CD 流程模板（runner）：
 * - 你只要实现 `deploy`，其它环节按需实现
 * - 失败时会尝试回滚，并输出清晰日志
 *
 * 该文件仅提供代码模板，不绑定具体平台/工具；不同团队只需替换 hooks 即可。
 */
export async function runCdDeployment(ctx: DeployContext, hooks: DeployHooks): Promise<DeployResult> {
  const safeCtx: DeployContext = { ...ctx, dryRun: Boolean(ctx.dryRun) };

  logStep(`CD: ${safeCtx.appName} -> ${String(safeCtx.env)} (${safeCtx.version})`);
  if (safeCtx.dryRun) logWarning("dry-run enabled: will still run hooks unless you handle it in your hooks.");

  try {
    if (hooks.preflight) {
      logStep("CD: preflight");
      await hooks.preflight(safeCtx);
      logSuccess("preflight ok");
    }

    let artifact: DeployArtifact = { kind: "none" };
    if (hooks.build) {
      logStep("CD: build");
      artifact = await hooks.build(safeCtx);
      logSuccess(`build ok (${artifact.kind})`);
    }

    logStep("CD: deploy");
    const result = await hooks.deploy(safeCtx, artifact);
    logSuccess("deploy ok");

    if (hooks.verify) {
      logStep("CD: verify");
      await hooks.verify(safeCtx, result);
      logSuccess("verify ok");
    }

    if (hooks.notify) await hooks.notify(safeCtx, { ok: true, result });
    return result;
  } catch (error) {
    logWarning("CD failed.");
    if (hooks.rollback) {
      try {
        logStep("CD: rollback");
        await hooks.rollback(safeCtx, error);
        logSuccess("rollback done");
      } catch (rollbackError) {
        logWarning(`rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
    } else {
      logWarning("no rollback hook; skipping.");
    }

    if (hooks.notify) {
      try {
        await hooks.notify(safeCtx, { ok: false, error });
      } catch (notifyError) {
        logWarning(`notify failed: ${notifyError instanceof Error ? notifyError.message : String(notifyError)}`);
      }
    }
    throw error;
  }
}

/**
 * 一个最小的“示例 hooks”，用于展示你通常需要填哪些地方。
 * 注意：这里不会真的部署（会直接 throw），请按你的实际部署方式替换。
 */
export const exampleCdHooks: DeployHooks = {
  async preflight(ctx) {
    // 例：检查必需环境变量（token/kubeconfig/ssh key 等）
    // if (!process.env.DEPLOY_TOKEN) throw new Error("missing DEPLOY_TOKEN");
    void ctx;
  },

  async build(ctx) {
    // 例：构建前端/后端，或打包产物，或构建 docker 镜像
    // await runCommand("pnpm", ["run", "build"], { cwd: ctx.cwd });
    // const image = `${ctx.appName}:${ctx.version}`;
    // await runCommand("docker", ["build", "-t", image, "."], { cwd: ctx.cwd });
    // return { kind: "docker-image", ref: image };
    void ctx;
    return { kind: "none" };
  },

  async deploy(ctx, artifact) {
    // 例：Kubernetes/Helm
    // await runCommand("helm", ["upgrade", "--install", ctx.appName, "./chart", "--set", `image.tag=${ctx.version}`], {
    //   cwd: ctx.cwd,
    // });
    // return { env: ctx.env, appName: ctx.appName, version: ctx.version, revision: ctx.version, url: "https://..." };
    void artifact;
    throw new Error(
      `deploy not implemented; replace exampleCdHooks.deploy with your own deployment logic (env=${String(
        ctx.env,
      )}, app=${ctx.appName})`,
    );
  },

  async verify(ctx, result) {
    // 例：健康检查/冒烟测试（HTTP 200 / 关键接口 ok / 指标正常）
    // if (!result.url) return;
    // const res = await fetch(`${result.url}/healthz`);
    // if (!res.ok) throw new Error(`health check failed: ${res.status}`);
    void ctx;
    void result;
  },

  async rollback(ctx, reason) {
    // 例：回滚到上一个 revision（Helm rollback / 切换流量 / 恢复镜像 tag 等）
    void ctx;
    void reason;
  },

  async notify(ctx, payload) {
    // 例：发消息到 Slack/飞书/钉钉/企业微信等
    void ctx;
    void payload;
  },
};

type RunCommandOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

async function runCommand(command: string, args: string[], options: RunCommandOptions): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? 1}`));
    });
  });
}
