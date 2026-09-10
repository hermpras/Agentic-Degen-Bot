import { Octokit } from '@octokit/rest';
import { config } from '../../config/index.js';

/**
 * Mengembalikan instance Octokit yang diotentikasi jika GITHUB_TOKEN tersedia
 */
export function getOctokit(): Octokit {
  const token = config.githubToken;
  return new Octokit({
    auth: token || undefined,
  });
}

/**
 * Menangani error GitHub API secara konsisten dan mengembalikan format JSON yang informatif
 */
export function handleGithubError(error: any, context: string): string {
  console.error(`❌ [GitHub Error - ${context}]:`, error);
  const status = error.status;

  if (status === 404) {
    return JSON.stringify({
      error: `Resource tidak ditemukan (404) pada ${context}. Pastikan owner, repo, path, atau ref sudah benar.`,
    });
  }
  if (status === 401) {
    return JSON.stringify({
      error: `Autentikasi gagal (401). GITHUB_TOKEN di file .env tidak valid atau kadaluarsa.`,
    });
  }
  if (status === 403) {
    return JSON.stringify({
      error: `Akses ditolak atau Rate Limit GitHub terlampaui (403) pada ${context}. Cek token dan batas akses.`,
    });
  }

  return JSON.stringify({
    error: `Gagal memproses permintaan GitHub (${context}): ${error.message || String(error)}`,
  });
}
