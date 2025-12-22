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
