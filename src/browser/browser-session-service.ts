import { BrowserExecutor } from "./browser-executor.js";
import { BrowserSessionManager } from "./browser-session-manager.js";

export interface BrowserSessionStartResult {
  accountId: number;
  sessionPath: string;
  hasExistingSession: boolean;
}

export class BrowserSessionService {
  constructor(private readonly sessionManager = new BrowserSessionManager()) {}

  async startManualSession(
    accountId: number,
  ): Promise<BrowserSessionStartResult> {
    const session = this.sessionManager.getSessionInfo(accountId);

    console.log(
      `🔐 [BrowserSessionService] Starting manual session for account ${accountId}...`,
    );

    const executor = new BrowserExecutor({
      headless: false,
      storageStatePath: session.exists ? session.sessionPath : undefined,
    });

    await executor.start();

    console.log(
      `🌐 [BrowserSessionService] Browser ready for account ${accountId}.`,
    );

    if (session.exists) {
      console.log(
        `🔐 [BrowserSessionService] Existing session loaded: ${session.sessionPath}`,
      );
    } else {
      console.log(
        "🔐 [BrowserSessionService] No existing session. Login manually in the browser.",
      );
    }

    return {
      accountId,
      sessionPath: session.sessionPath,
      hasExistingSession: session.exists,
    };
  }

  async saveSession(
    accountId: number,
    executor: BrowserExecutor,
  ): Promise<string> {
    const sessionPath = this.sessionManager.getSessionPath(accountId);

    console.log(
      `🔐 [BrowserSessionService] Saving session for account ${accountId}...`,
    );

    await executor.saveStorageState(sessionPath);

    console.log(`🔐 [BrowserSessionService] Session saved: ${sessionPath}`);

    return sessionPath;
  }

  async openSavedSession(accountId: number): Promise<BrowserExecutor> {
    const session = this.sessionManager.getSessionInfo(accountId);

    if (!session.exists) {
      throw new Error(
        `Session untuk account ${accountId} belum ada. Buat manual session terlebih dahulu.`,
      );
    }

    console.log(
      `🔐 [BrowserSessionService] Loading saved session for account ${accountId}...`,
    );

    const executor = new BrowserExecutor({
      headless: false,
      storageStatePath: session.sessionPath,
    });

    await executor.start();

    return executor;
  }

  hasSession(accountId: number): boolean {
    return this.sessionManager.hasSession(accountId);
  }

  deleteSession(accountId: number): boolean {
    return this.sessionManager.deleteSession(accountId);
  }
}
