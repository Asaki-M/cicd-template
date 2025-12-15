import chalk from "chalk";

export type GitStatusFile = {
  path: string;
  index?: string;
  working_dir?: string;
};

function colorStatusChar(value: string): string {
  switch (value) {
    case "M":
      return chalk.yellow(value);
    case "A":
      return chalk.green(value);
    case "D":
      return chalk.red(value);
    case "R":
    case "C":
      return chalk.cyan(value);
    case "?":
      return chalk.gray(value);
    case "!":
      return chalk.redBright(value);
    case " ":
      return chalk.dim(value);
    default:
      return chalk.dim(value);
  }
}

export function logStep(message: string): void {
  process.stdout.write(`\n${chalk.bold(chalk.cyan("==>"))} ${chalk.cyanBright(message)}\n`);
}

export function logHeading(message: string): void {
  process.stdout.write(`${chalk.bold(message)}\n`);
}

export function logWarning(message: string): void {
  process.stdout.write(`${chalk.yellow(message)}\n`);
}

export function logSuccess(message: string): void {
  process.stdout.write(`${chalk.green(message)}\n`);
}

export function formatGitStatusLine(file: GitStatusFile): string {
  const x = file.index ?? " ";
  const y = file.working_dir ?? " ";
  return `${colorStatusChar(x)}${colorStatusChar(y)} ${chalk.bold(file.path)}`;
}

export function formatCliError(name: string, message: string): string {
  return `${chalk.red(name)}: ${chalk.redBright(message)}`;
}
