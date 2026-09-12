import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export type TaskPlanStatus =
  | "PLANNED"
  | "APPROVED"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED";

export interface StoredTaskPlan {
  id: number;
  projectName: string;
  sourceUrl: string;
  accountCount: number;
  taskCount: number;
  status: TaskPlanStatus;
  planJson: string;
  createdAt: string;
  updatedAt: string;
}

export class AgentDatabase {
  private db: Database.Database;

  constructor(dbPathRelative = "data/agent.db") {
    const fullPath = path.resolve(process.cwd(), dbPathRelative);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(fullPath);

    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_messages_chat_id
      ON messages(chat_id);

      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        twitter_handle TEXT,
        wallet_address TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        website_url TEXT,
        twitter_url TEXT,
        mint_date DATETIME,
        mint_price TEXT,
        whitelist_status TEXT NOT NULL DEFAULT 'UNKNOWN',
        mint_status TEXT NOT NULL DEFAULT 'UNKNOWN',
        notes TEXT,
        last_checked_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS watchlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL UNIQUE,
        priority TEXT NOT NULL DEFAULT 'NORMAL',
        reminder_enabled INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id)
          REFERENCES projects(id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        task_type TEXT NOT NULL,
        target_url TEXT,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        proof TEXT,
        error TEXT,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id)
          REFERENCES projects(id)
          ON DELETE CASCADE,
        FOREIGN KEY (account_id)
          REFERENCES accounts(id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_project_id
      ON tasks(project_id);

      CREATE INDEX IF NOT EXISTS idx_tasks_account_id
      ON tasks(account_id);

      CREATE INDEX IF NOT EXISTS idx_tasks_status
      ON tasks(status);

      CREATE TABLE IF NOT EXISTS eligibility_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'UNKNOWN',
        checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        source TEXT,
        notes TEXT,
        FOREIGN KEY (project_id)
          REFERENCES projects(id)
          ON DELETE CASCADE,
        FOREIGN KEY (account_id)
          REFERENCES accounts(id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_eligibility_project_id
      ON eligibility_checks(project_id);

      CREATE INDEX IF NOT EXISTS idx_eligibility_account_id
      ON eligibility_checks(account_id);

      CREATE TABLE IF NOT EXISTS task_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        source_url TEXT NOT NULL,
        account_count INTEGER NOT NULL,
        task_count INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PLANNED',
        plan_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_task_plans_project_name
      ON task_plans(project_name);

      CREATE INDEX IF NOT EXISTS idx_task_plans_status
      ON task_plans(status);
    `);

    this.runMigrations();
  }

  private runMigrations(): void {
    const taskColumns = this.db.pragma("table_info(tasks)") as Array<{
      name: string;
    }>;

    const hasTargetUrl = taskColumns.some(
      (column) => column.name === "target_url",
    );

    if (!hasTargetUrl) {
      this.db.exec(`
        ALTER TABLE tasks
        ADD COLUMN target_url TEXT;
      `);

      console.log(
        "🗄️ [Database] Migration applied: tasks.target_url ditambahkan.",
      );
    }
  }

  saveTaskPlan(plan: {
    projectName: string;
    sourceUrl: string;
    accountCount: number;
    taskCount: number;
    tasks: unknown[];
  }): number {
    const result = this.db
      .prepare(
        `
          INSERT INTO task_plans (
            project_name,
            source_url,
            account_count,
            task_count,
            status,
            plan_json
          )
          VALUES (?, ?, ?, ?, 'PLANNED', ?)
        `,
      )
      .run(
        plan.projectName,
        plan.sourceUrl,
        plan.accountCount,
        plan.taskCount,
        JSON.stringify(plan),
      );

    return Number(result.lastInsertRowid);
  }

  getTaskPlan(planId: number): StoredTaskPlan | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            project_name AS projectName,
            source_url AS sourceUrl,
            account_count AS accountCount,
            task_count AS taskCount,
            status,
            plan_json AS planJson,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM task_plans
          WHERE id = ?
          LIMIT 1
        `,
      )
      .get(planId) as StoredTaskPlan | undefined;

    return row ?? null;
  }

  updateTaskPlanStatus(planId: number, status: TaskPlanStatus): boolean {
    const result = this.db
      .prepare(
        `
          UPDATE task_plans
          SET
            status = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      )
      .run(status, planId);

    return result.changes > 0;
  }

  listTaskPlans(options?: {
    projectName?: string;
    status?: TaskPlanStatus;
  }): StoredTaskPlan[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.projectName) {
      conditions.push("project_name = ?");
      params.push(options.projectName.trim());
    }

    if (options?.status) {
      conditions.push("status = ?");
      params.push(options.status);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    return this.db
      .prepare(
        `
          SELECT
            id,
            project_name AS projectName,
            source_url AS sourceUrl,
            account_count AS accountCount,
            task_count AS taskCount,
            status,
            plan_json AS planJson,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM task_plans
          ${whereClause}
          ORDER BY id DESC
        `,
      )
      .all(...params) as StoredTaskPlan[];
  }

  getDb(): Database.Database {
    return this.db;
  }
}
