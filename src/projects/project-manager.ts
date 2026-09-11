import { AgentDatabase } from "../database/agent-database.js";

export type WhitelistStatus =
  | "UNKNOWN"
  | "NOT_OPEN"
  | "OPEN"
  | "CLOSED"
  | "COMPLETED";

export type MintStatus = "UNKNOWN" | "UPCOMING" | "LIVE" | "SOLD_OUT" | "ENDED";

export type WatchlistPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface Project {
  id: number;
  name: string;
  websiteUrl: string | null;
  twitterUrl: string | null;
  mintDate: string | null;
  mintPrice: string | null;
  whitelistStatus: WhitelistStatus;
  mintStatus: MintStatus;
  notes: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  websiteUrl?: string;
  twitterUrl?: string;
  mintDate?: string;
  mintPrice?: string;
  whitelistStatus?: WhitelistStatus;
  mintStatus?: MintStatus;
  notes?: string;
}

export interface UpdateProjectInput {
  websiteUrl?: string | null;
  twitterUrl?: string | null;
  mintDate?: string | null;
  mintPrice?: string | null;
  whitelistStatus?: WhitelistStatus;
  mintStatus?: MintStatus;
  notes?: string | null;
  lastCheckedAt?: string | null;
}

export interface WatchlistItem {
  id: number;
  projectId: number;
  priority: WatchlistPriority;
  reminderEnabled: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistProject {
  project: Project;
  watchlist: WatchlistItem;
}

export class ProjectManager {
  constructor(private readonly database: AgentDatabase) {}

