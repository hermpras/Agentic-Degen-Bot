import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

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
    `);
  }

  getDb(): Database.Database {
    return this.db;
  }
}
