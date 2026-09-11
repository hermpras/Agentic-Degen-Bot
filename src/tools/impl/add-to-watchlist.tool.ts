import { AgentDatabase } from "../../database/agent-database.js";
import {
  ProjectManager,
  WatchlistPriority,
} from "../../projects/project-manager.js";
import { Tool } from "../tool.interface.js";

const database = new AgentDatabase("data/agent.db");
const projectManager = new ProjectManager(database);

export const addToWatchlistTool: Tool = {
  name: "add_to_watchlist",

  description:
    "Memasukkan project yang sudah ada ke watchlist. " +
    "Gunakan ketika user ingin memantau project secara aktif. " +
    "Project dapat dicari berdasarkan nama atau ID.",

  riskLevel: "SAFE",

  parameters: {
    type: "object",

    properties: {
      projectName: {
        type: "string",
        description: "Nama project yang ingin dimasukkan ke watchlist.",
      },

      projectId: {
        type: "number",
        description: "ID project jika diketahui.",
      },

      priority: {
        type: "string",
        enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
        description: "Prioritas pemantauan project. Default NORMAL.",
      },

      reminderEnabled: {
        type: "boolean",
        description: "Apakah reminder untuk project ini aktif. Default true.",
      },

      notes: {
        type: "string",
        description: "Catatan khusus untuk watchlist project.",
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

      if (projectManager.isInWatchlist(project.id)) {
        const existing = projectManager.getWatchlistItemByProjectId(project.id);

        return JSON.stringify({
          success: false,
          error: `Project "${project.name}" sudah ada di watchlist.`,
          project: {
            id: project.id,
            name: project.name,
          },
          watchlist: existing
            ? {
                id: existing.id,
                priority: existing.priority,
                reminderEnabled: existing.reminderEnabled,
                notes: existing.notes,
              }
            : null,
        });
      }

      const priority =
        args.priority !== undefined
          ? String(args.priority).toUpperCase()
          : "NORMAL";

      const validPriorities = ["LOW", "NORMAL", "HIGH", "URGENT"];

      if (!validPriorities.includes(priority)) {
        return JSON.stringify({
          success: false,
          error: "priority tidak valid.",
        });
      }

      const reminderEnabled = args.reminderEnabled !== false;

      const watchlist = projectManager.addToWatchlist(project.id, {
        priority: priority as WatchlistPriority,
        reminderEnabled,
        notes: args.notes !== undefined ? String(args.notes) : undefined,
      });

      return JSON.stringify({
        success: true,
        message: "Project berhasil ditambahkan ke watchlist.",
        project: {
          id: project.id,
          name: project.name,
          websiteUrl: project.websiteUrl,
          twitterUrl: project.twitterUrl,
          whitelistStatus: project.whitelistStatus,
          mintStatus: project.mintStatus,
        },
        watchlist: {
          id: watchlist.id,
          priority: watchlist.priority,
          reminderEnabled: watchlist.reminderEnabled,
          notes: watchlist.notes,
          createdAt: watchlist.createdAt,
        },
      });
    } catch (error: any) {
      console.error(
        "❌ [add_to_watchlist] Gagal menambahkan project ke watchlist:",
        error,
      );

      return JSON.stringify({
        success: false,
        error: error?.message || String(error),
      });
    }
  },
};
