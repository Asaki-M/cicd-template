export type GitlabDeployWorkflowOptions = {
  nodeImage?: string;
  deployBranch?: string;
  buildOutputDir?: string;
  targetPath?: string;
  serverHostVar?: string;
  serverUserVar?: string;
  sshPrivateKeyVar?: string;
};

function gitlabVar(varName: string): string {
  return "$" + varName;
}

export function generateGitlabDeployWorkflow(options: GitlabDeployWorkflowOptions): string {
  const nodeImage = options.nodeImage?.trim() ? options.nodeImage.trim() : "node:18";
  const deployBranch = options.deployBranch?.trim() ? options.deployBranch.trim() : "main";
  const buildOutputDir = options.buildOutputDir?.trim() ? options.buildOutputDir.trim() : "dist";
  const targetPath = options.targetPath?.trim() ? options.targetPath.trim() : "/var/www/my-app";
  const serverHostVar = options.serverHostVar?.trim() ? options.serverHostVar.trim() : "SERVER_HOST";
  const serverUserVar = options.serverUserVar?.trim() ? options.serverUserVar.trim() : "SERVER_USER";
  const sshPrivateKeyVar = options.sshPrivateKeyVar?.trim() ? options.sshPrivateKeyVar.trim() : "SSH_PRIVATE_KEY";

  return `stages:
  - build
  - deploy

image: ${nodeImage}

cache:
  paths:
    - node_modules/

build_job:
  stage: build
  script:
    - npm install
    - npm run build
  artifacts:
    paths:
      - ${buildOutputDir}/
    expire_in: 1 hour

deploy_job:
  stage: deploy
  before_script:
    - 'command -v ssh-agent >/dev/null || ( apt-get update -y && apt-get install openssh-client -y )'
    - eval $(ssh-agent -s)
    - echo "${gitlabVar(sshPrivateKeyVar)}" | tr -d '\\r' | ssh-add -
    - mkdir -p ~/.ssh
    - chmod 700 ~/.ssh
    - ssh-keyscan ${gitlabVar(serverHostVar)} >> ~/.ssh/known_hosts
  script:
    - scp -r ${buildOutputDir}/* ${gitlabVar(serverUserVar)}@${gitlabVar(serverHostVar)}:${targetPath}
    - ssh ${gitlabVar(serverUserVar)}@${gitlabVar(serverHostVar)} "cd ${targetPath} && pm2 restart all"
  only:
    - ${deployBranch}
`;
}
