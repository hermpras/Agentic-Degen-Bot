import { AgentDatabase } from "../../database/agent-database.js";
import { AccountManager } from "../../accounts/account-manager.js";
import { Tool } from "../tool.interface.js";

const database = new AgentDatabase("data/agent.db");
const accountManager = new AccountManager(database);

export const renameAccountTool: Tool = {
  name: "rename_account",

  description:
    "Mengganti nama account whitelist yang SUDAH ADA. Gunakan ketika user ingin memperbaiki typo atau mengganti nama account. Jangan gunakan create_account untuk rename.",

  riskLevel: "SAFE",

  parameters: {
    type: "object",
    properties: {
      currentName: {
        type: "string",
        description: "Nama account saat ini, contoh: seccondAccount.",
      },

      newName: {
        type: "string",
        description: "Nama account baru, contoh: secondAccount.",
      },
    },

    required: ["currentName", "newName"],
  },

  execute: async (args: Record<string, any>) => {
    try {
      const currentName = String(args.currentName ?? "").trim();

      const newName = String(args.newName ?? "").trim();

      if (!currentName) {
        return JSON.stringify({
          success: false,
          error: "Nama account saat ini tidak boleh kosong.",
        });
      }

      if (!newName) {
        return JSON.stringify({
          success: false,
          error: "Nama account baru tidak boleh kosong.",
        });
      }

      const account = accountManager.getAccountByName(currentName);

      if (!account) {
        return JSON.stringify({
          success: false,
          error: `Account dengan nama "${currentName}" tidak ditemukan.`,
        });
      }

      const renamed = accountManager.renameAccount(currentName, newName);

      if (!renamed) {
        return JSON.stringify({
          success: false,
          error: `Gagal me-rename account "${currentName}".`,
        });
      }

      return JSON.stringify({
        success: true,
        message: "Nama account berhasil diperbarui.",
        account: {
          id: renamed.id,
          name: renamed.name,
          twitterHandle: renamed.twitterHandle,
          walletAddress: renamed.walletAddress,
          status: renamed.status,
          updatedAt: renamed.updatedAt,
        },
      });
    } catch (error: any) {
      console.error("❌ [rename_account] Gagal me-rename account:", error);

      return JSON.stringify({
        success: false,
        error: error?.message || String(error),
      });
    }
  },
};
