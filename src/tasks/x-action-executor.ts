import { AccountBrowser } from "../browser/account-browser.js";
import { PlannedTask } from "./task-planner.js";

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
  async inspectFollow(task: PlannedTask): Promise<XFollowInspectionResult> {
    if (!task.targetUrl) {
      throw new Error(`Task ${task.planTaskId} membutuhkan targetUrl.`);
    }

    console.log("");
    console.log(
      `𝕏 [XActionExecutor] Inspect X_FOLLOW → Account ${task.accountId}`,
    );

    const accountBrowser = new AccountBrowser(undefined, {
      headless: true,
    });

    try {
      const browser = await accountBrowser.openForAccount(task.accountId);

      await browser.open(task.targetUrl);

      const followSelectors = [
        'button[data-testid="followButton"]',
        'button:text-is("Follow")',
      ];

      for (const selector of followSelectors) {
        try {
          await browser.getText(selector);

          console.log(
            `𝕏 [XActionExecutor] Follow button ditemukan: ${selector}`,
          );

          return {
            accountId: task.accountId,

            accountName: task.accountName,

            targetUrl: task.targetUrl,

            state: "FOLLOW",

            matchedSelector: selector,

            message: "Target belum di-follow dan tombol Follow ditemukan.",
          };
        } catch {
          // Coba selector berikutnya.
        }
      }

      const followingSelectors = [
        'button[data-testid="unfollowButton"]',
        'button:text-is("Following")',
      ];

      for (const selector of followingSelectors) {
        try {
          await browser.getText(selector);

          console.log(
            `𝕏 [XActionExecutor] Following state ditemukan: ${selector}`,
          );

          return {
            accountId: task.accountId,

            accountName: task.accountName,

            targetUrl: task.targetUrl,

            state: "FOLLOWING",

            matchedSelector: selector,

            message: "Account sudah mengikuti target.",
          };
        } catch {
          // Coba selector berikutnya.
        }
      }

      let pageText = "";

      try {
        pageText = await browser.getText("body");
      } catch {
        // Ignore body read failure.
      }

      const normalizedText = pageText.toLowerCase();

      if (normalizedText.includes("following")) {
        console.log("𝕏 [XActionExecutor] Following terdeteksi dari page text.");

        return {
          accountId: task.accountId,

          accountName: task.accountName,

          targetUrl: task.targetUrl,

          state: "FOLLOWING",

          matchedSelector: null,

          message: "Account sudah mengikuti target berdasarkan page text.",
        };
      }

      console.log("⚠️ [XActionExecutor] Follow state tidak dapat ditentukan.");

      return {
        accountId: task.accountId,

        accountName: task.accountName,

        targetUrl: task.targetUrl,

        state: "UNKNOWN",

        matchedSelector: null,

        message: "Follow state tidak dapat ditentukan dari halaman.",
      };
    } finally {
      await accountBrowser.close();
    }
  }

  async execute(task: PlannedTask): Promise<XActionResult> {
    if (!this.isXAction(task.taskType)) {
      throw new Error(`Task type "${task.taskType}" bukan X action.`);
    }

    if (!task.targetUrl) {
      throw new Error(`Task ${task.planTaskId} membutuhkan targetUrl.`);
    }

    console.log("");
    console.log(
      `𝕏 [XActionExecutor] ${task.taskType} → Account ${task.accountId}`,
    );

    const accountBrowser = new AccountBrowser(undefined, {
      headless: true,
    });

    try {
      const browser = await accountBrowser.openForAccount(task.accountId);

      await browser.open(task.targetUrl);

      switch (task.taskType) {
        case "X_FOLLOW":
          return await this.executeFollow(browser, task);

        default:
          throw new Error(
            `X action "${task.taskType}" belum memiliki executor.`,
          );
      }
    } finally {
      await accountBrowser.close();
    }
  }

  private async executeFollow(
    browser: {
      click(selector: string): Promise<void>;

      getText(selector: string): Promise<string>;

      getCurrentUrl(): string;
    },
    task: PlannedTask,
  ): Promise<XActionResult> {
    const selectors = [
      'button[data-testid="followButton"]',
      'button:has-text("Follow")',
    ];

    for (const selector of selectors) {
      try {
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

            currentUrl: browser.getCurrentUrl(),
          }),
        };
      } catch {
        // Coba selector berikutnya.
      }
    }

    let pageText = "";

    try {
      pageText = await browser.getText("body");
    } catch {
      // Ignore body read failure.
    }

    if (pageText.toLowerCase().includes("following")) {
      console.log("𝕏 [XActionExecutor] Account sudah follow target.");

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

          alreadyFollowing: true,

          currentUrl: browser.getCurrentUrl(),
        }),
      };
    }

    throw new Error(`Tombol Follow tidak ditemukan pada ${task.targetUrl}.`);
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
