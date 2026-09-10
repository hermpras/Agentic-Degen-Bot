import path from 'path';
import fs from 'fs/promises';

const WORKSPACE_DIR = path.resolve(process.cwd(), 'workspace');

/**
 * Memastikan folder workspace/ ada
 */
export async function ensureWorkspaceDirExists(): Promise<string> {
  await fs.mkdir(WORKSPACE_DIR, { recursive: true });
  return WORKSPACE_DIR;
}

/**
 * Menyelesaikan path dan memastikan path berada di dalam folder workspace/.
 * Mencegah Path Traversal (seperti ../../) dan akses di luar workspace.
 */
export function resolveWorkspacePath(relativePath: string): string {
  const resolvedPath = path.resolve(WORKSPACE_DIR, relativePath);

  if (!resolvedPath.startsWith(WORKSPACE_DIR + path.sep) && resolvedPath !== WORKSPACE_DIR) {
    throw new Error(
      `Akses Ditolak (Security Guardrail): Path "${relativePath}" berada di luar folder workspace/.`
    );
  }

  return resolvedPath;
}
