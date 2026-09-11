import { AgentDatabase } from "../database/agent-database.js";

export type TaskStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "FAILED";

export interface Task {
  id: number;
  projectId: number;
  projectName: string;
  accountId: number;
  accountName: string;
  taskType: string;
  targetUrl: string | null;
  description: string | null;
  status: TaskStatus;
  proof: string | null;
  error: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  projectName: string;
  accountName: string;
  taskType: string;
  targetUrl?: string | null;
  description?: string | null;
}

export interface UpdateTaskInput {
  taskType?: string;
  targetUrl?: string | null;
  description?: string | null;
  status?: TaskStatus;
  proof?: string | null;
  error?: string | null;
}

export interface ListTasksOptions {
  projectName?: string;
  accountName?: string;
  status?: TaskStatus;
}

export class TaskManager {
  constructor(private readonly database: AgentDatabase) {}

  createTask(input: CreateTaskInput): Task {
    const projectName = input.projectName.trim();
    const accountName = input.accountName.trim();
    const taskType = input.taskType.trim().toUpperCase();

    if (!projectName) {
      throw new Error("Nama project wajib diisi.");
    }

    if (!accountName) {
      throw new Error("Nama account wajib diisi.");
    }

    if (!taskType) {
      throw new Error("Task type wajib diisi.");
    }

    const project = this.database
      .getDb()
      .prepare(
        `
        SELECT
          id,
          name
        FROM projects
        WHERE LOWER(name) = LOWER(?)
        LIMIT 1
      `,
      )
      .get(projectName) as ProjectRow | undefined;

    if (!project) {
      throw new Error(`Project "${projectName}" tidak ditemukan.`);
    }

    const account = this.database
      .getDb()
      .prepare(
        `
        SELECT
          id,
          name
        FROM accounts
        WHERE LOWER(name) = LOWER(?)
        LIMIT 1
      `,
      )
      .get(accountName) as AccountRow | undefined;

    if (!account) {
      throw new Error(`Account "${accountName}" tidak ditemukan.`);
    }

    const targetUrl =
      input.targetUrl !== undefined ? input.targetUrl?.trim() || null : null;

    const description =
      input.description !== undefined
        ? input.description?.trim() || null
        : null;

    const stmt = this.database.getDb().prepare(
      `
      INSERT INTO tasks (
        project_id,
        account_id,
        task_type,
        target_url,
        description,
        status
      )
      VALUES (?, ?, ?, ?, ?, 'PENDING')
    `,
    );

    const result = stmt.run(
      project.id,
      account.id,
      taskType,
      targetUrl,
      description,
    );

    const task = this.getTaskById(Number(result.lastInsertRowid));

    if (!task) {
      throw new Error("Task berhasil dibuat tetapi gagal dibaca kembali.");
    }

    console.log(
      `📋 [TaskManager] Task dibuat: #${task.id} ${task.taskType} → ${task.projectName} / ${task.accountName}`,
    );

    return task;
  }

  getTaskById(id: number): Task | undefined {
    const stmt = this.database.getDb().prepare(
      `
      SELECT
        t.id,
        t.project_id,
        p.name AS project_name,
        t.account_id,
        a.name AS account_name,
        t.task_type,
        t.target_url,
        t.description,
        t.status,
        t.proof,
        t.error,
        t.completed_at,
        t.created_at,
        t.updated_at
      FROM tasks t
      INNER JOIN projects p
        ON p.id = t.project_id
      INNER JOIN accounts a
        ON a.id = t.account_id
      WHERE t.id = ?
      LIMIT 1
    `,
    );

    const row = stmt.get(id) as TaskRow | undefined;

    return row ? this.mapRow(row) : undefined;
  }

