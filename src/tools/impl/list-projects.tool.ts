import { AgentDatabase } from "../../database/agent-database.js";
import { ProjectManager } from "../../projects/project-manager.js";
import { Tool } from "../tool.interface.js";

const database = new AgentDatabase("data/agent.db");
const projectManager = new ProjectManager(database);

export const listProjectsTool: Tool = {
  name: "list_projects",

  description:
    "Menampilkan daftar project yang tersimpan di database. " +
    "Bisa menampilkan semua project atau hanya project yang ada di watchlist.",

  riskLevel: "SAFE",

  parameters: {
    type: "object",

    properties: {
      watchlistOnly: {
        type: "boolean",
        description:
          "Jika true, hanya tampilkan project yang ada di watchlist. " +
          "Jika false atau tidak diberikan, tampilkan semua project.",
      },
    },

    required: [],
  },

  execute: async (args: Record<string, any>) => {
    try {
      const watchlistOnly = args.watchlistOnly === true;

      if (watchlistOnly) {
        const items = projectManager.getWatchlistProjects();

        return JSON.stringify({
          success: true,
          watchlistOnly: true,
          count: items.length,

          projects: items.map((item) => ({
            id: item.project.id,
            name: item.project.name,
            websiteUrl: item.project.websiteUrl,
            twitterUrl: item.project.twitterUrl,
            mintDate: item.project.mintDate,
            mintPrice: item.project.mintPrice,
            whitelistStatus: item.project.whitelistStatus,
            mintStatus: item.project.mintStatus,
            notes: item.project.notes,
            lastCheckedAt: item.project.lastCheckedAt,

            watchlist: {
              priority: item.watchlist.priority,
              reminderEnabled: item.watchlist.reminderEnabled,
              notes: item.watchlist.notes,
            },
          })),
        });
      }

      const projects = projectManager.getAllProjects();

      return JSON.stringify({
        success: true,
        watchlistOnly: false,
        count: projects.length,

        projects: projects.map((project) => ({
          id: project.id,
          name: project.name,
          websiteUrl: project.websiteUrl,
          twitterUrl: project.twitterUrl,
          mintDate: project.mintDate,
          mintPrice: project.mintPrice,
          whitelistStatus: project.whitelistStatus,
          mintStatus: project.mintStatus,
          notes: project.notes,
          lastCheckedAt: project.lastCheckedAt,
        })),
      });
    } catch (error: any) {
      console.error(
        "❌ [list_projects] Gagal mengambil daftar project:",
        error,
      );

      return JSON.stringify({
        success: false,
        error: error?.message || String(error),
      });
    }
  },
};
