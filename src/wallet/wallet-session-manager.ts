import fs from "node:fs";
import path from "node:path";

export class WalletSessionManager {
  private readonly authDir: string;

  constructor(authDir: string = path.resolve("playwright", ".wallet-auth")) {
    this.authDir = authDir;
    fs.mkdirSync(this.authDir, { recursive: true });
  }

  getSessionPath(accountId: number): string {
    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new Error(`Invalid accountId: ${accountId}`);
    }

    return path.join(this.authDir, `account-${accountId}.json`);
  }

  hasSession(accountId: number): boolean {
    return fs.existsSync(this.getSessionPath(accountId));
  }

  listSessions(): number[] {
    if (!fs.existsSync(this.authDir)) {
      return [];
    }

    return fs
      .readdirSync(this.authDir)
      .filter((file) => /^account-\d+\.json$/.test(file))
      .map((file) => Number(file.replace("account-", "").replace(".json", "")))
      .filter((id) => Number.isInteger(id) && id > 0)
      .sort((a, b) => a - b);
  }

  ensureSessionDirectory(): void {
    fs.mkdirSync(this.authDir, {
      recursive: true,
    });
  }
}
