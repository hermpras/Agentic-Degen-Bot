import fs from "fs";
import path from "path";

export interface BrowserSessionInfo {
  accountId: number;
  sessionPath: string;
  exists: boolean;
}

export class BrowserSessionManager {
  private readonly authDirectory: string;

  constructor(authDirectoryRelative = "playwright/.auth") {
    this.authDirectory = path.resolve(process.cwd(), authDirectoryRelative);

    this.ensureAuthDirectory();
  }

  getSessionPath(accountId: number): string {
    this.validateAccountId(accountId);

    return path.join(this.authDirectory, `account-${accountId}.json`);
  }

  hasSession(accountId: number): boolean {
    const sessionPath = this.getSessionPath(accountId);

    return fs.existsSync(sessionPath);
  }

  getSessionInfo(accountId: number): BrowserSessionInfo {
    const sessionPath = this.getSessionPath(accountId);

    return {
      accountId,
      sessionPath,
      exists: fs.existsSync(sessionPath),
    };
  }

  listSessions(): BrowserSessionInfo[] {
    this.ensureAuthDirectory();

    const files = fs
      .readdirSync(this.authDirectory)
      .filter((file) => file.startsWith("account-") && file.endsWith(".json"));

    return files
      .map((file) => {
        const match = file.match(/^account-(\d+)\.json$/);

        if (!match) {
          return null;
        }

        const accountId = Number(match[1]);

        return {
          accountId,
          sessionPath: path.join(this.authDirectory, file),
          exists: true,
        };
      })
      .filter((session): session is BrowserSessionInfo => session !== null)
      .sort((a, b) => a.accountId - b.accountId);
  }

  deleteSession(accountId: number): boolean {
    const sessionPath = this.getSessionPath(accountId);

    if (!fs.existsSync(sessionPath)) {
      return false;
    }

    fs.unlinkSync(sessionPath);

    console.log(
      `🔐 [BrowserSessionManager] Session account ${accountId} dihapus.`,
    );

    return true;
  }

  ensureAuthDirectory(): void {
    if (!fs.existsSync(this.authDirectory)) {
      fs.mkdirSync(this.authDirectory, {
        recursive: true,
      });
    }
  }

  private validateAccountId(accountId: number): void {
    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new Error("Account ID harus berupa integer positif.");
    }
  }
}
