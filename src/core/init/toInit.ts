import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { cwd as getCwd } from "node:process";
import inquirer from "inquirer";
import { logStep, logSuccess, logWarning } from "../../utils/log.js";
import { generateGithubDeployWorkflow } from "./github.deploy.template.js";
import { generateGitlabDeployWorkflow } from "./gitlab.deploy.template.js";

export type InitPlatform = "github" | "gitlab";

export type ToInitOptions = {
  cwd?: string;
  platform?: InitPlatform;
  output?: string;
  force?: boolean;
};

type GithubAnswers = {
  output: string;
  branch: string;
  nodeVersion: string;
  buildOutputDir: string;
  targetPath: string;
  hostSecret: string;
  userSecret: string;
  keySecret: string;
};

type GitlabAnswers = {
  output: string;
  deployBranch: string;
  nodeImage: string;
  buildOutputDir: string;
  targetPath: string;
  hostVar: string;
  userVar: string;
  keyVar: string;
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      const code = (error as Error & { code?: string }).code;
      if (code === "ENOENT") return false;
    }
    throw error;
  }
}

function requireInsideCwd(cwd: string, outputPath: string): string {
  const abs = isAbsolute(outputPath) ? resolve(outputPath) : resolve(cwd, outputPath);
  const rel = relative(cwd, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`output must be inside cwd: ${cwd}`);
  }
  return abs;
}

async function promptPlatform(defaultPlatform?: InitPlatform): Promise<InitPlatform> {
  if (defaultPlatform === "github" || defaultPlatform === "gitlab") return defaultPlatform;
  const answers = await inquirer.prompt<{ platform: InitPlatform }>([
    {
      type: "list",
      name: "platform",
      message: "选择 CI/CD 平台：",
      choices: [
        { name: "GitHub Actions", value: "github" },
        { name: "GitLab CI", value: "gitlab" },
      ],
    },
  ]);
  return answers.platform;
}

async function promptGithub(output?: string): Promise<GithubAnswers> {
  return await inquirer.prompt<GithubAnswers>([
    {
      type: "input",
      name: "output",
      message: "生成文件路径（相对项目根目录）：",
      default: output ?? ".github/workflows/deploy.yml",
      validate: (value: string) => (value.trim() ? true : "path is required"),
    },
    { type: "input", name: "branch", message: "触发分支：", default: "main" },
    { type: "input", name: "nodeVersion", message: "Node.js 版本：", default: "18" },
    { type: "input", name: "buildOutputDir", message: "构建产物目录：", default: "dist" },
    { type: "input", name: "targetPath", message: "服务器部署目录：", default: "/var/www/my-app" },
    {
      type: "input",
      name: "hostSecret",
      message: "GitHub Secret 名称（服务器 Host）：",
      default: "SERVER_HOST",
      validate: (value: string) => (value.trim() ? true : "secret name is required"),
    },
    {
      type: "input",
      name: "userSecret",
      message: "GitHub Secret 名称（服务器用户名）：",
      default: "SERVER_USER",
      validate: (value: string) => (value.trim() ? true : "secret name is required"),
    },
    {
      type: "input",
      name: "keySecret",
      message: "GitHub Secret 名称（SSH 私钥）：",
      default: "SSH_PRIVATE_KEY",
      validate: (value: string) => (value.trim() ? true : "secret name is required"),
    },
  ]);
}

async function promptGitlab(output?: string): Promise<GitlabAnswers> {
  return await inquirer.prompt<GitlabAnswers>([
    {
      type: "input",
      name: "output",
      message: "生成文件路径（相对项目根目录）：",
      default: output ?? ".gitlab-ci.yml",
      validate: (value: string) => (value.trim() ? true : "path is required"),
    },
    { type: "input", name: "deployBranch", message: "部署分支：", default: "main" },
    { type: "input", name: "nodeImage", message: "CI 镜像：", default: "node:18" },
    { type: "input", name: "buildOutputDir", message: "构建产物目录：", default: "dist" },
    { type: "input", name: "targetPath", message: "服务器部署目录：", default: "/var/www/my-app" },
    {
      type: "input",
      name: "hostVar",
      message: "GitLab CI 变量名（服务器 Host）：",
      default: "SERVER_HOST",
      validate: (value: string) => (value.trim() ? true : "variable name is required"),
    },
    {
      type: "input",
      name: "userVar",
      message: "GitLab CI 变量名（服务器用户名）：",
      default: "SERVER_USER",
      validate: (value: string) => (value.trim() ? true : "variable name is required"),
    },
    {
      type: "input",
      name: "keyVar",
      message: "GitLab CI 变量名（SSH 私钥）：",
      default: "SSH_PRIVATE_KEY",
      validate: (value: string) => (value.trim() ? true : "variable name is required"),
    },
  ]);
}

export async function toInit(options: ToInitOptions = {}): Promise<{ platform: InitPlatform; outputPath: string }> {
  if (!process.stdin.isTTY) {
    throw new Error("to-init requires an interactive terminal (TTY)");
  }

  const cwd = resolve(options.cwd?.trim() ? options.cwd.trim() : getCwd());
  logStep(`Init CI/CD in: ${cwd}`);

  const platform = await promptPlatform(options.platform);

  if (platform === "github") {
    const answers = await promptGithub(options.output);
    const outputPath = requireInsideCwd(cwd, answers.output);
    const content = generateGithubDeployWorkflow({
      branch: answers.branch,
      nodeVersion: answers.nodeVersion,
      buildOutputDir: answers.buildOutputDir,
      targetPath: answers.targetPath,
      serverHostSecret: answers.hostSecret.trim(),
      serverUserSecret: answers.userSecret.trim(),
      sshPrivateKeySecret: answers.keySecret.trim(),
    });

    const exists = await pathExists(outputPath);
    if (exists && !options.force) {
      const confirm = await inquirer.prompt<{ overwrite: boolean }>([
        { type: "confirm", name: "overwrite", message: `文件已存在，是否覆盖？\n${outputPath}`, default: false },
      ]);
      if (!confirm.overwrite) {
        logWarning("Canceled.");
        return { platform, outputPath };
      }
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, "utf8");
    logSuccess(`Generated: ${outputPath}`);
    logSuccess(`Next: add GitHub Secrets ${answers.hostSecret}, ${answers.userSecret}, ${answers.keySecret}`);
    return { platform, outputPath };
  }

  const answers = await promptGitlab(options.output);
  const outputPath = requireInsideCwd(cwd, answers.output);
  const content = generateGitlabDeployWorkflow({
    deployBranch: answers.deployBranch,
    nodeImage: answers.nodeImage,
    buildOutputDir: answers.buildOutputDir,
    targetPath: answers.targetPath,
    serverHostVar: answers.hostVar.trim(),
    serverUserVar: answers.userVar.trim(),
    sshPrivateKeyVar: answers.keyVar.trim(),
  });

  const exists = await pathExists(outputPath);
  if (exists && !options.force) {
    const confirm = await inquirer.prompt<{ overwrite: boolean }>([
      { type: "confirm", name: "overwrite", message: `文件已存在，是否覆盖？\n${outputPath}`, default: false },
    ]);
    if (!confirm.overwrite) {
      logWarning("Canceled.");
      return { platform, outputPath };
    }
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, "utf8");
  logSuccess(`Generated: ${outputPath}`);
  logSuccess(`Next: add GitLab CI variables ${answers.hostVar}, ${answers.userVar}, ${answers.keyVar}`);
  return { platform, outputPath };
}
