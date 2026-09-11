import { Tool } from "../tool.interface.js";
import { getOctokit, handleGithubError } from "./github.utils.js";

export const githubGetWorkflowStatusTool: Tool = {
  name: "github_get_workflow_status",
  description:
    "Mengecek status eksekusi GitHub Actions workflow / CI build terbaru (status, kesimpulan/conclusion, branch, dan URL log) dari repositori GitHub (Read-Only).",
  riskLevel: "SAFE",
  parameters: {
    type: "object",
    properties: {
      owner: {
        type: "string",
        description: "Pemilik repositori",
      },
      repo: {
        type: "string",
        description: "Nama repositori",
      },
      workflow_file: {
        type: "string",
        description:
          'Nama file workflow YAML (contoh: "ci.yml" atau "build.yml", opsional)',
      },
    },
    required: ["owner", "repo"],
  },
  async execute(args: Record<string, any>) {
    const { owner, repo, workflow_file } = args;

    if (!owner || !repo) {
      return JSON.stringify({
        error: 'Parameter "owner" dan "repo" wajib diisi.',
      });
    }

    try {
      const octokit = getOctokit();

      let response: any;

      if (workflow_file) {
        response = await octokit.rest.actions.listWorkflowRuns({
          owner,
          repo,
          workflow_id: workflow_file,
          per_page: 5,
        });
      } else {
        response = await octokit.rest.actions.listWorkflowRunsForRepo({
          owner,
          repo,
          per_page: 5,
        });
      }

      const runs = response.data.workflow_runs.map((r: any) => ({
        id: r.id,
        name: r.name,
        event: r.event,
        status: r.status,
        conclusion: r.conclusion,
        branch: r.head_branch,
        commitMessage: r.head_commit?.message,
        createdAt: r.created_at,
        html_url: r.html_url,
      }));

      return JSON.stringify({
        owner,
        repo,
        workflowFilter: workflow_file || "all",
        totalRunsRetrieved: runs.length,
        latestRun: runs[0] || null,
        recentRuns: runs,
      });
    } catch (error: any) {
      return handleGithubError(
        error,
        `cek workflow status di ${owner}/${repo}`,
      );
    }
  },
};
