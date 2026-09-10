import fs from 'fs/promises';
import { Tool } from '../tool.interface.js';
import { resolveWorkspacePath } from './workspace.utils.js';

export const readFileTool: Tool = {
  name: 'read_file',
  description:
    'Membaca isi file teks dari folder workspace/. Gunakan tool ini jika pengguna meminta membaca catatan, dokumen, atau file dari workspace.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          'Path relatif file di dalam folder workspace/ (contoh: "catatan.txt" atau "notes/todo.md")',
      },
    },
    required: ['path'],
  },
  async execute(args: Record<string, any>) {
    const filePathArg = args.path;

    if (!filePathArg || typeof filePathArg !== 'string') {
      return JSON.stringify({ error: 'Parameter "path" wajib diisi dengan string.' });
    }

    try {
      const targetPath = resolveWorkspacePath(filePathArg);
      const content = await fs.readFile(targetPath, 'utf-8');

      return JSON.stringify({
        path: filePathArg,
        content: content,
      });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return JSON.stringify({
          error: `File "${filePathArg}" tidak ditemukan di folder workspace/.`,
        });
      }
      return JSON.stringify({
        error: error.message || String(error),
      });
    }
  },
};
