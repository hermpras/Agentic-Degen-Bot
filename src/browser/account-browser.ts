import { BrowserExecutor } from "./browser-executor.js";
import { BrowserSessionManager } from "./browser-session-manager.js";

export interface AccountBrowserOptions {
  headless?: boolean;
  timeoutMs?: number;
}

export class AccountBrowser {
  private readonly sessionManager: BrowserSessionManager;
  private readonly options: AccountBrowserOptions;

  private executor: BrowserExecutor | null = null;
  private accountId: number | null = null;

  constructor(
    sessionManager = new BrowserSessionManager(),
    options: AccountBrowserOptions = {},
  ) {
    this.sessionManager = sessionManager;
    this.options = options;
  }

  async openForAccount(accountId: number): Promise<BrowserExecutor> {
    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new Error("Account ID harus berupa integer positif.");
    }

    if (this.executor) {
      if (this.accountId === accountId) {
        return this.executor;
      }

      throw new Error(
        `AccountBrowser sedang digunakan oleh account ${this.accountId}. Tutup session terlebih dahulu sebelum membuka account ${accountId}.`,
      );
    }

    const session = this.sessionManager.getSessionInfo(accountId);

    if (!session.exists) {
      throw new Error(
        `Session browser untuk account ${accountId} belum tersedia. Buat session terlebih dahulu.`,
      );
    }

    console.log(
      `👤 [AccountBrowser] Opening browser for account ${accountId}...`,
    );

    console.log(`🔐 [AccountBrowser] Session: ${session.sessionPath}`);

    const executor = new BrowserExecutor({
      headless: this.options.headless ?? true,
      timeoutMs: this.options.timeoutMs ?? 30_000,
      storageStatePath: session.sessionPath,
    });

    await executor.start();

    this.executor = executor;
    this.accountId = accountId;

    console.log(`👤 [AccountBrowser] Account ${accountId} browser ready.`);

    return executor;
  }

  getCurrentAccountId(): number | null {
    return this.accountId;
  }

  getExecutor(): BrowserExecutor {
    if (!this.executor) {
      throw new Error("Account browser belum dibuka.");
    }

    return this.executor;
  }

  async saveSession(): Promise<string> {
    if (!this.executor || this.accountId === null) {
      throw new Error("Account browser belum dibuka.");
    }

    const sessionPath = this.sessionManager.getSessionPath(this.accountId);

    console.log(
      `💾 [AccountBrowser] Saving session for account ${this.accountId}...`,
    );

    return this.executor.saveStorageState(sessionPath);
  }

  async close(): Promise<void> {
    if (!this.executor) {
      return;
    }

    console.log(
      `🌐 [AccountBrowser] Closing browser for account ${this.accountId}...`,
    );

    await this.executor.close();

    this.executor = null;
    this.accountId = null;
  }

  hasSession(accountId: number): boolean {
    return this.sessionManager.hasSession(accountId);
  }
}
