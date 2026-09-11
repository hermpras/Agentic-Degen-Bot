import { Tool } from "../tool.interface.js";
import { getOctokit, handleGithubError } from "./github.utils.js";

export const githubListDirectoryTool: Tool = {
  name: "github_list_directory",
  description:
    "Melihat daftar isi file dan folder/direktori dalam repositori GitHub (Read-Only).",
  riskLevel: "SAFE",
  parameters: {
    type: "object",
    properties: {
      owner: {
        type: "string",
        description: 'Pemilik repositori (contoh: "octocat")',
      },
      repo: {
        type: "string",
        description: 'Nama repositori (contoh: "HoodBear")',
      },
      path: {
        type: "string",
        description:
          'Path folder yang ingin di-list (opsional, default: root folder "")',
      },
      ref: {
        type: "string",
        description: "Branch, tag, atau commit SHA (opsional)",
      },
    },
    required: ["owner", "repo"],
  },
  async execute(args: Record<string, any>) {
    const { owner, repo, path = "", ref } = args;

    if (!owner || !repo) {
      return JSON.stringify({
        error: 'Parameter "owner" dan "repo" wajib diisi.',
      });
    }

    try {
      const octokit = getOctokit();

      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      const data = response.data;

      if (!Array.isArray(data)) {
        return JSON.stringify({
          error: `Path "${path}" di ${owner}/${repo} adalah file tunggal, bukan folder. Gunakan github_read_file untuk membaca isinya.`,
        });
      }

      const items = data.map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size,
        html_url: item.html_url,
      }));

      return JSON.stringify({
        owner,
        repo,
        path: path || "/",
        totalItems: items.length,
        items: items,
      });
    } catch (error: any) {
      return handleGithubError(
        error,
        `list direktori "${path || "/"}" di ${owner}/${repo}`,
      );
    }
  },
};
