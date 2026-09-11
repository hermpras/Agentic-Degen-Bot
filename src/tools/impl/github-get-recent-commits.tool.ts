import { Tool } from "../tool.interface.js";
import { getOctokit, handleGithubError } from "./github.utils.js";

export const githubGetRecentCommitsTool: Tool = {
  name: "github_get_recent_commits",
  description:
    "Mendapatkan riwayat commit terbaru (SHA, pesan commit, pembuat/author, dan tanggal) dari repositori GitHub (Read-Only).",
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
      limit: {
        type: "number",
        description:
          "Jumlah commit terbaru yang ingin diambil (opsional, default: 5, maks: 20)",
      },
    },
    required: ["owner", "repo"],
  },
  async execute(args: Record<string, any>) {
    const { owner, repo, limit = 5 } = args;

    if (!owner || !repo) {
      return JSON.stringify({
        error: 'Parameter "owner" dan "repo" wajib diisi.',
      });
    }

    const perPage = Math.min(Math.max(Number(limit) || 5, 1), 20);

    try {
      const octokit = getOctokit();

      const response = await octokit.rest.repos.listCommits({
        owner,
        repo,
        per_page: perPage,
      });

      const commits = response.data.map((c) => ({
        sha: c.sha.substring(0, 7),
        fullSha: c.sha,
        message: c.commit.message,
        author: {
          name: c.commit.author?.name || c.author?.login || "Unknown",
          date: c.commit.author?.date,
        },
        url: c.html_url,
      }));

      return JSON.stringify({
        owner,
        repo,
        totalRetrieved: commits.length,
        commits,
      });
    } catch (error: any) {
      return handleGithubError(
        error,
        `ambil commit terbaru dari ${owner}/${repo}`,
      );
    }
  },
};
