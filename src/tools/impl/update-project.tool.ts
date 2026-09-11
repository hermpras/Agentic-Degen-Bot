import { AgentDatabase } from "../../database/agent-database.js";
import {
  ProjectManager,
  WhitelistStatus,
  MintStatus,
} from "../../projects/project-manager.js";
import { Tool } from "../tool.interface.js";

const database = new AgentDatabase("data/agent.db");
const projectManager = new ProjectManager(database);

export const updateProjectTool: Tool = {
  name: "update_project",

  description:
    "Memperbarui informasi project yang sudah ada di database. " +
    "Bisa mengubah website, Twitter/X, tanggal mint, harga mint, " +
    "status whitelist, status mint, catatan, dan waktu terakhir dicek. " +
    "Project dapat dicari berdasarkan nama atau ID. " +
    "Hanya field yang diberikan user yang akan diubah.",

  riskLevel: "SAFE",

  parameters: {
    type: "object",

    properties: {
      projectId: {
        type: "number",
        description: "ID project jika diketahui.",
      },

      projectName: {
        type: "string",
        description: "Nama project yang ingin diperbarui.",
      },

      websiteUrl: {
        type: "string",
        description: "URL website baru project.",
      },

      twitterUrl: {
        type: "string",
        description: "URL Twitter/X baru project.",
      },

      mintDate: {
        type: "string",
        description: "Tanggal/waktu mint project.",
      },

      mintPrice: {
        type: "string",
        description: "Harga mint project, misalnya 0.02 ETH.",
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
        description: "Catatan project.",
      },

      lastCheckedAt: {
        type: "string",
        description: "Waktu terakhir informasi project diverifikasi.",
      },
    },

    required: [],
  },

  execute: async (args: Record<string, any>) => {
    try {
      let project;

      if (args.projectId !== undefined) {
        const projectId = Number(args.projectId);

        if (!Number.isInteger(projectId) || projectId <= 0) {
          return JSON.stringify({
            success: false,
            error: "projectId tidak valid.",
          });
        }

        project = projectManager.getProjectById(projectId);
      } else if (args.projectName !== undefined) {
        const projectName = String(args.projectName).trim();

        if (!projectName) {
          return JSON.stringify({
            success: false,
            error: "projectName tidak boleh kosong.",
          });
        }

        project = projectManager.getProjectByName(projectName);
      } else {
        return JSON.stringify({
          success: false,
          error: "Berikan projectName atau projectId.",
        });
      }

      if (!project) {
        return JSON.stringify({
          success: false,
          error: "Project tidak ditemukan di database.",
        });
      }

      const updateData: {
        websiteUrl?: string | null;
        twitterUrl?: string | null;
        mintDate?: string | null;
        mintPrice?: string | null;
        whitelistStatus?: WhitelistStatus;
        mintStatus?: MintStatus;
        notes?: string | null;
        lastCheckedAt?: string | null;
      } = {};

      if (args.websiteUrl !== undefined) {
        updateData.websiteUrl = String(args.websiteUrl);
      }

      if (args.twitterUrl !== undefined) {
        updateData.twitterUrl = String(args.twitterUrl);
      }

      if (args.mintDate !== undefined) {
        updateData.mintDate = String(args.mintDate);
      }

      if (args.mintPrice !== undefined) {
        updateData.mintPrice = String(args.mintPrice);
      }

      if (args.whitelistStatus !== undefined) {
        const value = String(args.whitelistStatus).toUpperCase();

        const validStatuses = [
          "UNKNOWN",
          "NOT_OPEN",
          "OPEN",
          "CLOSED",
          "COMPLETED",
        ];

        if (!validStatuses.includes(value)) {
          return JSON.stringify({
            success: false,
            error: `whitelistStatus "${value}" tidak valid.`,
          });
        }

        updateData.whitelistStatus = value as WhitelistStatus;
      }

      if (args.mintStatus !== undefined) {
        const value = String(args.mintStatus).toUpperCase();

        const validStatuses = [
          "UNKNOWN",
          "UPCOMING",
          "LIVE",
          "SOLD_OUT",
          "ENDED",
        ];

        if (!validStatuses.includes(value)) {
          return JSON.stringify({
            success: false,
            error: `mintStatus "${value}" tidak valid.`,
          });
        }

        updateData.mintStatus = value as MintStatus;
      }

      if (args.notes !== undefined) {
        updateData.notes = String(args.notes);
      }

      if (args.lastCheckedAt !== undefined) {
        updateData.lastCheckedAt = String(args.lastCheckedAt);
      }

      if (Object.keys(updateData).length === 0) {
        return JSON.stringify({
          success: false,
          error: "Tidak ada informasi yang perlu diperbarui.",
        });
      }

      const updatedProject = projectManager.updateProject(
        project.id,
        updateData,
      );

      if (!updatedProject) {
        return JSON.stringify({
          success: false,
          error: "Project gagal diperbarui.",
        });
      }

      return JSON.stringify({
        success: true,
        message: "Project berhasil diperbarui.",
        project: {
          id: updatedProject.id,
          name: updatedProject.name,
          websiteUrl: updatedProject.websiteUrl,
          twitterUrl: updatedProject.twitterUrl,
          mintDate: updatedProject.mintDate,
          mintPrice: updatedProject.mintPrice,
          whitelistStatus: updatedProject.whitelistStatus,
          mintStatus: updatedProject.mintStatus,
          notes: updatedProject.notes,
          lastCheckedAt: updatedProject.lastCheckedAt,
          updatedAt: updatedProject.updatedAt,
        },
      });
    } catch (error: any) {
      console.error("❌ [update_project] Gagal memperbarui project:", error);

      return JSON.stringify({
        success: false,
        error: error?.message || String(error),
      });
    }
  },
};
