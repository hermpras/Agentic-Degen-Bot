import { AccountBrowser } from "../browser/account-browser.js";
import { BrowserExecutor } from "../browser/browser-executor.js";
import type { PlannedTask } from "./task-planner.js";

export interface XBrowser {
  open(url: string): Promise<void>;
  elementExists(selector: string): Promise<boolean>;
  click(selector: string): Promise<void>;
  getText(selector: string): Promise<string>;
  getCurrentUrl(): Promise<string>;
  getPageResult(): Promise<{
    url: string;
    title: string;
    text: string;
  }>;
}

export type XFollowState = "FOLLOW" | "FOLLOWING" | "UNKNOWN";

export interface XActionResult {
  success: boolean;
  action: string;
  accountId: number;
  targetUrl: string;
  message: string;
  output?: string;
  proof?: string;
}

export class XActionExecutor {
  private readonly accountBrowser: AccountBrowser;

  constructor(accountBrowser?: AccountBrowser) {
    this.accountBrowser =
      accountBrowser ?? new AccountBrowser(undefined, { headless: true });
  }

  async inspectFollow(
    accountId: number,
    targetUrl: string,
  ): Promise<XFollowState> {
    const browser = await this.accountBrowser.openForAccount(accountId);

    try {
      await browser.open(targetUrl);
      await this.waitForXPage(browser);

      return await this.detectFollowState(browser, targetUrl);
    } finally {
      await this.accountBrowser.close();
    }
  }

  async execute(task: PlannedTask): Promise<XActionResult> {
    console.log(
      `𝕏 [XActionExecutor] Preparing ${task.taskType} → Account ${task.accountId}`,
    );

    if (task.taskType !== "X_FOLLOW") {
      throw new Error(`X action ${task.taskType} belum diimplementasikan.`);
    }

    if (!task.targetUrl) {
      throw new Error(
        `X_FOLLOW membutuhkan targetUrl untuk account ${task.accountId}.`,
      );
    }

    return this.executeFollowWithInspection(task.accountId, task.targetUrl);
  }

  private async executeFollowWithInspection(
    accountId: number,
    targetUrl: string,
  ): Promise<XActionResult> {
    const browser = await this.accountBrowser.openForAccount(accountId);

    try {
      await browser.open(targetUrl);

      console.log("𝕏 [XActionExecutor] Waiting for X page to render...");

      await this.waitForXPage(browser);

      const state = await this.detectFollowState(browser, targetUrl);

      console.log(`𝕏 [XActionExecutor] Follow state: ${state}`);

      if (state === "FOLLOWING") {
        const output = `Already following ${targetUrl}`;

        return {
          success: true,
          action: "X_FOLLOW",
          accountId,
          targetUrl,
          message: "Account sudah mengikuti target.",
          output,
          proof: output,
        };
      }

      if (state === "UNKNOWN") {
        throw new Error(
          `Follow state tidak dapat ditentukan pada ${targetUrl}. Action dibatalkan.`,
        );
      }

      const handle = this.extractXHandle(targetUrl);

      if (!handle) {
        throw new Error(
          `Tidak bisa menentukan username X dari URL: ${targetUrl}`,
        );
      }

      /*
       * X sekarang menggunakan casing username yang bisa berbeda
       * dari URL. Contoh:
       *
       * URL:
       *   /arcwargg
       *
       * DOM:
       *   Follow @Arcwargg
       *
       * Modifier "i" membuat attribute selector case-insensitive.
       */
      const followSelector = `button[aria-label="Follow @${handle}" i]`;

      console.log(`𝕏 [XActionExecutor] Target handle: @${handle}`);

      console.log(
        `𝕏 [XActionExecutor] Looking for target button: ${followSelector}`,
      );

      const followExists = await browser.elementExists(followSelector);

      if (!followExists) {
        throw new Error(
          `Tombol Follow untuk @${handle} tidak ditemukan pada ${targetUrl}.`,
        );
      }

      console.log("𝕏 [XActionExecutor] Clicking target Follow button...");

      await browser.click(followSelector);

      await this.waitForFollowingState(browser, targetUrl);

      const finalState = await this.detectFollowState(browser, targetUrl);

      console.log(`𝕏 [XActionExecutor] Final follow state: ${finalState}`);

      if (finalState !== "FOLLOWING") {
        throw new Error(
          `Follow click dilakukan tetapi status akhir tidak terkonfirmasi. State: ${finalState}`,
        );
      }

      const output = `Followed ${targetUrl}`;

      return {
        success: true,
        action: "X_FOLLOW",
        accountId,
        targetUrl,
        message: "Berhasil follow target.",
        output,
        proof: output,
      };
    } finally {
      await this.accountBrowser.close();
    }
  }

