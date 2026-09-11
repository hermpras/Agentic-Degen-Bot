import { AgentDatabase } from "../../database/agent-database.js";
import { AccountManager } from "../../accounts/account-manager.js";
import { Tool } from "../tool.interface.js";

const database = new AgentDatabase("data/agent.db");
const accountManager = new AccountManager(database);

export const listAccountsTool: Tool = {
  name: "list_accounts",

  description:
    "Menampilkan semua account whitelist yang tersimpan di sistem, termasuk nama account, Twitter/X handle, wallet address, dan status.",

  riskLevel: "SAFE",

  parameters: {
    type: "object",
    properties: {
      activeOnly: {
        type: "boolean",
        description:
          "Jika true, hanya tampilkan account dengan status ACTIVE. Jika false atau tidak diberikan, tampilkan semua account.",
      },
    },
    required: [],
  },

  execute: async (args: Record<string, any>) => {
    try {
      const activeOnly = args.activeOnly === true;

      const accounts = activeOnly
        ? accountManager.getActiveAccounts()
        : accountManager.getAllAccounts();

      return JSON.stringify({
        success: true,
        count: accounts.length,
        accounts: accounts.map((account) => ({
          id: account.id,
          name: account.name,
          twitterHandle: account.twitterHandle,
          walletAddress: account.walletAddress,
          status: account.status,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        })),
      });
    } catch (error: any) {
      console.error(
        "❌ [list_accounts] Gagal mengambil daftar account:",
        error,
      );

      return JSON.stringify({
        success: false,
        error: error?.message || String(error),
      });
    }
  },
};
