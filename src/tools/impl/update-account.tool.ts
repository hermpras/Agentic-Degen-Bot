import { AgentDatabase } from "../../database/agent-database.js";
import {
  AccountManager,
  AccountStatus,
  UpdateAccountInput,
} from "../../accounts/account-manager.js";
import { Tool } from "../tool.interface.js";

const database = new AgentDatabase("data/agent.db");
const accountManager = new AccountManager(database);

export const updateAccountTool: Tool = {
  name: "update_account",

  description:
    "Memperbarui account whitelist yang SUDAH ADA berdasarkan nama account. Gunakan tool ini jika user ingin mengubah Twitter/X, wallet address, atau status account. JANGAN gunakan create_account untuk mengubah data account yang sudah ada.",

  riskLevel: "SAFE",

  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description:
          "Nama account yang SUDAH ADA dan ingin diperbarui, contoh: firstAccount atau seccondAccount.",
      },

      twitterHandle: {
        type: "string",
        description:
          "Twitter/X handle baru, contoh: @newusername. Hanya isi jika user meminta mengubah Twitter/X.",
      },

      walletAddress: {
        type: "string",
        description:
          "Wallet address baru. Hanya isi jika user meminta mengubah wallet.",
      },

      status: {
        type: "string",
        enum: ["ACTIVE", "INACTIVE"],
        description:
          "Status baru account. Gunakan ACTIVE untuk mengaktifkan atau INACTIVE untuk menonaktifkan.",
      },
    },

    required: ["name"],
  },

  execute: async (args: Record<string, any>) => {
    try {
      const name = String(args.name ?? "").trim();

      if (!name) {
        return JSON.stringify({
          success: false,
          error: "Nama account tidak boleh kosong.",
        });
      }

      const existing = accountManager.getAccountByName(name);

      if (!existing) {
        return JSON.stringify({
          success: false,
          error:
            `Account dengan nama "${name}" tidak ditemukan. ` +
            "Jangan membuat account baru untuk permintaan update. " +
            "Beritahu user bahwa account tersebut tidak ditemukan.",
        });
      }

      const input: UpdateAccountInput = {};

      if (args.twitterHandle !== undefined) {
        input.twitterHandle =
          args.twitterHandle === null
            ? null
            : String(args.twitterHandle).trim();
      }

      if (args.walletAddress !== undefined) {
        input.walletAddress =
          args.walletAddress === null
            ? null
            : String(args.walletAddress).trim();
      }

      if (args.status !== undefined) {
        const status = String(args.status).toUpperCase();

        if (status !== "ACTIVE" && status !== "INACTIVE") {
          return JSON.stringify({
            success: false,
            error: "Status account harus ACTIVE atau INACTIVE.",
          });
        }

        input.status = status as AccountStatus;
      }

      if (Object.keys(input).length === 0) {
        return JSON.stringify({
          success: false,
          error:
            "Tidak ada data yang perlu diubah. Tentukan Twitter/X, wallet address, atau status baru.",
        });
      }

      const updated = accountManager.updateAccount(existing.id, input);

      if (!updated) {
        return JSON.stringify({
          success: false,
          error: `Gagal memperbarui account "${name}".`,
        });
      }

      return JSON.stringify({
        success: true,
        message: "Account berhasil diperbarui.",
        account: {
          id: updated.id,
          name: updated.name,
          twitterHandle: updated.twitterHandle,
          walletAddress: updated.walletAddress,
          status: updated.status,
          updatedAt: updated.updatedAt,
        },
      });
    } catch (error: any) {
      console.error("❌ [update_account] Gagal memperbarui account:", error);

      return JSON.stringify({
        success: false,
        error: error?.message || String(error),
      });
    }
  },
};