  private async detectFollowState(
    browser: BrowserExecutor,
    targetUrl: string,
  ): Promise<XFollowState> {
    const handle = this.extractXHandle(targetUrl);

    if (handle) {
      /*
       * Case-insensitive karena casing username pada DOM
       * bisa berbeda dari casing URL.
       */
      const followingSelector = `button[aria-label="Following @${handle}" i]`;

      const followSelector = `button[aria-label="Follow @${handle}" i]`;

      if (await browser.elementExists(followingSelector)) {
        return "FOLLOWING";
      }

      if (await browser.elementExists(followSelector)) {
        return "FOLLOW";
      }
    }

    /*
     * Fallback hanya untuk status.
     * Jangan gunakan page text untuk menentukan tombol
     * yang akan diklik karena X punya banyak tombol Follow.
     */
    const page = await browser.getPageResult();
    const normalizedText = page.text.toLowerCase();

    if (
      normalizedText.includes("following") &&
      !normalizedText.includes("follow")
    ) {
      return "FOLLOWING";
    }

    if (normalizedText.includes("follow")) {
      return "FOLLOW";
    }

    return "UNKNOWN";
  }

  private async waitForXPage(
    browser: BrowserExecutor,
    timeoutMs = 15000,
  ): Promise<void> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      try {
        const page = await browser.getPageResult();
        const text = page.text.toLowerCase();

        if (text.includes("follow") || text.includes("following")) {
          console.log("𝕏 [XActionExecutor] X page ready.");
          return;
        }
      } catch {
        // X masih loading.
      }

      await this.sleep(500);
    }

    throw new Error(
      `X page tidak selesai render dalam ${timeoutMs}ms: ${await browser.getCurrentUrl()}`,
    );
  }

  private async waitForFollowingState(
    browser: BrowserExecutor,
    targetUrl: string,
    timeoutMs = 10000,
  ): Promise<void> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const state = await this.detectFollowState(browser, targetUrl);

      if (state === "FOLLOWING") {
        console.log("𝕏 [XActionExecutor] Follow berhasil terkonfirmasi.");
        return;
      }

      await this.sleep(500);
    }
  }

  private extractXHandle(targetUrl: string): string | null {
    try {
      const url = new URL(targetUrl);

      if (
        url.hostname !== "x.com" &&
        url.hostname !== "www.x.com" &&
        url.hostname !== "twitter.com" &&
        url.hostname !== "www.twitter.com"
      ) {
        return null;
      }

      const parts = url.pathname.split("/").filter(Boolean);

      if (parts.length === 0) {
        return null;
      }

      return parts[0].replace(/^@/, "");
    } catch {
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async close(): Promise<void> {
    await this.accountBrowser.close();
  }
}

export class AccountBrowserAdapter implements XBrowser {
  constructor(private readonly browser: BrowserExecutor) {}

  async open(url: string): Promise<void> {
    await this.browser.open(url);
  }

  async elementExists(selector: string): Promise<boolean> {
    return this.browser.elementExists(selector);
  }

  async click(selector: string): Promise<void> {
    await this.browser.click(selector);
  }

  async getText(selector: string): Promise<string> {
    return this.browser.getText(selector);
  }

  async getCurrentUrl(): Promise<string> {
    return this.browser.getCurrentUrl();
  }

  async getPageResult(): Promise<{
    url: string;
    title: string;
    text: string;
  }> {
    return this.browser.getPageResult();
  }
}
