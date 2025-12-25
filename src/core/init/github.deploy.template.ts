export type GithubDeployWorkflowOptions = {
  branch?: string;
  nodeVersion?: string;
  buildOutputDir?: string;
  targetPath?: string;
  serverHostSecret?: string;
  serverUserSecret?: string;
  sshPrivateKeySecret?: string;
};

function githubSecret(secretName: string): string {
  return "${{ secrets." + secretName + " }}";
}

export function generateGithubDeployWorkflow(options: GithubDeployWorkflowOptions): string {
  const branch = options.branch?.trim() ? options.branch.trim() : "main";
  const nodeVersion = options.nodeVersion?.trim() ? options.nodeVersion.trim() : "18";
  const buildOutputDir = options.buildOutputDir?.trim() ? options.buildOutputDir.trim() : "dist";
  const targetPath = options.targetPath?.trim() ? options.targetPath.trim() : "/var/www/my-app";
  const serverHostSecret = options.serverHostSecret?.trim() ? options.serverHostSecret.trim() : "SERVER_HOST";
  const serverUserSecret = options.serverUserSecret?.trim() ? options.serverUserSecret.trim() : "SERVER_USER";
  const sshPrivateKeySecret = options.sshPrivateKeySecret?.trim() ? options.sshPrivateKeySecret.trim() : "SSH_PRIVATE_KEY";

  return `name: Node.js CI/CD

on:
  push:
    branches: [ ${branch} ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "${nodeVersion}"
          cache: "npm"

      - name: Install and build
        run: |
          npm install
          npm run build --if-present

      - name: Upload files (SCP)
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${githubSecret(serverHostSecret)}
          username: ${githubSecret(serverUserSecret)}
          key: ${githubSecret(sshPrivateKeySecret)}
          source: "${buildOutputDir}/*,package.json"
          target: "${targetPath}"

      - name: Run remote commands
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${githubSecret(serverHostSecret)}
          username: ${githubSecret(serverUserSecret)}
          key: ${githubSecret(sshPrivateKeySecret)}
          script: |
            cd ${targetPath}
            npm install --production
            pm2 restart all || pm2 start server.js
`;
}
