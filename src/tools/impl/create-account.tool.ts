import { AgentDatabase } from "../../database/agent-database.js";
import {
  AccountManager,
  CreateAccountInput,
} from "../../accounts/account-manager.js";
import { Tool, ToolRiskLevel } from "../tool.interface.js";

const database = new AgentDatabase("data/agent.db");
const accountManager = new AccountManager(database);

export const createAccountTool: Tool = {
  name: "create_account",

  description:
    "Membuat account profile baru untuk sistem whitelist. Account dapat memiliki nama, Twitter/X handle, wallet address, dan default proof URL. Default proof URL dapat digunakan sebagai proof bawaan account ketika task whitelist membutuhkan URL bukti.",

  riskLevel: "SAFE" as ToolRiskLevel,

  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Nama unik account, contoh: acc01",
      },

      twitterHandle: {
        type: "string",
        description:
          "Twitter/X handle account, contoh: @username. Boleh dikosongkan jika tidak ada.",
      },

      walletAddress: {
        type: "string",
        description:
          "Alamat wallet account, contoh: 0x1234.... Boleh dikosongkan jika belum ada.",
      },

      defaultProofUrl: {
        type: "string",
        description:
          "URL proof/bukti default milik account yang dapat digunakan untuk task whitelist yang membutuhkan proof URL. Boleh dikosongkan jika belum ada.",
      },
    },

    required: ["name"],
  },

  execute: async (args: Record<string, any>) => {
    try {
      const input: CreateAccountInput = {
        name: String(args.name ?? ""),

        twitterHandle:
          args.twitterHandle !== undefined
            ? String(args.twitterHandle)
            : undefined,

        walletAddress:
          args.walletAddress !== undefined
            ? String(args.walletAddress)
            : undefined,

        defaultProofUrl:
          args.defaultProofUrl !== undefined
            ? String(args.defaultProofUrl)
            : undefined,
      };

      const account = accountManager.createAccount(input);

      return JSON.stringify({
        success: true,
        message: "Account berhasil dibuat.",

        account: {
          id: account.id,
          name: account.name,
          twitterHandle: account.twitterHandle,
          walletAddress: account.walletAddress,
          defaultProofUrl: account.defaultProofUrl,
          status: account.status,
        },
      });
    } catch (error: any) {
      console.error("❌ [create_account] Gagal membuat account:", error);

      return JSON.stringify({
        success: false,
        error: error?.message || String(error),
      });
    }
  },
};
