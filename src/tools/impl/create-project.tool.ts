import { AgentDatabase } from "../../database/agent-database.js";
import {
  ProjectManager,
  WhitelistStatus,
  MintStatus,
} from "../../projects/project-manager.js";
import { Tool } from "../tool.interface.js";

const database = new AgentDatabase("data/agent.db");
const projectManager = new ProjectManager(database);

export const createProjectTool: Tool = {
  name: "create_project",

  description:
    "Membuat project whitelist baru ke database. Gunakan ketika user ingin mendaftarkan project baru. Project dapat memiliki website, Twitter/X, tanggal mint, harga mint, status whitelist, status mint, dan catatan.",

  riskLevel: "SAFE",

  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Nama project, contoh: HoodBear.",
      },

      websiteUrl: {
        type: "string",
        description: "URL website resmi project, jika diketahui.",
      },

      twitterUrl: {
        type: "string",
        description: "URL Twitter/X resmi project, jika diketahui.",
      },

      mintDate: {
        type: "string",
        description:
          "Tanggal atau waktu mint jika diketahui. Simpan dalam format ISO atau teks yang jelas.",
      },

      mintPrice: {
        type: "string",
        description: "Harga mint jika diketahui, contoh: 0.05 ETH atau FREE.",
      },

      whitelistStatus: {
        type: "string",
        enum: ["UNKNOWN", "NOT_OPEN", "OPEN", "CLOSED", "COMPLETED"],
        description: "Status whitelist project.",
      },

      mintStatus: {
        type: "string",
        enum: ["UNKNOWN", "UPCOMING", "LIVE", "SOLD_OUT", "ENDED"],
        description: "Status mint project.",
      },

      notes: {
        type: "string",
        description: "Catatan tambahan mengenai project.",
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
          error: "Nama project tidak boleh kosong.",
        });
      }

      const existing = projectManager.getProjectByName(name);

      if (existing) {
        return JSON.stringify({
          success: false,
          error: `Project "${name}" sudah ada di database.`,
          project: {
            id: existing.id,
            name: existing.name,
            websiteUrl: existing.websiteUrl,
            twitterUrl: existing.twitterUrl,
            mintDate: existing.mintDate,
            mintPrice: existing.mintPrice,
            whitelistStatus: existing.whitelistStatus,
            mintStatus: existing.mintStatus,
          },
        });
      }

      const whitelistStatus =
        args.whitelistStatus !== undefined
          ? String(args.whitelistStatus).toUpperCase()
          : "UNKNOWN";

      const validWhitelistStatuses = [
        "UNKNOWN",
        "NOT_OPEN",
        "OPEN",
        "CLOSED",
        "COMPLETED",
      ];

      if (!validWhitelistStatuses.includes(whitelistStatus)) {
        return JSON.stringify({
          success: false,
          error: "whitelistStatus tidak valid.",
        });
      }

      const mintStatus =
        args.mintStatus !== undefined
          ? String(args.mintStatus).toUpperCase()
          : "UNKNOWN";

      const validMintStatuses = [
        "UNKNOWN",
        "UPCOMING",
        "LIVE",
        "SOLD_OUT",
        "ENDED",
      ];

      if (!validMintStatuses.includes(mintStatus)) {
        return JSON.stringify({
          success: false,
          error: "mintStatus tidak valid.",
        });
      }

      const project = projectManager.createProject({
        name,
        websiteUrl:
          args.websiteUrl !== undefined ? String(args.websiteUrl) : undefined,
        twitterUrl:
          args.twitterUrl !== undefined ? String(args.twitterUrl) : undefined,
        mintDate:
          args.mintDate !== undefined ? String(args.mintDate) : undefined,
        mintPrice:
          args.mintPrice !== undefined ? String(args.mintPrice) : undefined,
        whitelistStatus: whitelistStatus as WhitelistStatus,
        mintStatus: mintStatus as MintStatus,
        notes: args.notes !== undefined ? String(args.notes) : undefined,
      });

      return JSON.stringify({
        success: true,
        message: "Project berhasil dibuat.",
        project: {
          id: project.id,
          name: project.name,
          websiteUrl: project.websiteUrl,
          twitterUrl: project.twitterUrl,
          mintDate: project.mintDate,
          mintPrice: project.mintPrice,
          whitelistStatus: project.whitelistStatus,
          mintStatus: project.mintStatus,
          notes: project.notes,
          createdAt: project.createdAt,
        },
      });
    } catch (error: any) {
      console.error("❌ [create_project] Gagal membuat project:", error);

      return JSON.stringify({
        success: false,
        error: error?.message || String(error),
      });
    }
  },
};
