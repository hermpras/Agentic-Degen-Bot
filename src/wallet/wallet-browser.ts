import { BrowserExecutor } from "../browser/browser-executor.js";
import { WalletSessionManager } from "./wallet-session-manager.js";

export interface WalletBrowserOptions {
  headless?: boolean;
  timeoutMs?: number;
  connectOverCDPUrl?: string;
}

export class WalletBrowser {
  constructor(private readonly sessionManager = new WalletSessionManager()) {}

  async openForAccount(
    accountId: number,
    options: WalletBrowserOptions = {},
  ): Promise<BrowserExecutor> {
    const timeoutMs = options.timeoutMs ?? 30000;

    if (options.connectOverCDPUrl) {
      const browser = new BrowserExecutor({
        headless: false,
        timeoutMs,
        connectOverCDPUrl: options.connectOverCDPUrl,
      });

      await browser.start();

      return browser;
    }

    if (!this.sessionManager.hasSession(accountId)) {
      throw new Error(
        `Wallet session untuk account ${accountId} belum tersedia. ` +
          `Buat wallet browser session terlebih dahulu.`,
      );
    }

    const browser = new BrowserExecutor({
      headless: options.headless ?? true,
      timeoutMs,
      storageStatePath: this.sessionManager.getSessionPath(accountId),
    });

    await browser.start();

    return browser;
  }

  hasSession(accountId: number): boolean {
    return this.sessionManager.hasSession(accountId);
  }

  getSessionPath(accountId: number): string {
    return this.sessionManager.getSessionPath(accountId);
  }
}
