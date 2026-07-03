const { runWorkspaceAgent, isWorkspaceActionMode, isLikelyAction } = require("./workspace-agent");

async function tryLocalAgentAction(message, mode, cursorDeps = null) {
  if (!isWorkspaceActionMode(mode)) return null;
  return runWorkspaceAgent(message, mode, cursorDeps);
}

function shouldSkipCursorApi(mode) {
  return isWorkspaceActionMode(mode);
}

module.exports = {
  tryLocalAgentAction,
  shouldSkipCursorApi,
  isWorkspaceActionMode,
  isLikelyAction,
};
