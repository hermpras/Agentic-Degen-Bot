import { Tool } from '../tool.interface.js';
import { getOctokit, handleGithubError } from './github.utils.js';

export const githubReadFileTool: Tool = {
  name: 'github_read_file',
  description:
    'Membaca isi dari satu file teks dalam repositori GitHub (Read-Only).',
  parameters: {
    type: 'object',
    properties: {
      owner: {
        type: 'string',
        description: 'Pemilik repositori (contoh: "octocat" atau "username")',
      },
      repo: {
        type: 'string',
        description: 'Nama repositori (contoh: "HoodBear")',
      },
      path: {
        type: 'string',
        description: 'Path file di dalam repo (contoh: "README.md" atau "src/index.ts")',
      },
      ref: {
        type: 'string',
        description: 'Branch, tag, atau commit SHA (opsional, default: default branch)',
      },
    },
    required: ['owner', 'repo', 'path'],
  },
  async execute(args: Record<string, any>) {
    const { owner, repo, path, ref } = args;

    if (!owner || !repo || !path) {
      return JSON.stringify({ error: 'Parameter "owner", "repo", dan "path" wajib diisi.' });
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
      if (Array.isArray(data) || data.type !== 'file' || !data.content) {
        return JSON.stringify({
          error: `Path "${path}" di ${owner}/${repo} adalah folder/direktori. Gunakan github_list_directory untuk melihat daftar filenya.`,
        });
      }

      const content = Buffer.from(data.content, 'base64').toString('utf-8');

      return JSON.stringify({
        owner,
        repo,
        path: data.path,
        sha: data.sha,
        size: data.size,
        content: content,
      });
    } catch (error: any) {
      return handleGithubError(error, `baca file "${path}" di ${owner}/${repo}`);
    }
  },
};
