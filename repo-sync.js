const { exec } = require("child_process");
const { promisify } = require("util");
const path = require("path");

const execAsync = promisify(exec);
const WORKSPACE_ROOT = path.resolve(__dirname);

function getRepoConfig() {
  const url = process.env.GITHUB_REPO_URL?.trim();
  if (!url) return null;

  return {
    url,
    branch: process.env.GITHUB_REPO_BRANCH?.trim() || "main",
    workOnCurrentBranch: process.env.GITHUB_WORK_ON_BRANCH !== "false",
    autoCreatePR: process.env.GITHUB_AUTO_CREATE_PR === "true",
  };
}

function buildAgentRepoPayload(config) {
  if (!config) return {};

  return {
    repos: [
      {
        url: config.url,
        startingRef: config.branch,
      },
    ],
    workOnCurrentBranch: config.workOnCurrentBranch,
    autoCreatePR: config.autoCreatePR,
  };
}

async function gitExec(command) {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: WORKSPACE_ROOT,
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 2,
      windowsHide: true,
      shell: true,
    });

    return {
      ok: true,
      stdout: (stdout || "").trim(),
      stderr: (stderr || "").trim(),
      exitCode: 0,
    };
  } catch (error) {
    return {
      ok: false,
      stdout: (error.stdout || "").trim(),
      stderr: (error.stderr || error.message || "").trim(),
      exitCode: error.code ?? 1,
    };
  }
}

function resolvePullBranch(repoConfig, runGit) {
  const branches = runGit?.branches || [];
  if (branches.length > 0 && branches[0].branch) {
    return branches[0].branch;
  }
  return repoConfig.branch;
}

async function getLocalGitStatus() {
  const branch = await gitExec("git rev-parse --abbrev-ref HEAD");
  const head = await gitExec("git rev-parse --short HEAD");
  const remote = await gitExec("git remote get-url origin");
  const dirty = await gitExec("git status --porcelain");

  return {
    branch: branch.stdout || null,
    head: head.stdout || null,
    remote: remote.stdout || null,
    dirty: Boolean(dirty.stdout),
  };
}

async function syncFromRemote(repoConfig, runGit = null) {
  const branch = resolvePullBranch(repoConfig, runGit);
  const before = await gitExec("git rev-parse HEAD");

  const fetch = await gitExec("git fetch origin");
  if (!fetch.ok) {
    return {
      ok: false,
      branch,
      error: fetch.stderr || fetch.stdout || "git fetch gagal",
    };
  }

  const pull = await gitExec(`git pull origin ${branch}`);
  if (!pull.ok) {
    return {
      ok: false,
      branch,
      error: pull.stderr || pull.stdout || "git pull gagal",
    };
  }

  const after = await gitExec("git rev-parse HEAD");
  const changed = before.stdout && after.stdout && before.stdout !== after.stdout;
  const output = [pull.stdout, pull.stderr].filter(Boolean).join("\n").trim();

  return {
    ok: true,
    branch,
    changed,
    message: changed
      ? `Kode lokal disinkronkan dari origin/${branch}.`
      : output || `Sudah up-to-date dengan origin/${branch}.`,
    output,
    prUrl: runGit?.branches?.find((b) => b.prUrl)?.prUrl || null,
  };
}

module.exports = {
  WORKSPACE_ROOT,
  getRepoConfig,
  buildAgentRepoPayload,
  getLocalGitStatus,
  syncFromRemote,
  resolvePullBranch,
};