  createProject(input: CreateProjectInput): Project {
    const name = input.name.trim();

    if (!name) {
      throw new Error("Nama project tidak boleh kosong.");
    }

    const existing = this.getProjectByName(name);

    if (existing) {
      throw new Error(`Project dengan nama "${name}" sudah ada.`);
    }

    const stmt = this.database.getDb().prepare(`
      INSERT INTO projects (
        name,
        website_url,
        twitter_url,
        mint_date,
        mint_price,
        whitelist_status,
        mint_status,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      name,
      input.websiteUrl?.trim() || null,
      input.twitterUrl?.trim() || null,
      input.mintDate?.trim() || null,
      input.mintPrice?.trim() || null,
      input.whitelistStatus ?? "UNKNOWN",
      input.mintStatus ?? "UNKNOWN",
      input.notes?.trim() || null,
    );

    const project = this.getProjectById(Number(result.lastInsertRowid));

    if (!project) {
      throw new Error("Project berhasil dibuat tetapi gagal dibaca kembali.");
    }

    console.log(
      `📁 [ProjectManager] Project dibuat: ${project.name} (ID: ${project.id})`,
    );

    return project;
  }

  getProjectById(id: number): Project | undefined {
    const stmt = this.database.getDb().prepare(`
      SELECT
        id,
        name,
        website_url,
        twitter_url,
        mint_date,
        mint_price,
        whitelist_status,
        mint_status,
        notes,
        last_checked_at,
        created_at,
        updated_at
      FROM projects
      WHERE id = ?
    `);

    const row = stmt.get(id) as ProjectRow | undefined;

    return row ? this.mapProjectRow(row) : undefined;
  }

  getProjectByName(name: string): Project | undefined {
    const stmt = this.database.getDb().prepare(`
      SELECT
        id,
        name,
        website_url,
        twitter_url,
        mint_date,
        mint_price,
        whitelist_status,
        mint_status,
        notes,
        last_checked_at,
        created_at,
        updated_at
      FROM projects
      WHERE LOWER(name) = LOWER(?)
      LIMIT 1
    `);

    const row = stmt.get(name.trim()) as ProjectRow | undefined;

    return row ? this.mapProjectRow(row) : undefined;
  }

  getProjectByWebsite(websiteUrl: string): Project | undefined {
    const stmt = this.database.getDb().prepare(`
      SELECT
        id,
        name,
        website_url,
        twitter_url,
        mint_date,
        mint_price,
        whitelist_status,
        mint_status,
        notes,
        last_checked_at,
        created_at,
        updated_at
      FROM projects
      WHERE website_url = ?
      LIMIT 1
    `);

    const row = stmt.get(websiteUrl.trim()) as ProjectRow | undefined;

    return row ? this.mapProjectRow(row) : undefined;
  }

  getAllProjects(): Project[] {
    const stmt = this.database.getDb().prepare(`
      SELECT
        id,
        name,
        website_url,
        twitter_url,
        mint_date,
        mint_price,
        whitelist_status,
        mint_status,
        notes,
        last_checked_at,
        created_at,
        updated_at
      FROM projects
      ORDER BY id ASC
    `);

    const rows = stmt.all() as ProjectRow[];

    return rows.map((row) => this.mapProjectRow(row));
  }

  updateProject(id: number, input: UpdateProjectInput): Project | undefined {
    const existing = this.getProjectById(id);

    if (!existing) {
      return undefined;
    }

    const websiteUrl =
      input.websiteUrl !== undefined
        ? input.websiteUrl?.trim() || null
        : existing.websiteUrl;

    const twitterUrl =
      input.twitterUrl !== undefined
        ? input.twitterUrl?.trim() || null
        : existing.twitterUrl;

    const mintDate =
      input.mintDate !== undefined
        ? input.mintDate?.trim() || null
        : existing.mintDate;

    const mintPrice =
      input.mintPrice !== undefined
        ? input.mintPrice?.trim() || null
        : existing.mintPrice;

    const whitelistStatus = input.whitelistStatus ?? existing.whitelistStatus;

    const mintStatus = input.mintStatus ?? existing.mintStatus;

    const notes =
      input.notes !== undefined ? input.notes?.trim() || null : existing.notes;

    const lastCheckedAt =
      input.lastCheckedAt !== undefined
        ? input.lastCheckedAt?.trim() || null
        : existing.lastCheckedAt;

    const stmt = this.database.getDb().prepare(`
      UPDATE projects
      SET
        website_url = ?,
        twitter_url = ?,
        mint_date = ?,
        mint_price = ?,
        whitelist_status = ?,
        mint_status = ?,
        notes = ?,
        last_checked_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(
      websiteUrl,
      twitterUrl,
      mintDate,
      mintPrice,
      whitelistStatus,
      mintStatus,
      notes,
      lastCheckedAt,
      id,
    );

    return this.getProjectById(id);
  }

  deleteProject(id: number): boolean {
    const stmt = this.database.getDb().prepare(`
      DELETE FROM projects
      WHERE id = ?
    `);

    const result = stmt.run(id);

    if (result.changes > 0) {
      console.log(`🗑️ [ProjectManager] Project ID ${id} dihapus.`);

      return true;
    }

    return false;
  }

  addToWatchlist(
    projectId: number,
    options?: {
      priority?: WatchlistPriority;
      reminderEnabled?: boolean;
      notes?: string | null;
    },
  ): WatchlistItem {
    const project = this.getProjectById(projectId);

    if (!project) {
      throw new Error(`Project dengan ID ${projectId} tidak ditemukan.`);
    }

    const existing = this.getWatchlistItemByProjectId(projectId);

    if (existing) {
      throw new Error(`Project "${project.name}" sudah ada di watchlist.`);
    }

    const stmt = this.database.getDb().prepare(`
      INSERT INTO watchlist (
        project_id,
        priority,
        reminder_enabled,
        notes
      )
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      projectId,
      options?.priority ?? "NORMAL",
      options?.reminderEnabled === false ? 0 : 1,
      options?.notes?.trim() || null,
    );

    const item = this.getWatchlistItemById(Number(result.lastInsertRowid));

    if (!item) {
      throw new Error(
        "Project berhasil masuk watchlist tetapi gagal dibaca kembali.",
      );
    }

    console.log(`⭐ [ProjectManager] Project masuk watchlist: ${project.name}`);

    return item;
  }

  removeFromWatchlist(projectId: number): boolean {
    const stmt = this.database.getDb().prepare(`
      DELETE FROM watchlist
      WHERE project_id = ?
    `);

    const result = stmt.run(projectId);

    if (result.changes > 0) {
      console.log(
        `⭐ [ProjectManager] Project ID ${projectId} dihapus dari watchlist.`,
      );

      return true;
    }

    return false;
  }

  isInWatchlist(projectId: number): boolean {
    const item = this.getWatchlistItemByProjectId(projectId);

    return item !== undefined;
  }

  getWatchlistItemByProjectId(projectId: number): WatchlistItem | undefined {
    const stmt = this.database.getDb().prepare(`
      SELECT
        id,
        project_id,
        priority,
        reminder_enabled,
        notes,
        created_at,
        updated_at
      FROM watchlist
      WHERE project_id = ?
    `);

    const row = stmt.get(projectId) as WatchlistRow | undefined;

    return row ? this.mapWatchlistRow(row) : undefined;
  }

  getWatchlistItemById(id: number): WatchlistItem | undefined {
    const stmt = this.database.getDb().prepare(`
      SELECT
        id,
        project_id,
        priority,
        reminder_enabled,
        notes,
        created_at,
        updated_at
      FROM watchlist
      WHERE id = ?
    `);

    const row = stmt.get(id) as WatchlistRow | undefined;

    return row ? this.mapWatchlistRow(row) : undefined;
  }

  getWatchlistProjects(): WatchlistProject[] {
    const stmt = this.database.getDb().prepare(`
      SELECT
        p.id AS project_id,
        p.name,
        p.website_url,
        p.twitter_url,
        p.mint_date,
        p.mint_price,
        p.whitelist_status,
        p.mint_status,
        p.notes AS project_notes,
        p.last_checked_at,
        p.created_at AS project_created_at,
        p.updated_at AS project_updated_at,

        w.id AS watchlist_id,
        w.priority,
        w.reminder_enabled,
        w.notes AS watchlist_notes,
        w.created_at AS watchlist_created_at,
        w.updated_at AS watchlist_updated_at

      FROM watchlist w
      INNER JOIN projects p
        ON p.id = w.project_id

      ORDER BY
        CASE w.priority
          WHEN 'URGENT' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'NORMAL' THEN 3
          WHEN 'LOW' THEN 4
          ELSE 5
        END,
        p.id ASC
    `);

    const rows = stmt.all() as WatchlistProjectRow[];

    return rows.map((row) => ({
      project: {
        id: row.project_id,
        name: row.name,
        websiteUrl: row.website_url,
        twitterUrl: row.twitter_url,
        mintDate: row.mint_date,
        mintPrice: row.mint_price,
        whitelistStatus: row.whitelist_status,
        mintStatus: row.mint_status,
        notes: row.project_notes,
        lastCheckedAt: row.last_checked_at,
        createdAt: row.project_created_at,
        updatedAt: row.project_updated_at,
      },

      watchlist: {
        id: row.watchlist_id,
        projectId: row.project_id,
        priority: row.priority,
        reminderEnabled: row.reminder_enabled === 1,
        notes: row.watchlist_notes,
        createdAt: row.watchlist_created_at,
        updatedAt: row.watchlist_updated_at,
      },
    }));
  }

  private mapProjectRow(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      websiteUrl: row.website_url,
      twitterUrl: row.twitter_url,
      mintDate: row.mint_date,
      mintPrice: row.mint_price,
      whitelistStatus: row.whitelist_status,
      mintStatus: row.mint_status,
      notes: row.notes,
      lastCheckedAt: row.last_checked_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapWatchlistRow(row: WatchlistRow): WatchlistItem {
    return {
      id: row.id,
      projectId: row.project_id,
      priority: row.priority,
      reminderEnabled: row.reminder_enabled === 1,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

interface ProjectRow {
  id: number;
  name: string;
  website_url: string | null;
  twitter_url: string | null;
  mint_date: string | null;
  mint_price: string | null;
  whitelist_status: WhitelistStatus;
  mint_status: MintStatus;
  notes: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

interface WatchlistRow {
  id: number;
  project_id: number;
  priority: WatchlistPriority;
  reminder_enabled: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface WatchlistProjectRow {
  project_id: number;
  name: string;
  website_url: string | null;
  twitter_url: string | null;
  mint_date: string | null;
  mint_price: string | null;
  whitelist_status: WhitelistStatus;
  mint_status: MintStatus;
  project_notes: string | null;
  last_checked_at: string | null;
  project_created_at: string;
  project_updated_at: string;

  watchlist_id: number;
  priority: WatchlistPriority;
  reminder_enabled: number;
  watchlist_notes: string | null;
  watchlist_created_at: string;
  watchlist_updated_at: string;
}
