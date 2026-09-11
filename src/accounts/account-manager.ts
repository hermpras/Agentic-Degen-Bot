import { AgentDatabase } from "../database/agent-database.js";

export type AccountStatus = "ACTIVE" | "INACTIVE";

export interface Account {
  id: number;
  name: string;
  twitterHandle: string | null;
  walletAddress: string | null;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountInput {
  name: string;
  twitterHandle?: string;
  walletAddress?: string;
}

export interface UpdateAccountInput {
  twitterHandle?: string | null;
  walletAddress?: string | null;
  status?: AccountStatus;
}

export class AccountManager {
  constructor(private readonly database: AgentDatabase) {}

  createAccount(input: CreateAccountInput): Account {
    const name = input.name.trim();

    if (!name) {
      throw new Error("Nama account tidak boleh kosong.");
    }

    const existing = this.getAccountByName(name);

    if (existing) {
      throw new Error(`Account dengan nama "${name}" sudah ada.`);
    }

    const stmt = this.database.getDb().prepare(`
      INSERT INTO accounts (
        name,
        twitter_handle,
        wallet_address,
        status
      )
      VALUES (?, ?, ?, 'ACTIVE')
    `);

    const result = stmt.run(
      name,
      input.twitterHandle?.trim() || null,
      input.walletAddress?.trim() || null,
    );

    const account = this.getAccountById(Number(result.lastInsertRowid));

    if (!account) {
      throw new Error("Account berhasil dibuat tetapi gagal dibaca kembali.");
    }

    console.log(
      `👤 [AccountManager] Account dibuat: ${account.name} (ID: ${account.id})`,
    );

    return account;
  }

  getAccountById(id: number): Account | undefined {
    const stmt = this.database.getDb().prepare(`
      SELECT
        id,
        name,
        twitter_handle,
        wallet_address,
        status,
        created_at,
        updated_at
      FROM accounts
      WHERE id = ?
    `);

    const row = stmt.get(id) as AccountRow | undefined;

    return row ? this.mapRow(row) : undefined;
  }

  getAccountByName(name: string): Account | undefined {
    const stmt = this.database.getDb().prepare(`
      SELECT
        id,
        name,
        twitter_handle,
        wallet_address,
        status,
        created_at,
        updated_at
      FROM accounts
      WHERE name = ?
    `);

    const row = stmt.get(name.trim()) as AccountRow | undefined;

    return row ? this.mapRow(row) : undefined;
  }

  getAllAccounts(): Account[] {
    const stmt = this.database.getDb().prepare(`
      SELECT
        id,
        name,
        twitter_handle,
        wallet_address,
        status,
        created_at,
        updated_at
      FROM accounts
      ORDER BY id ASC
    `);

    const rows = stmt.all() as AccountRow[];

    return rows.map((row) => this.mapRow(row));
  }

  getActiveAccounts(): Account[] {
    const stmt = this.database.getDb().prepare(`
      SELECT
        id,
        name,
        twitter_handle,
        wallet_address,
        status,
        created_at,
        updated_at
      FROM accounts
      WHERE status = 'ACTIVE'
      ORDER BY id ASC
    `);

    const rows = stmt.all() as AccountRow[];

    return rows.map((row) => this.mapRow(row));
  }

  updateAccount(id: number, input: UpdateAccountInput): Account | undefined {
    const existing = this.getAccountById(id);

    if (!existing) {
      return undefined;
    }

    const twitterHandle =
      input.twitterHandle !== undefined
        ? input.twitterHandle?.trim() || null
        : existing.twitterHandle;

    const walletAddress =
      input.walletAddress !== undefined
        ? input.walletAddress?.trim() || null
        : existing.walletAddress;

    const status = input.status ?? existing.status;

    const stmt = this.database.getDb().prepare(`
      UPDATE accounts
      SET
        twitter_handle = ?,
        wallet_address = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(twitterHandle, walletAddress, status, id);

    return this.getAccountById(id);
  }

  renameAccount(currentName: string, newName: string): Account | undefined {
    const oldName = currentName.trim();
    const normalizedNewName = newName.trim();

    if (!oldName) {
      throw new Error("Nama account lama tidak boleh kosong.");
    }

    if (!normalizedNewName) {
      throw new Error("Nama account baru tidak boleh kosong.");
    }

    const existing = this.getAccountByName(oldName);

    if (!existing) {
      return undefined;
    }

    if (oldName === normalizedNewName) {
      return existing;
    }

    const nameAlreadyUsed = this.getAccountByName(normalizedNewName);

    if (nameAlreadyUsed) {
      throw new Error(`Account dengan nama "${normalizedNewName}" sudah ada.`);
    }

    const stmt = this.database.getDb().prepare(`
      UPDATE accounts
      SET
        name = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(normalizedNewName, existing.id);

    const renamed = this.getAccountById(existing.id);

    if (!renamed) {
      throw new Error(
        "Account berhasil di-rename tetapi gagal dibaca kembali.",
      );
    }

    console.log(
      `✏️ [AccountManager] Account di-rename: "${oldName}" → "${renamed.name}" (ID: ${renamed.id})`,
    );

    return renamed;
  }

  deactivateAccount(id: number): Account | undefined {
    return this.updateAccount(id, {
      status: "INACTIVE",
    });
  }

  activateAccount(id: number): Account | undefined {
    return this.updateAccount(id, {
      status: "ACTIVE",
    });
  }

  deleteAccount(id: number): boolean {
    const stmt = this.database.getDb().prepare(`
      DELETE FROM accounts
      WHERE id = ?
    `);

    const result = stmt.run(id);

    if (result.changes > 0) {
      console.log(`🗑️ [AccountManager] Account ID ${id} dihapus.`);

      return true;
    }

    return false;
  }

  private mapRow(row: AccountRow): Account {
    return {
      id: row.id,
      name: row.name,
      twitterHandle: row.twitter_handle,
      walletAddress: row.wallet_address,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

interface AccountRow {
  id: number;
  name: string;
  twitter_handle: string | null;
  wallet_address: string | null;
  status: AccountStatus;
  created_at: string;
  updated_at: string;
}
