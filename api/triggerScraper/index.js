const DEFAULT_OWNER = "balrng";
const DEFAULT_REPO = "kogb";
const DEFAULT_WORKFLOW = "local-scraper.yml";
const DEFAULT_REF = "main";

async function dispatchWorkflow({ token, owner, repo, workflow, ref }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "User-Agent": "kogb-trigger",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({ ref })
  });

  return response;
}

module.exports = async function (context, req) {
  const secret = process.env.SCRAPER_TRIGGER_SECRET;
  if (secret) {
    const provided = req?.headers?.["x-trigger-secret"] || req?.query?.secret;
    if (!provided || provided !== secret) {
      context.res = {
        status: 401,
        body: "Unauthorized"
      };
      return;
    }
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || DEFAULT_OWNER;
  const repo = process.env.GITHUB_REPO || DEFAULT_REPO;
  const workflow = process.env.GITHUB_WORKFLOW || DEFAULT_WORKFLOW;
  const ref = process.env.GITHUB_WORKFLOW_REF || DEFAULT_REF;

  if (!token) {
    context.res = {
      status: 500,
      body: "Missing GITHUB_TOKEN"
    };
    return;
  }

  try {
    const response = await dispatchWorkflow({ token, owner, repo, workflow, ref });
    if (response.status === 204) {
      context.res = {
        status: 200,
        body: "Triggered"
      };
      return;
    }

    const text = await response.text();
    context.res = {
      status: response.status,
      body: `GitHub API error: ${text}`
    };
  } catch (err) {
    context.res = {
      status: 500,
      body: `Failed to trigger workflow: ${err.message}`
    };
  }
};