  listTasks(options: ListTasksOptions = {}): Task[] {
    const conditions: string[] = [];
    const params: Array<string> = [];

    if (options.projectName?.trim()) {
      conditions.push("LOWER(p.name) = LOWER(?)");
      params.push(options.projectName.trim());
    }

    if (options.accountName?.trim()) {
      conditions.push("LOWER(a.name) = LOWER(?)");
      params.push(options.accountName.trim());
    }

    if (options.status) {
      conditions.push("t.status = ?");
      params.push(options.status);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const stmt = this.database.getDb().prepare(
      `
      SELECT
        t.id,
        t.project_id,
        p.name AS project_name,
        t.account_id,
        a.name AS account_name,
        t.task_type,
        t.target_url,
        t.description,
        t.status,
        t.proof,
        t.error,
        t.completed_at,
        t.created_at,
        t.updated_at
      FROM tasks t
      INNER JOIN projects p
        ON p.id = t.project_id
      INNER JOIN accounts a
        ON a.id = t.account_id
      ${whereClause}
      ORDER BY t.id ASC
    `,
    );

    const rows = stmt.all(...params) as TaskRow[];

    return rows.map((row) => this.mapRow(row));
  }

  updateTask(id: number, input: UpdateTaskInput): Task | undefined {
    const existing = this.getTaskById(id);

    if (!existing) {
      return undefined;
    }

    const taskType =
      input.taskType !== undefined
        ? input.taskType.trim().toUpperCase()
        : existing.taskType;

    if (!taskType) {
      throw new Error("Task type tidak boleh kosong.");
    }

    const targetUrl =
      input.targetUrl !== undefined
        ? input.targetUrl?.trim() || null
        : existing.targetUrl;

    const description =
      input.description !== undefined
        ? input.description?.trim() || null
        : existing.description;

    const status = input.status ?? existing.status;

    if (!["PENDING", "IN_PROGRESS", "DONE", "FAILED"].includes(status)) {
      throw new Error("Status task tidak valid.");
    }

    const proof =
      input.proof !== undefined ? input.proof?.trim() || null : existing.proof;

    const error =
      input.error !== undefined ? input.error?.trim() || null : existing.error;

    const completedAt =
      status === "DONE"
        ? (existing.completedAt ?? new Date().toISOString())
        : null;

    const stmt = this.database.getDb().prepare(
      `
      UPDATE tasks
      SET
        task_type = ?,
        target_url = ?,
        description = ?,
        status = ?,
        proof = ?,
        error = ?,
        completed_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    );

    stmt.run(
      taskType,
      targetUrl,
      description,
      status,
      proof,
      error,
      completedAt,
      id,
    );

    const updated = this.getTaskById(id);

    if (updated) {
      console.log(
        `📋 [TaskManager] Task diperbarui: #${updated.id} → ${updated.status}`,
      );
    }

    return updated;
  }

  saveTaskProof(id: number, proof: string): Task | undefined {
    const normalizedProof = proof.trim();

    if (!normalizedProof) {
      throw new Error("Task proof tidak boleh kosong.");
    }

    return this.updateTask(id, {
      proof: normalizedProof,
    });
  }

  markTaskInProgress(id: number): Task | undefined {
    return this.updateTask(id, {
      status: "IN_PROGRESS",
    });
  }

  markTaskDone(id: number, proof?: string | null): Task | undefined {
    return this.updateTask(id, {
      status: "DONE",
      proof,
      error: null,
    });
  }

  markTaskFailed(id: number, error: string): Task | undefined {
    return this.updateTask(id, {
      status: "FAILED",
      error,
    });
  }

  resetTask(id: number): Task | undefined {
    return this.updateTask(id, {
      status: "PENDING",
      error: null,
      proof: null,
    });
  }

  deleteTask(id: number): boolean {
    const stmt = this.database.getDb().prepare(
      `
      DELETE FROM tasks
      WHERE id = ?
    `,
    );

    const result = stmt.run(id);

    if (result.changes > 0) {
      console.log(`🗑️ [TaskManager] Task #${id} dihapus.`);

      return true;
    }

    return false;
  }

  private mapRow(row: TaskRow): Task {
    return {
      id: row.id,
      projectId: row.project_id,
      projectName: row.project_name,
      accountId: row.account_id,
      accountName: row.account_name,
      taskType: row.task_type,
      targetUrl: row.target_url,
      description: row.description,
      status: row.status,
      proof: row.proof,
      error: row.error,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

interface ProjectRow {
  id: number;
  name: string;
}

interface AccountRow {
  id: number;
  name: string;
}

interface TaskRow {
  id: number;
  project_id: number;
  project_name: string;
  account_id: number;
  account_name: string;
  task_type: string;
  target_url: string | null;
  description: string | null;
  status: TaskStatus;
  proof: string | null;
  error: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
