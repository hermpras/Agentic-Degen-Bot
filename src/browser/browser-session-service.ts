import { BrowserExecutor } from "./browser-executor.js";
import { BrowserSessionManager } from "./browser-session-manager.js";

export interface BrowserSessionHandle {
  accountId: number;
  sessionPath: string;
  hasExistingSession: boolean;
  executor: BrowserExecutor;
}

export class BrowserSessionService {
  constructor(private readonly sessionManager = new BrowserSessionManager()) {}

  async startManualSession(accountId: number): Promise<BrowserSessionHandle> {
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
      executor,
    };
  }

  async saveSession(session: BrowserSessionHandle): Promise<string> {
    console.log(
      `🔐 [BrowserSessionService] Saving session for account ${session.accountId}...`,
    );

    const sessionPath = await session.executor.saveStorageState(
      session.sessionPath,
    );

    console.log(`🔐 [BrowserSessionService] Session saved: ${sessionPath}`);

    return sessionPath;
  }

  async closeSession(session: BrowserSessionHandle): Promise<void> {
    console.log(
      `🌐 [BrowserSessionService] Closing session for account ${session.accountId}...`,
    );

    await session.executor.close();
  }

  async openSavedSession(accountId: number): Promise<BrowserSessionHandle> {
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

    return {
      accountId,
      sessionPath: session.sessionPath,
      hasExistingSession: true,
      executor,
    };
  }

  hasSession(accountId: number): boolean {
    return this.sessionManager.hasSession(accountId);
  }

  deleteSession(accountId: number): boolean {
    return this.sessionManager.deleteSession(accountId);
  }
}
