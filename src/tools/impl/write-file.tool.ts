import fs from "fs/promises";
import path from "path";
import { Tool } from "../tool.interface.js";
import {
  resolveWorkspacePath,
  ensureWorkspaceDirExists,
} from "./workspace.utils.js";

export const writeFileTool: Tool = {
  name: "write_file",
  description:
    "Menulis atau membuat file baru di dalam folder workspace/. Gunakan tool ini jika pengguna meminta menyimpan teks, membuat dokumen, atau menyimpan catatan.",
  riskLevel: "APPROVAL",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          'Path relatif file di dalam folder workspace/ (contoh: "catatan.txt" atau "notes/todo.md")',
      },
      content: {
        type: "string",
        description: "Isi teks yang akan dituliskan ke dalam file",
      },
    },
    required: ["path", "content"],
  },
  async execute(args: Record<string, any>) {
    const filePathArg = args.path;
    const content = args.content;

    if (!filePathArg || typeof filePathArg !== "string") {
      return JSON.stringify({
        error: 'Parameter "path" wajib diisi dengan string.',
      });
    }

    if (content === undefined || content === null) {
      return JSON.stringify({
        error: 'Parameter "content" wajib diisi dengan teks.',
      });
    }

    try {
      await ensureWorkspaceDirExists();

      const targetPath = resolveWorkspacePath(filePathArg);

      const parentDir = path.dirname(targetPath);
      await fs.mkdir(parentDir, { recursive: true });

      await fs.writeFile(targetPath, String(content), "utf-8");

      return JSON.stringify({
        success: true,
        message: `File "${filePathArg}" berhasil disimpan di workspace/.`,
        path: filePathArg,
      });
    } catch (error: any) {
      return JSON.stringify({
        error: error.message || String(error),
      });
    }
  },
};
