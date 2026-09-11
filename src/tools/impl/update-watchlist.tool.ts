import { AgentDatabase } from "../../database/agent-database.js";
import { Tool } from "../tool.interface.js";

export const updateWatchlistTool: Tool = {
  name: "update_watchlist",

  description:
    "Memperbarui metadata watchlist sebuah project: priority, reminder, dan notes. Project harus sudah ada di watchlist.",

  riskLevel: "SAFE",

  parameters: {
    type: "object",
    properties: {
      projectName: {
        type: "string",
        description: "Nama project yang ingin diperbarui.",
      },

      priority: {
        type: "string",
        enum: ["LOW", "NORMAL", "HIGH"],
        description: "Prioritas watchlist. Pilihan: LOW, NORMAL, atau HIGH.",
      },

      reminderEnabled: {
        type: "boolean",
        description: "Apakah reminder watchlist aktif atau tidak.",
      },

      notes: {
        type: "string",
        description: "Catatan tambahan untuk project di watchlist.",
      },
    },

    required: ["projectName"],
  },

  async execute(args: Record<string, any>): Promise<string> {
    const database = new AgentDatabase();
    const db = database.getDb();

    const projectName =
      typeof args.projectName === "string" ? args.projectName.trim() : "";

    if (!projectName) {
      return JSON.stringify({
        success: false,
        error: "Nama project wajib diisi.",
      });
    }

    const project = db
      .prepare(
        `
        SELECT
          p.id,
          p.name,
          p.website_url,
          p.twitter_url,
          w.id AS watchlist_id,
          w.priority,
          w.reminder_enabled,
          w.notes
        FROM projects p
        INNER JOIN watchlist w
          ON w.project_id = p.id
        WHERE LOWER(p.name) = LOWER(?)
        LIMIT 1
      `,
      )
      .get(projectName) as WatchlistRow | undefined;

    if (!project) {
      return JSON.stringify({
        success: false,
        error: `Project "${projectName}" tidak ditemukan di watchlist.`,
      });
    }

    const priority =
      args.priority !== undefined
        ? String(args.priority).toUpperCase()
        : project.priority;

    if (!["LOW", "NORMAL", "HIGH"].includes(priority)) {
      return JSON.stringify({
        success: false,
        error: 'Priority tidak valid. Gunakan "LOW", "NORMAL", atau "HIGH".',
      });
    }

    const reminderEnabled =
      args.reminderEnabled !== undefined
        ? args.reminderEnabled
          ? 1
          : 0
        : project.reminder_enabled;

    const notes =
      args.notes !== undefined
        ? typeof args.notes === "string"
          ? args.notes.trim() || null
          : null
        : project.notes;

    db.prepare(
      `
      UPDATE watchlist
      SET
        priority = ?,
        reminder_enabled = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(priority, reminderEnabled, notes, project.watchlist_id);

    const updated = db
      .prepare(
        `
        SELECT
          p.id,
          p.name,
          p.website_url,
          p.twitter_url,
          w.priority,
          w.reminder_enabled,
          w.notes
        FROM projects p
        INNER JOIN watchlist w
          ON w.project_id = p.id
        WHERE w.id = ?
      `,
      )
      .get(project.watchlist_id) as UpdatedWatchlistRow;

    console.log(`👀 [Watchlist] Project diperbarui: ${updated.name}`);

    return JSON.stringify({
      success: true,
      message: "Watchlist berhasil diperbarui.",
      project: {
        id: updated.id,
        name: updated.name,
        websiteUrl: updated.website_url,
        twitterUrl: updated.twitter_url,
        priority: updated.priority,
        reminderEnabled: Boolean(updated.reminder_enabled),
        notes: updated.notes,
      },
    });
  },
};

interface WatchlistRow {
  id: number;
  name: string;
  website_url: string | null;
  twitter_url: string | null;
  watchlist_id: number;
  priority: "LOW" | "NORMAL" | "HIGH";
  reminder_enabled: number;
  notes: string | null;
}

interface UpdatedWatchlistRow {
  id: number;
  name: string;
  website_url: string | null;
  twitter_url: string | null;
  priority: "LOW" | "NORMAL" | "HIGH";
  reminder_enabled: number;
  notes: string | null;
}
