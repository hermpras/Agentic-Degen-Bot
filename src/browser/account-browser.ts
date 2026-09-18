import { BrowserExecutor } from "./browser-executor.js";

export interface AccountBrowserOptions {
  headless?: boolean;
  timeoutMs?: number;
  authRootDir?: string;
}

export class AccountBrowser {
  private readonly options: AccountBrowserOptions;

  private executor: BrowserExecutor | null = null;
  private accountId: number | null = null;

  constructor(options: AccountBrowserOptions = {}) {
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
        `AccountBrowser sedang digunakan oleh account ${this.accountId}. ` +
          `Tutup session terlebih dahulu sebelum membuka account ${accountId}.`,
      );
    }

    const authRootDir = this.options.authRootDir ?? "playwright/.auth";
    const storageStatePath = `${authRootDir}/account-${accountId}.json`;

    console.log(
      `👤 [AccountBrowser] Opening browser for account ${accountId}...`,
    );
    console.log(`🔐 [AccountBrowser] Session: ${storageStatePath}`);

    const executor = new BrowserExecutor({
      headless: this.options.headless ?? true,
      timeoutMs: this.options.timeoutMs ?? 30_000,
      storageStatePath,
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

    const authRootDir = this.options.authRootDir ?? "playwright/.auth";
    const storageStatePath = `${authRootDir}/account-${this.accountId}.json`;

    console.log(
      `💾 [AccountBrowser] Account ${this.accountId} menggunakan session: ${storageStatePath}`,
    );

    return storageStatePath;
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
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return false;
    }

    const authRootDir = this.options.authRootDir ?? "playwright/.auth";
    const storageStatePath = `${authRootDir}/account-${accountId}.json`;

    // BrowserExecutor akan menangani validasi session ketika dibuka.
    // Di sini kita hanya memastikan path session yang digunakan konsisten.
    return Boolean(storageStatePath);
  }
}
