import { AccountBrowser } from "../browser/account-browser.js";
import { BrowserExecutor } from "../browser/browser-executor.js";
import { PlannedTask } from "./task-planner.js";

export interface XBrowser {
  open(url: string): Promise<{
    url: string;
    title: string;
    text: string;
  }>;

  elementExists(selector: string): Promise<boolean>;

  click(selector: string): Promise<void>;

  getText(selector: string): Promise<string>;

  getCurrentUrl(): string;
}

export interface XBrowserProvider {
  openForAccount(accountId: number): Promise<XBrowser>;

  close(): Promise<void>;
}

export type XActionType =
  | "X_FOLLOW"
  | "X_LIKE"
  | "X_REPOST"
  | "X_COMMENT"
  | "X_REPLY"
  | "X_QUOTE"
  | "X_POST";

export type XFollowState = "FOLLOW" | "FOLLOWING" | "UNKNOWN";

export interface XFollowInspectionResult {
  accountId: number;
  accountName: string;
  targetUrl: string;
  state: XFollowState;
  matchedSelector: string | null;
  message: string;
}

export interface XActionResult {
  accountId: number;
  action: XActionType;
  targetUrl: string;
  success: boolean;
  output: string | null;
}

export class XActionExecutor {
  constructor(
    private readonly browserProvider: XBrowserProvider = new AccountBrowserAdapter(),
  ) {}

  async inspectFollow(task: PlannedTask): Promise<XFollowInspectionResult> {
    if (!task.targetUrl) {
      throw new Error(`Task ${task.planTaskId} membutuhkan targetUrl.`);
    }

    console.log("");
    console.log(
      `𝕏 [XActionExecutor] Inspect X_FOLLOW → Account ${task.accountId}`,
    );

    try {
      const browser = await this.browserProvider.openForAccount(task.accountId);

      await browser.open(task.targetUrl);

      return await this.inspectFollowOnBrowser(browser, task);
    } finally {
      await this.browserProvider.close();
    }
  }

  async execute(task: PlannedTask): Promise<XActionResult> {
    if (!this.isXAction(task.taskType)) {
      throw new Error(`Task type "${task.taskType}" bukan X action.`);
    }

    if (!task.targetUrl) {
      throw new Error(`Task ${task.planTaskId} membutuhkan targetUrl.`);
    }

    if (task.taskType === "X_FOLLOW") {
      return this.executeFollowWithInspection(task);
    }

    throw new Error(`X action "${task.taskType}" belum memiliki executor.`);
  }

  private async executeFollowWithInspection(
    task: PlannedTask,
  ): Promise<XActionResult> {
    console.log("");
    console.log(
      `𝕏 [XActionExecutor] Preparing X_FOLLOW → Account ${task.accountId}`,
    );

    try {
      const browser = await this.browserProvider.openForAccount(task.accountId);

      await browser.open(task.targetUrl!);

      const inspection = await this.inspectFollowOnBrowser(browser, task);

      if (inspection.state === "FOLLOWING") {
        console.log(
          "✅ [XActionExecutor] Target sudah di-follow. Tidak melakukan click.",
        );

        return {
          accountId: task.accountId,

          action: "X_FOLLOW",

          targetUrl: task.targetUrl!,

          success: true,

          output: JSON.stringify({
            action: "X_FOLLOW",

            targetUrl: task.targetUrl,

            accountId: task.accountId,

            accountName: task.accountName,

            state: "FOLLOWING",

            alreadyFollowing: true,

            actionPerformed: false,

            matchedSelector: inspection.matchedSelector,
          }),
        };
      }

      if (inspection.state === "UNKNOWN") {
        throw new Error(
          `Follow state tidak dapat ditentukan pada ${task.targetUrl}. Action dibatalkan.`,
        );
      }

      const selector = inspection.matchedSelector;

      if (!selector) {
        throw new Error(
          "Follow button terdeteksi tetapi selector tidak tersedia.",
        );
      }

      await browser.click(selector);

      console.log(
        `𝕏 [XActionExecutor] Follow berhasil menggunakan selector: ${selector}`,
      );

      return {
        accountId: task.accountId,

        action: "X_FOLLOW",

        targetUrl: task.targetUrl!,

        success: true,

        output: JSON.stringify({
          action: "X_FOLLOW",

          targetUrl: task.targetUrl,

          accountId: task.accountId,

          accountName: task.accountName,

          state: "FOLLOW",

          actionPerformed: true,

          matchedSelector: selector,

          currentUrl: browser.getCurrentUrl(),
        }),
      };
    } finally {
      await this.browserProvider.close();
    }
  }

  private async inspectFollowOnBrowser(
    browser: XBrowser,
    task: PlannedTask,
  ): Promise<XFollowInspectionResult> {
    const followSelectors = [
      'button[data-testid="followButton"]',
      'button:text-is("Follow")',
    ];

    for (const selector of followSelectors) {
      const exists = await browser.elementExists(selector);

      if (exists) {
        console.log(`𝕏 [XActionExecutor] Follow button ditemukan: ${selector}`);

        return {
          accountId: task.accountId,

          accountName: task.accountName,

          targetUrl: task.targetUrl!,

          state: "FOLLOW",

          matchedSelector: selector,

          message: "Target belum di-follow.",
        };
      }
    }

    const followingSelectors = [
      'button[data-testid="unfollowButton"]',
      'button:text-is("Following")',
    ];

    for (const selector of followingSelectors) {
      const exists = await browser.elementExists(selector);

      if (exists) {
        console.log(
          `𝕏 [XActionExecutor] Following state ditemukan: ${selector}`,
        );

        return {
          accountId: task.accountId,

          accountName: task.accountName,

          targetUrl: task.targetUrl!,

          state: "FOLLOWING",

          matchedSelector: selector,

          message: "Account sudah mengikuti target.",
        };
      }
    }

    let pageText = "";

    try {
      pageText = await browser.getText("body");
    } catch {
      // Ignore body read failure.
    }

    if (pageText.toLowerCase().includes("following")) {
      console.log("𝕏 [XActionExecutor] Following terdeteksi dari page text.");

      return {
        accountId: task.accountId,

        accountName: task.accountName,

        targetUrl: task.targetUrl!,

        state: "FOLLOWING",

        matchedSelector: null,

        message: "Account sudah mengikuti target berdasarkan page text.",
      };
    }

    console.log("⚠️ [XActionExecutor] Follow state tidak dapat ditentukan.");

    return {
      accountId: task.accountId,

      accountName: task.accountName,

      targetUrl: task.targetUrl!,

      state: "UNKNOWN",

      matchedSelector: null,

      message: "Follow state tidak dapat ditentukan.",
    };
  }

  private isXAction(taskType: string): taskType is XActionType {
    return [
      "X_FOLLOW",
      "X_LIKE",
      "X_REPOST",
      "X_COMMENT",
      "X_REPLY",
      "X_QUOTE",
      "X_POST",
    ].includes(taskType);
  }
}

class AccountBrowserAdapter implements XBrowserProvider {
  private readonly accountBrowser = new AccountBrowser(undefined, {
    headless: true,
  });

  private browser: BrowserExecutor | null = null;

  async openForAccount(accountId: number): Promise<XBrowser> {
    this.browser = await this.accountBrowser.openForAccount(accountId);

    return this.browser;
  }

  async close(): Promise<void> {
    await this.accountBrowser.close();

    this.browser = null;
  }
}
