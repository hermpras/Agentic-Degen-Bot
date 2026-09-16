import { AgentDatabase } from "../database/agent-database.js";

import { BrowserExecutor } from "../browser/browser-executor.js";

import { TaskManager, TaskStatus } from "./task-manager.js";

import { FormExecutor } from "./form-executor.js";

import {
  WalletFormExecutor,
  type WalletFormExecutionResult,
} from "./wallet-form-executor.js";

import { XActionExecutor, type XActionResult } from "./x-action-executor.js";

import {
  AdaptiveWebExecutor,
  type AdaptiveWebExecutionContext,
} from "./adaptive-web-executor.js";

import { GeminiProvider } from "../providers/gemini.provider.js";

import type { PlannedTask, TaskPlan } from "./task-planner.js";

export interface TaskExecutionResult {
  planTaskId: string;

  taskId: number | null;

  projectName: string;

  accountName: string;

  taskType: string;

  status: TaskStatus;

  output: string | null;

  error: string | null;
}

export interface TaskExecutionReport {
  totalTasks: number;

  completedTasks: number;

  failedTasks: number;

  skippedTasks: number;

  results: TaskExecutionResult[];
}

interface TaskActionResult {
  output: string | null;

  status?: TaskStatus;
}

interface XIdentityVerificationResult {
  verified: boolean;

  expectedHandle: string;

  detectedHandle: string | null;

  source: string | null;

  message: string;
}

export class TaskExecutor {
  private readonly taskManager: TaskManager;

  private readonly xActionExecutor: XActionExecutor;

  private readonly formExecutor?: FormExecutor;

  private readonly adaptiveWebExecutor: AdaptiveWebExecutor;

  constructor(
    private readonly database: AgentDatabase,
    xActionExecutor?: XActionExecutor,
    formExecutor?: FormExecutor,
    adaptiveWebExecutor?: AdaptiveWebExecutor,
  ) {
    this.taskManager = new TaskManager(database);

    this.xActionExecutor = xActionExecutor ?? new XActionExecutor();

    this.formExecutor = formExecutor;

    this.adaptiveWebExecutor =
      adaptiveWebExecutor ?? this.createDefaultAdaptiveWebExecutor();
  }

  async executePlan(plan: TaskPlan): Promise<TaskExecutionReport> {
    const tasks = plan.tasks;

    const report: TaskExecutionReport = {
      totalTasks: tasks.length,
      completedTasks: 0,
      failedTasks: 0,
      skippedTasks: 0,
      results: [],
    };

    const completedPlanTaskIds = new Set<string>();

    console.log("");
    console.log(`🚀 [TaskExecutor] Starting plan → ${plan.projectName}`);
    console.log(`🔗 [TaskExecutor] Plan sourceUrl → ${plan.sourceUrl}`);
    console.log(`👥 [TaskExecutor] Accounts → ${plan.accountCount}`);
    console.log(`📋 [TaskExecutor] Tasks → ${tasks.length}`);

    for (const task of tasks) {
      const result = await this.executeTask(task, completedPlanTaskIds, plan);

      report.results.push(result);

      if (result.status === "DONE") {
        report.completedTasks += 1;

        completedPlanTaskIds.add(task.planTaskId);
      } else if (result.status === "FAILED") {
        report.failedTasks += 1;
      } else {
        report.skippedTasks += 1;
      }
    }

    console.log("");
    console.log(
      `📊 [TaskExecutor] Plan selesai → completed=${report.completedTasks}, failed=${report.failedTasks}, skipped=${report.skippedTasks}`,
    );

    return report;
  }

  async executeTask(
    task: PlannedTask,
    completedPlanTaskIds = new Set<string>(),
    plan?: TaskPlan,
  ): Promise<TaskExecutionResult> {
    console.log("");

    console.log(
      `⚙️ [TaskExecutor] Executing ${task.taskType} → ${task.projectName} / ${task.accountName}`,
    );

    const dependencyResult = this.checkDependencies(task, completedPlanTaskIds);

    if (!dependencyResult.ok) {
      console.log(`⏭️ [TaskExecutor] Task skipped: ${dependencyResult.reason}`);

      return {
        planTaskId: task.planTaskId,
        taskId: null,
        projectName: task.projectName,
        accountName: task.accountName,
        taskType: task.taskType,
        status: "PENDING",
        output: null,
        error: dependencyResult.reason ?? "Dependency belum selesai.",
      };
    }

    let databaseTaskId: number | null = null;

    try {
      databaseTaskId = this.createDatabaseTask(task);

      this.taskManager.markTaskInProgress(databaseTaskId);

      const actionResult = await this.executeTaskAction(
        task,
        databaseTaskId,
        plan,
      );

      if (actionResult.status === "IN_PROGRESS") {
        console.log(
          `⏸️ [TaskExecutor] Task masih IN_PROGRESS: ${task.planTaskId}`,
        );

        return {
          planTaskId: task.planTaskId,
          taskId: databaseTaskId,
          projectName: task.projectName,
          accountName: task.accountName,
          taskType: task.taskType,
          status: "IN_PROGRESS",
          output: actionResult.output,
          error: null,
        };
      }

      if (actionResult.status === "FAILED") {
        const errorMessage =
          actionResult.output ?? `Task ${task.planTaskId} gagal dieksekusi.`;

        this.taskManager.markTaskFailed(databaseTaskId, errorMessage);

        console.error(`❌ [TaskExecutor] Task FAILED: ${task.planTaskId}`);

        console.error(errorMessage);

        return {
          planTaskId: task.planTaskId,
          taskId: databaseTaskId,
          projectName: task.projectName,
          accountName: task.accountName,
          taskType: task.taskType,
          status: "FAILED",
          output: actionResult.output,
          error: errorMessage,
        };
      }

      this.taskManager.markTaskDone(
        databaseTaskId,
        actionResult.output ?? undefined,
      );

      console.log(`✅ [TaskExecutor] Task DONE: ${task.planTaskId}`);

      return {
        planTaskId: task.planTaskId,
        taskId: databaseTaskId,
        projectName: task.projectName,
        accountName: task.accountName,
        taskType: task.taskType,
        status: "DONE",
        output: actionResult.output,
        error: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      console.error(`❌ [TaskExecutor] Task FAILED: ${task.planTaskId}`);

      console.error(message);

      if (databaseTaskId !== null) {
        this.taskManager.markTaskFailed(databaseTaskId, message);
      }

      return {
        planTaskId: task.planTaskId,
        taskId: databaseTaskId,
        projectName: task.projectName,
        accountName: task.accountName,
        taskType: task.taskType,
        status: "FAILED",
        output: null,
        error: message,
      };
    }
  }

  private async executeTaskAction(
    task: PlannedTask,
    databaseTaskId: number,
    plan?: TaskPlan,
  ): Promise<TaskActionResult> {
    if (this.isXAction(task.taskType)) {
      return this.executeXAction(task, databaseTaskId, plan);
    }

    switch (task.taskType) {
      case "X_CONNECT":
        return this.executeXConnect(task, databaseTaskId);

      case "OPEN_PAGE":
        return this.executeOpenPage(task);

      case "FORM":
      case "FORM_TWITTER":
      case "FORM_SUBMIT":
        return this.executeFormTask(task, databaseTaskId);

      case "FORM_WALLET":
        return this.executeWalletFormTask(task, databaseTaskId);

      case "WHITELIST":
        return this.executeWhitelistTask(task, databaseTaskId);

      case "CUSTOM":
        return this.executeCustomTask(task);

      default:
        throw new Error(
          `Task type "${task.taskType}" belum memiliki executor.`,
        );
    }
  }

  /**
   * X_CONNECT menggunakan browser session khusus account.
   *
   * Tidak melakukan login username/password.
   *
   * Session account dicari berdasarkan:
   *
   * X_CONNECT_CDP_URL_ACCOUNT_<ACCOUNT_ID>
   * X_STORAGE_STATE_PATH_ACCOUNT_<ACCOUNT_ID>
   *
   * Setelah OAuth selesai, identity X di browser diverifikasi
   * terhadap twitterHandle milik account.
   */
  private async executeXConnect(
    task: PlannedTask,
    databaseTaskId: number,
  ): Promise<TaskActionResult> {
    if (!task.targetUrl) {
      throw new Error(
        `Task ${task.planTaskId} membutuhkan targetUrl untuk X_CONNECT.`,
      );
    }

    console.log(`𝕏 [TaskExecutor] X_CONNECT → ${task.targetUrl}`);

    console.log(
      `👤 [TaskExecutor] X account scope → #${task.accountId} / ${task.accountName}`,
    );

    const accountId = task.accountId;

    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new Error(
        `Task ${task.planTaskId} memiliki accountId yang tidak valid.`,
      );
    }

    const account = this.getAccountContext(accountId);

    const expectedTwitterHandle =
      account.twitterHandle?.trim() ?? task.twitterHandle?.trim() ?? "";

    if (!expectedTwitterHandle) {
      throw new Error(
        `Account "${task.accountName}" belum memiliki Twitter/X handle. Identity verification tidak dapat dilakukan.`,
      );
    }

    /*
     * ============================================================
     * ACCOUNT-SPECIFIC X BROWSER SESSION
     * ============================================================
     */

    const accountCdpEnvKey = `X_CONNECT_CDP_URL_ACCOUNT_${accountId}`;

    const accountStorageEnvKey = `X_STORAGE_STATE_PATH_ACCOUNT_${accountId}`;

    const cdpUrl = process.env[accountCdpEnvKey]?.trim() ?? null;

    const storageStatePath = process.env[accountStorageEnvKey]?.trim() ?? null;

    console.log(`🔐 [TaskExecutor] X session env → ${accountCdpEnvKey}`);

    if (cdpUrl) {
      console.log(`🌐 [TaskExecutor] X CDP account #${accountId} → ${cdpUrl}`);
    }

    if (storageStatePath) {
      console.log(
        `💾 [TaskExecutor] X storage state account #${accountId} → ${storageStatePath}`,
      );
    }

    /*
     * ============================================================
     * SAFETY GUARD
     * ============================================================
     *
     * Jangan pernah fallback ke global X_CONNECT_CDP_URL.
     */

    if (!cdpUrl && !storageStatePath) {
      const output = JSON.stringify(
        {
          action: "X_CONNECT",
          status: "BLOCKED",
          accountId,
          accountName: task.accountName,
          expectedTwitterHandle,
          targetUrl: task.targetUrl,
          reason: "ACCOUNT_X_SESSION_NOT_CONFIGURED",
          requiredEnvironmentVariables: [
            accountCdpEnvKey,
            accountStorageEnvKey,
          ],
          message:
            `Browser session X untuk account #${accountId} belum dikonfigurasi. ` +
            `Task sengaja tidak menggunakan X_CONNECT_CDP_URL global ` +
            `agar session account lain tidak ikut terpakai.`,
        },
        null,
        2,
      );

      this.taskManager.saveTaskProof(databaseTaskId, output);

      console.log(
        `🛑 [TaskExecutor] X_CONNECT BLOCKED: session account #${accountId} belum dikonfigurasi.`,
      );

      return {
        output,
        status: "IN_PROGRESS",
      };
    }

    const browser = new BrowserExecutor({
      headless: cdpUrl ? false : true,
      timeoutMs: 30000,
      connectOverCDPUrl: cdpUrl ?? undefined,
      storageStatePath:
        !cdpUrl && storageStatePath ? storageStatePath : undefined,
    });

    try {
      await browser.start();

      console.log(
        `🌐 [TaskExecutor] X_CONNECT browser started untuk account #${accountId}.`,
      );

      const initialPages = browser.getOpenPages();

      console.log(
        `📄 [TaskExecutor] Existing browser pages: ${initialPages.length}`,
      );

      const result = await browser.open(task.targetUrl);

      console.log(`🌐 [TaskExecutor] X_CONNECT opened: ${result.url}`);

      let page = browser.getActivePage();

      const initialUrl = page.url();

      console.log(`🔗 [TaskExecutor] X_CONNECT initial URL: ${initialUrl}`);

      const bodyTextBefore = (result.text ?? "").replace(/\s+/g, " ").trim();

      const hasConnectInstruction =
        /sign\s*in\s*with\s*x|connect\s+with\s*x|continue\s+with\s*x|login\s+with\s*x|log\s*in\s*with\s*x/i.test(
          bodyTextBefore,
        );

      const connectButton = page
        .getByRole("button", {
          name: /sign\s*in\s*with\s*x|connect\s+with\s*x|continue\s+with\s*x|login\s+with\s*x|log\s*in\s*with\s*x/i,
        })
        .first();

      const connectLink = page
        .getByRole("link", {
          name: /sign\s*in\s*with\s*x|connect\s+with\s*x|continue\s+with\s*x|login\s+with\s*x|log\s*in\s*with\s*x/i,
        })
        .first();

      let clicked = false;

      if (await connectButton.count()) {
        console.log(`🖱️ [TaskExecutor] X_CONNECT menemukan button.`);

        await connectButton.click();

        clicked = true;
      } else if (await connectLink.count()) {
        console.log(`🖱️ [TaskExecutor] X_CONNECT menemukan link.`);

        await connectLink.click();

        clicked = true;
      } else if (/\/auth\/x\/start/i.test(initialUrl)) {
        console.log(
          `➡️ [TaskExecutor] X_CONNECT sudah berada di OAuth start endpoint.`,
        );

        clicked = true;
      }

      const isXOAuthUrl =
        /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/i\/oauth2\/authorize/i.test(
          initialUrl,
        ) || /\/oauth2\/authorize(?:[/?#]|$)/i.test(initialUrl);

      if (isXOAuthUrl) {
        console.log(
          `🔐 [TaskExecutor] X_CONNECT OAuth authorization page terdeteksi langsung.`,
        );

        console.log(
          `👤 [TaskExecutor] OAuth account scope → #${accountId} / ${task.accountName}`,
        );

        console.log(
          `🎯 [TaskExecutor] Expected X identity → ${expectedTwitterHandle}`,
        );

        console.log(
          `⏳ [TaskExecutor] X_CONNECT menunggu authorization manual dan callback project.`,
        );

        clicked = true;
      }

      if (!clicked && !hasConnectInstruction) {
        const currentUrl = await browser.getCurrentUrl();

        const output = JSON.stringify(
          {
            action: "X_CONNECT",
            status: "BLOCKED",
            accountId,
            accountName: task.accountName,
            expectedTwitterHandle,
            targetUrl: task.targetUrl,
            currentUrl,
            message:
              "Halaman tidak menampilkan tombol/link Connect with X, tidak berada pada OAuth start endpoint, dan bukan halaman OAuth authorization X.",
          },
          null,
          2,
        );

        this.taskManager.saveTaskProof(databaseTaskId, output);

        return {
          output,
          status: "IN_PROGRESS",
        };
      }

      const pollIntervalMs = 1000;

      const maxWaitMs = 30000;

      const startedWaitingAt = Date.now();

      let lastUrl = "";

      console.log(
        `⏳ [TaskExecutor] X_CONNECT menunggu OAuth callback maksimal ${
          maxWaitMs / 1000
        }s...`,
      );

      while (Date.now() - startedWaitingAt < maxWaitMs) {
        const pages = browser.getOpenPages();

        const candidatePages = pages.length > 0 ? pages : [page];

        for (const candidatePage of candidatePages) {
          try {
            const candidateUrl = candidatePage.url();

            const isProjectCallback = /\/auth\/x\/callback(?:[/?#]|$)/i.test(
              candidateUrl,
            );

            if (isProjectCallback) {
              page = candidatePage;

              browser.usePage(candidatePage);

              const title = await page.title().catch(() => "");

              const bodyText = (
                await page
                  .locator("body")
                  .innerText()
                  .catch(() => "")
              )
                .replace(/\s+/g, " ")
                .trim();

              console.log(
                `✅ [TaskExecutor] X_CONNECT OAuth callback terdeteksi.`,
              );

              console.log(
                `🔎 [TaskExecutor] Memverifikasi identity X account #${accountId}...`,
              );

              const identity = await this.verifyXIdentity(
                page,
                expectedTwitterHandle,
              );

              const output = JSON.stringify(
                {
                  action: "X_CONNECT",
                  status: identity.verified ? "CONNECTED" : "IDENTITY_MISMATCH",
                  accountId,
                  accountName: task.accountName,
                  expectedTwitterHandle: identity.expectedHandle,
                  detectedTwitterHandle: identity.detectedHandle,
                  identityVerified: identity.verified,
                  identitySource: identity.source,
                  targetUrl: task.targetUrl,
                  callbackUrl: candidateUrl,
                  title,
                  message: identity.message,
                  callbackDetected: true,
                  callbackBodyPreview: bodyText.slice(0, 1000),
                },
                null,
                2,
              );

              this.taskManager.saveTaskProof(databaseTaskId, output);

              if (!identity.verified) {
                console.error(
                  `❌ [TaskExecutor] X identity verification FAILED untuk account #${accountId}.`,
                );

                console.error(identity.message);

                return {
                  output,
                  status: "FAILED",
                };
              }

              console.log(
                `👤 [TaskExecutor] Verified X account → #${accountId} / ${identity.detectedHandle}`,
              );

              console.log(`🔗 [TaskExecutor] Callback URL: ${candidateUrl}`);

              return {
                output,
                status: "DONE",
              };
            }

            let targetOrigin: string | null = null;

            let currentOrigin: string | null = null;

            try {
              targetOrigin = new URL(task.targetUrl).origin;

              currentOrigin = new URL(candidateUrl).origin;
            } catch {
              // Ignore malformed URL.
            }

            const returnedToProject =
              targetOrigin !== null &&
              currentOrigin !== null &&
              currentOrigin === targetOrigin &&
              !/\/auth\/x\/start/i.test(candidateUrl);

            if (returnedToProject && (clicked || isXOAuthUrl)) {
              page = candidatePage;

              browser.usePage(candidatePage);

              const title = await page.title().catch(() => "");

              const bodyText = (
                await page
                  .locator("body")
                  .innerText()
                  .catch(() => "")
              )
                .replace(/\s+/g, " ")
                .trim();

              console.log(
                `🔎 [TaskExecutor] Project kembali. Memverifikasi identity X account #${accountId}...`,
              );

              const identity = await this.verifyXIdentity(
                page,
                expectedTwitterHandle,
              );

              const output = JSON.stringify(
                {
                  action: "X_CONNECT",
                  status: identity.verified ? "CONNECTED" : "IDENTITY_MISMATCH",
                  accountId,
                  accountName: task.accountName,
                  expectedTwitterHandle: identity.expectedHandle,
                  detectedTwitterHandle: identity.detectedHandle,
                  identityVerified: identity.verified,
                  identitySource: identity.source,
                  targetUrl: task.targetUrl,
                  currentUrl: candidateUrl,
                  title,
                  message: identity.message,
                  callbackDetected: false,
                  projectOriginDetected: true,
                  bodyPreview: bodyText.slice(0, 1000),
                },
                null,
                2,
              );

              this.taskManager.saveTaskProof(databaseTaskId, output);

              if (!identity.verified) {
                console.error(
                  `❌ [TaskExecutor] X identity verification FAILED untuk account #${accountId}.`,
                );

                console.error(identity.message);

                return {
                  output,
                  status: "FAILED",
                };
              }

              console.log(
                `✅ [TaskExecutor] X_CONNECT kembali ke domain project.`,
              );

              console.log(
                `👤 [TaskExecutor] Verified X account → #${accountId} / ${identity.detectedHandle}`,
              );

              console.log(`🔗 [TaskExecutor] Project URL: ${candidateUrl}`);

              return {
                output,
                status: "DONE",
              };
            }

            if (candidateUrl !== lastUrl) {
              console.log(
                `🔗 [TaskExecutor] X_CONNECT URL berubah: ${candidateUrl}`,
              );

              lastUrl = candidateUrl;
            }

            const isXDomain =
              /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)(?:\/|$)/i.test(
                candidateUrl,
              );

            if (isXDomain) {
              console.log(
                `🔐 [TaskExecutor] X_CONNECT masih berada di X. Menunggu authorization...`,
              );
            }
          } catch (error) {
            console.warn(
              `⚠️ [TaskExecutor] Gagal membaca browser page saat polling: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }

        try {
          page = browser.getActivePage();

          browser.usePage(page);

          await page
            .waitForLoadState("domcontentloaded")
            .catch(() => undefined);

          await page.waitForTimeout(pollIntervalMs);
        } catch {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
      }

      const activePage = browser.getActivePage();

      const currentUrl = await browser.getCurrentUrl();

      const title = await activePage.title().catch(() => "");

      const output = JSON.stringify(
        {
          action: "X_CONNECT",
          status: "IN_PROGRESS",
          accountId,
          accountName: task.accountName,
          expectedTwitterHandle,
          targetUrl: task.targetUrl,
          currentUrl,
          title,
          message:
            "OAuth belum selesai dalam waktu tunggu. Selesaikan authorization secara manual pada browser session account ini lalu jalankan task X_CONNECT kembali.",
          callbackDetected: false,
          timeoutMs: maxWaitMs,
        },
        null,
        2,
      );

      this.taskManager.saveTaskProof(databaseTaskId, output);

      console.log(`⏸️ [TaskExecutor] X_CONNECT timeout menunggu callback.`);

      return {
        output,
        status: "IN_PROGRESS",
      };
    } finally {
      if (cdpUrl) {
        console.log(
          `🌐 [TaskExecutor] X_CONNECT menggunakan external CDP browser account #${accountId}; browser tidak ditutup.`,
        );
      } else {
        await browser.close();
      }
    }
  }

  /**
   * Verify bahwa browser X yang digunakan memang login
   * sebagai account yang diharapkan.
   */
  private async verifyXIdentity(
    page: import("playwright").Page,
    expectedHandle: string,
  ): Promise<XIdentityVerificationResult> {
    const normalizedExpected = this.normalizeTwitterHandle(expectedHandle);

    if (!normalizedExpected) {
      return {
        verified: false,
        expectedHandle,
        detectedHandle: null,
        source: null,
        message:
          "Expected Twitter/X handle kosong. Identity verification dihentikan.",
      };
    }

    console.log(`🔎 [XIdentity] Expected identity → @${normalizedExpected}`);

    try {
      await page.goto("https://x.com/home", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      await page.waitForTimeout(1500);
    } catch (error) {
      console.warn(
        `⚠️ [XIdentity] Tidak bisa membuka X home: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    try {
      const profileLink = page.locator(
        'a[data-testid="AppTabBar_Profile_Link"]',
      );

      if ((await profileLink.count()) > 0) {
        const href = await profileLink.first().getAttribute("href");

        const detected = this.extractTwitterHandleFromHref(href);

        if (detected) {
          console.log(`🔎 [XIdentity] Profile link detected → @${detected}`);

          if (detected === normalizedExpected) {
            return {
              verified: true,
              expectedHandle,
              detectedHandle: `@${detected}`,
              source: "AppTabBar_Profile_Link",
              message: `Identity X terverifikasi. Browser session account ini login sebagai @${detected}.`,
            };
          }

          return {
            verified: false,
            expectedHandle,
            detectedHandle: `@${detected}`,
            source: "AppTabBar_Profile_Link",
            message: `Identity mismatch. Account "${expectedHandle}" mengharapkan @${normalizedExpected}, tetapi browser session terdeteksi sebagai @${detected}.`,
          };
        }
      }
    } catch (error) {
      console.warn(
        `⚠️ [XIdentity] Strategy 1 gagal: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    try {
      const profileCandidates = await page
        .locator("a[href]")
        .evaluateAll((elements) =>
          elements
            .map((element) => {
              const anchor = element as {
                getAttribute: (name: string) => string | null;

                innerText?: string;

                textContent?: string | null;
              };

              return {
                href: anchor.getAttribute("href") ?? "",

                text: anchor.innerText ?? anchor.textContent ?? "",
              };
            })
            .filter((item) => item.href),
        );

      const handles = new Set<string>();

      for (const candidate of profileCandidates) {
        const detected = this.extractTwitterHandleFromHref(candidate.href);

        if (detected) {
          handles.add(detected);
        }
      }

      console.log(
        `🔎 [XIdentity] Profile candidates detected: ${handles.size}`,
      );

      if (handles.has(normalizedExpected)) {
        return {
          verified: true,
          expectedHandle,
          detectedHandle: `@${normalizedExpected}`,
          source: "X_profile_link_candidate",
          message: `Identity X terverifikasi. Browser session account ini cocok dengan @${normalizedExpected}.`,
        };
      }

      const handleList = Array.from(handles).slice(0, 20);

      if (handleList.length > 0) {
        return {
          verified: false,
          expectedHandle,
          detectedHandle: handleList.length === 1 ? `@${handleList[0]}` : null,
          source: "X_profile_link_candidate",
          message: `Identity X tidak dapat diverifikasi sebagai @${normalizedExpected}. Profile candidates yang ditemukan: ${handleList
            .map((handle) => `@${handle}`)
            .join(", ")}.`,
        };
      }
    } catch (error) {
      console.warn(
        `⚠️ [XIdentity] Strategy 2 gagal: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    try {
      const currentUrl = page.url();

      const detected = this.extractTwitterHandleFromHref(currentUrl);

      if (detected && detected === normalizedExpected) {
        return {
          verified: true,
          expectedHandle,
          detectedHandle: `@${detected}`,
          source: "current_X_profile_url",
          message: `Identity X terverifikasi dari current profile URL sebagai @${detected}.`,
        };
      }
    } catch {
      // Ignore URL parsing errors.
    }

    return {
      verified: false,
      expectedHandle,
      detectedHandle: null,
      source: null,
      message: `Identity X untuk @${normalizedExpected} tidak dapat diverifikasi dengan aman dari browser session. Task dihentikan agar session account lain tidak pernah dianggap sebagai account ini.`,
    };
  }

  private normalizeTwitterHandle(handle: string): string {
    return handle.trim().replace(/^@+/, "").replace(/\s+/g, "").toLowerCase();
  }

  private extractTwitterHandleFromHref(href: string | null): string | null {
    if (!href) {
      return null;
    }

    let pathname = "";

    try {
      const url = new URL(href, "https://x.com");

      if (
        url.hostname !== "x.com" &&
        url.hostname !== "www.x.com" &&
        url.hostname !== "twitter.com" &&
        url.hostname !== "www.twitter.com"
      ) {
        return null;
      }

      pathname = url.pathname;
    } catch {
      return null;
    }

    const parts = pathname.split("/").filter(Boolean);

    if (parts.length !== 1) {
      return null;
    }

    const reservedRoutes = new Set([
      "home",
      "explore",
      "notifications",
      "messages",
      "bookmarks",
      "lists",
      "communities",
      "settings",
      "compose",
      "search",
      "i",
      "intent",
      "login",
      "signup",
      "tos",
      "privacy",
      "account",
      "premium",
      "jobs",
      "download",
      "hashtag",
      "share",
      "about",
    ]);

    const handle = parts[0].trim();

    if (!handle) {
      return null;
    }

    if (reservedRoutes.has(handle.toLowerCase())) {
      return null;
    }

    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
      return null;
    }

    return handle.toLowerCase();
  }

  /**
   * X action tidak langsung dianggap DONE.
   *
   * Action X harus berhasil terlebih dahulu, kemudian
   * TaskPlan.sourceUrl dipakai sebagai halaman verifikasi
   * checklist whitelist/project.
   */
  private async executeXAction(
    task: PlannedTask,
    databaseTaskId: number,
    plan?: TaskPlan,
  ): Promise<TaskActionResult> {
    console.log(`𝕏 [TaskExecutor] Routing ${task.taskType} → XActionExecutor`);

    const result: XActionResult = await this.xActionExecutor.execute(task);

    if (!result.success) {
      throw new Error(result.output ?? `X action ${task.taskType} gagal.`);
    }

    const actionOutput = result.output ?? null;

    /*
     * X action berhasil secara teknis.
     *
     * Tetapi itu belum membuktikan whitelist checklist
     * sudah selesai.
     */

    if (!plan?.sourceUrl) {
      const output = JSON.stringify(
        {
          action: "X_ACTION",
          taskType: task.taskType,
          actionSuccess: true,
          whitelistVerification: "BLOCKED",
          message:
            "X action berhasil, tetapi TaskPlan.sourceUrl tidak tersedia sehingga checklist whitelist tidak dapat diverifikasi.",
          actionOutput,
        },
        null,
        2,
      );

      this.taskManager.saveTaskProof(databaseTaskId, output);

      console.log(
        `⏸️ [TaskExecutor] X action berhasil tetapi sourceUrl tidak tersedia → IN_PROGRESS.`,
      );

      return {
        output,
        status: "IN_PROGRESS",
      };
    }

    const verification = await this.verifyWhitelistChecklist(
      task,
      plan.sourceUrl,
    );

    const output = JSON.stringify(
      {
        action: "X_ACTION",
        taskType: task.taskType,
        actionSuccess: true,
        actionOutput,
        whitelistVerification: verification.status,
        whitelistVerificationOutput: verification.output,
        whitelistVerificationProof: verification.proof,
        sourceUrl: plan.sourceUrl,
      },
      null,
      2,
    );

    this.taskManager.saveTaskProof(databaseTaskId, output);

    if (verification.status === "DONE") {
      console.log(
        `✅ [TaskExecutor] X action + whitelist verification confirmed: ${task.planTaskId}`,
      );

      return {
        output,
        status: "DONE",
      };
    }

    if (verification.status === "FAILED") {
      console.log(
        `❌ [TaskExecutor] X action berhasil tetapi whitelist verification FAILED: ${task.planTaskId}`,
      );

      return {
        output,
        status: "FAILED",
      };
    }

    console.log(
      `⏸️ [TaskExecutor] X action berhasil tetapi whitelist verification belum confirmed: ${task.planTaskId}`,
    );

    return {
      output,
      status: "IN_PROGRESS",
    };
  }

  /**
   * Setelah X action selesai, buka kembali halaman project
   * dan verifikasi checklist whitelist berdasarkan evidence
   * nyata pada halaman.
   *
   * Tidak menggunakan generic success message sebagai bukti.
   */
  private async verifyWhitelistChecklist(
    task: PlannedTask,
    sourceUrl: string,
  ): Promise<{
    status: "DONE" | "IN_PROGRESS" | "FAILED";
    output: string | null;
    proof: unknown;
  }> {
    console.log(
      `🔎 [TaskExecutor] Verifying whitelist checklist → ${sourceUrl}`,
    );

    const account = this.getAccountContext(task.accountId);

    const context: AdaptiveWebExecutionContext = {
      account,
    };

    const goal = [
      `Verify the whitelist/project checklist for project "${task.projectName}".`,
      `The preceding task was "${task.taskType}" for account "${task.accountName}".`,
      `A required X action has already been executed successfully.`,
      `Open the project page and inspect the actual current checklist state.`,
      `Verify whether the checklist item related to the preceding X action is visibly completed.`,
      `Accept completion only when there is explicit evidence such as a checked checkbox, aria-checked=true, aria-pressed=true, a disabled/completed control, or clear visible completion state directly associated with the required task.`,
      `A generic success message, toast, redirect, page load, or absence of an error is NOT sufficient evidence.`,
      `If the checklist is clearly completed, return DONE.`,
      `If the checklist is clearly not completed, return BLOCKED.`,
      `If the checklist state is ambiguous or cannot be verified reliably, return BLOCKED.`,
      `Do not perform unrelated tasks.`,
      `Do not bypass CAPTCHA, anti-bot systems, rate limits, authentication restrictions, or security controls.`,
      `Do not use private keys.`,
      `Do not sign wallet messages or transactions.`,
    ].join("\n");

    try {
      const result = await this.adaptiveWebExecutor.execute(
        sourceUrl,
        goal,
        context,
      );

      const proof = result.proof;

      if (result.status === "BLOCKED") {
        return {
          status: "IN_PROGRESS",
          output: result.output,
          proof,
        };
      }

      if (result.status === "FAILED" || !result.success) {
        return {
          status: "FAILED",
          output: result.output,
          proof,
        };
      }

      return {
        status: "DONE",
        output: result.output,
        proof,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        status: "FAILED",
        output: message,
        proof: {
          status: "FAILED",
          message,
        },
      };
    }
  }

  private async executeOpenPage(task: PlannedTask): Promise<TaskActionResult> {
    if (!task.targetUrl) {
      throw new Error(`Task ${task.planTaskId} membutuhkan targetUrl.`);
    }

    console.log(`🌐 [TaskExecutor] OPEN_PAGE → ${task.targetUrl}`);

    const browser = new BrowserExecutor({
      headless: true,
    });

    try {
      await browser.start();

      const result = await browser.open(task.targetUrl);

      return {
        output: JSON.stringify(
          {
            url: result.url,
            title: result.title,
            text: result.text.slice(0, 4000),
          },
          null,
          2,
        ),
        status: "DONE",
      };
    } finally {
      await browser.close();
    }
  }

  private async executeFormTask(
    task: PlannedTask,
    databaseTaskId: number,
  ): Promise<TaskActionResult> {
    if (!task.form) {
      throw new Error(
        `Task ${task.planTaskId} adalah form task tetapi konfigurasi form tidak tersedia.`,
      );
    }

    if (!task.form.targetUrl) {
      throw new Error(`Task ${task.planTaskId} membutuhkan target URL form.`);
    }

    console.log(`📝 [TaskExecutor] Form task → ${task.form.targetUrl}`);

    const injectedFormExecutor = this.formExecutor;

    if (injectedFormExecutor) {
      console.log("🧪 [TaskExecutor] Using injected FormExecutor.");

      const inspection = await injectedFormExecutor.inspectForm(task.form);

      console.log(
        `🔎 [TaskExecutor] Form inspected (${inspection.length} chars).`,
      );

      const formResult = await injectedFormExecutor.fillForm(task.form);

      return this.handleFormExecutionResult(task, databaseTaskId, formResult);
    }

    const browser = new BrowserExecutor({
      headless: true,
    });

    try {
      await browser.start();

      const formExecutor = new FormExecutor(browser);

      const inspection = await formExecutor.inspectForm(task.form);

      console.log(
        `🔎 [TaskExecutor] Form inspected (${inspection.length} chars).`,
      );

      const formResult = await formExecutor.fillForm(task.form);

      return this.handleFormExecutionResult(task, databaseTaskId, formResult);
    } finally {
      await browser.close();
    }
  }

  private async executeWalletFormTask(
    task: PlannedTask,
    databaseTaskId: number,
  ): Promise<TaskActionResult> {
    if (!task.form) {
      throw new Error(
        `Task ${task.planTaskId} adalah FORM_WALLET tetapi konfigurasi form tidak tersedia.`,
      );
    }

    if (!task.form.targetUrl) {
      throw new Error(
        `Task ${task.planTaskId} membutuhkan target URL wallet form.`,
      );
    }

    const account = this.getAccountContext(task.accountId);

    if (!account.walletAddress) {
      throw new Error(
        `Account "${account.accountName}" belum memiliki wallet address.`,
      );
    }

    console.log(`🔐 [TaskExecutor] FORM_WALLET → ${task.form.targetUrl}`);

    console.log(
      `👤 [TaskExecutor] Wallet account → ${account.accountName} / ${account.walletAddress}`,
    );

    const walletCdpUrl = process.env.WALLET_CDP_URL ?? "http://127.0.0.1:9223";

    const browser = new BrowserExecutor({
      headless: false,
      timeoutMs: 30000,
      connectOverCDPUrl: walletCdpUrl,
    });

    try {
      await browser.start();

      const walletFormExecutor = new WalletFormExecutor(browser);

      await browser.open(task.form.targetUrl);

      const form = await walletFormExecutor.inspect();

      const detection = walletFormExecutor.detectWalletRequirement(form);

      console.log(`🔎 [TaskExecutor] Wallet form mode → ${detection.mode}`);

      const result = await walletFormExecutor.execute({
        accountId: account.accountId,
        accountName: account.accountName,
        walletAddress: account.walletAddress,
      });

      return this.handleWalletFormExecutionResult(task, databaseTaskId, result);
    } finally {
      await browser.close();
    }
  }

  private handleFormExecutionResult(
    task: PlannedTask,
    databaseTaskId: number,
    formResult: Awaited<ReturnType<FormExecutor["fillForm"]>>,
  ): TaskActionResult {
    const proofJson = JSON.stringify(formResult.proof, null, 2);

    this.taskManager.saveTaskProof(databaseTaskId, proofJson);

    console.log(
      `💾 [TaskExecutor] Form execution proof tersimpan untuk task #${databaseTaskId}.`,
    );

    const output = JSON.stringify(
      {
        action: "FORM",
        taskId: databaseTaskId,
        formType: task.form?.formType,
        targetUrl: task.form?.targetUrl,
        fieldsConfigured: task.form?.fields.length ?? 0,
        checkboxesConfigured: task.form?.checkboxes.length ?? 0,
        fieldsFilled: formResult.fieldsFilled,
        checkboxesChecked: formResult.checkboxesChecked,
        submitAttempted: formResult.submitAttempted,
        submitSucceeded: formResult.submitSucceeded,
        executionStatus: formResult.proof.executionStatus,
        message: formResult.message,
        proof: formResult.proof,
      },
      null,
      2,
    );

    switch (formResult.proof.executionStatus) {
      case "READY_TO_SUBMIT":
        console.log(
          `⏸️ [TaskExecutor] Form siap submit, task tetap IN_PROGRESS: ${task.planTaskId}`,
        );

        return {
          output,
          status: "IN_PROGRESS",
        };

      case "SUBMITTED":
        console.log(
          `✅ [TaskExecutor] Form submit berhasil: ${task.planTaskId}`,
        );

        return {
          output,
          status: "DONE",
        };

      case "FAILED":
        console.log(
          `❌ [TaskExecutor] Form execution FAILED: ${task.planTaskId}`,
        );

        return {
          output,
          status: "FAILED",
        };

      default:
        throw new Error(
          `Execution proof status "${formResult.proof.executionStatus}" tidak dikenali.`,
        );
    }
  }

  private handleWalletFormExecutionResult(
    task: PlannedTask,
    databaseTaskId: number,
    result: WalletFormExecutionResult,
  ): TaskActionResult {
    const output = JSON.stringify(
      {
        action: "FORM_WALLET",
        taskId: databaseTaskId,
        projectName: task.projectName,
        accountName: task.accountName,
        targetUrl: task.form?.targetUrl ?? null,
        mode: result.mode,
        success: result.success,
        connected: result.connected,
        walletAddressFilled: result.walletAddressFilled,
        walletVerification: result.walletVerification,
        rabbyConnection: result.rabbyConnection,
        message: result.message,
      },
      null,
      2,
    );

    this.taskManager.saveTaskProof(databaseTaskId, output);

    console.log(
      `💾 [TaskExecutor] Wallet form proof tersimpan untuk task #${databaseTaskId}.`,
    );

    if (result.success) {
      console.log(`✅ [TaskExecutor] Wallet form berhasil: ${task.planTaskId}`);

      return {
        output,
        status: "DONE",
      };
    }

    console.log(
      `⏸️ [TaskExecutor] Wallet form belum selesai: ${task.planTaskId}`,
    );

    return {
      output,
      status: "IN_PROGRESS",
    };
  }

  private async executeWhitelistTask(
    task: PlannedTask,
    databaseTaskId: number,
  ): Promise<TaskActionResult> {
    if (!task.targetUrl && !task.form?.targetUrl) {
      throw new Error(
        `Task ${task.planTaskId} membutuhkan target URL untuk adaptive web execution.`,
      );
    }

    const targetUrl = task.targetUrl ?? task.form?.targetUrl ?? null;

    if (!targetUrl) {
      throw new Error(`Task ${task.planTaskId} tidak memiliki target URL.`);
    }

    console.log(
      `🧠 [TaskExecutor] WHITELIST → AdaptiveWebExecutor → ${targetUrl}`,
    );

    const account = this.getAccountContext(task.accountId);

    const context: AdaptiveWebExecutionContext = {
      account,
    };

    const goal = [
      `Complete the whitelist/project task for project "${task.projectName}".`,
      `Task description: ${task.description}`,
      `Use the provided account context when the page requires account-specific information.`,
      `Inspect the actual page and determine the next safe action from the current page state.`,
      `Complete the normal public task flow when possible.`,
      `Do not bypass CAPTCHA, anti-bot systems, rate limits, authentication restrictions, or security controls.`,
      `Do not use private keys.`,
      `Do not sign wallet messages or transactions.`,
      `If authentication, wallet connection, wallet signing, or manual approval is required, stop and report BLOCKED.`,
      `When the page clearly confirms completion, stop with DONE.`,
    ].join("\n");

    const result = await this.adaptiveWebExecutor.execute(
      targetUrl,
      goal,
      context,
    );

    const proofJson = JSON.stringify(result.proof, null, 2);

    this.taskManager.saveTaskProof(databaseTaskId, proofJson);

    console.log(
      `💾 [TaskExecutor] Adaptive web proof tersimpan untuk task #${databaseTaskId}.`,
    );

    const output = JSON.stringify(
      {
        action: "ADAPTIVE_WEB",
        taskId: databaseTaskId,
        projectName: task.projectName,
        accountName: task.accountName,
        targetUrl,
        success: result.success,
        status: result.status,
        message: result.output,
        steps: result.steps,
        finalUrl: result.finalUrl,
        proof: result.proof,
      },
      null,
      2,
    );

    if (result.status === "BLOCKED") {
      return {
        output,
        status: "IN_PROGRESS",
      };
    }

    if (!result.success || result.status === "FAILED") {
      return {
        output,
        status: "FAILED",
      };
    }

    return {
      output,
      status: "DONE",
    };
  }

  private async executeCustomTask(
    task: PlannedTask,
  ): Promise<TaskActionResult> {
    console.log(`🔧 [TaskExecutor] CUSTOM task: ${task.description}`);

    return {
      output: JSON.stringify(
        {
          action: "CUSTOM",
          description: task.description,
          targetUrl: task.targetUrl ?? null,
        },
        null,
        2,
      ),
      status: "DONE",
    };
  }

  private createDefaultAdaptiveWebExecutor(): AdaptiveWebExecutor {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY belum tersedia untuk AdaptiveWebExecutor.",
      );
    }

    const llm = new GeminiProvider(
      apiKey,
      process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
    );

    const browser = new BrowserExecutor({
      headless: true,
      timeoutMs: 30000,
    });

    return new AdaptiveWebExecutor(llm, browser, {
      maxSteps: 12,
    });
  }

  private getAccountContext(
    accountId: number,
  ): NonNullable<AdaptiveWebExecutionContext["account"]> {
    const account = this.database
      .getDb()
      .prepare(
        `
        SELECT
          id,
          name,
          twitter_handle,
          wallet_address
        FROM accounts
        WHERE id = ?
          AND status = 'ACTIVE'
        LIMIT 1
        `,
      )
      .get(accountId) as
      | {
          id: number;
          name: string;
          twitter_handle: string | null;
          wallet_address: string | null;
        }
      | undefined;

    if (!account) {
      throw new Error(
        `Account #${accountId} tidak ditemukan atau tidak ACTIVE.`,
      );
    }

    return {
      accountId: account.id,
      accountName: account.name,
      twitterHandle: account.twitter_handle,
      walletAddress: account.wallet_address,
    };
  }

  private createDatabaseTask(task: PlannedTask): number {
    const projectStmt = this.database.getDb().prepare(
      `
        SELECT id
        FROM projects
        WHERE name = ?
        ORDER BY id ASC
        LIMIT 1
        `,
    );

    const project = projectStmt.get(task.projectName) as
      | {
          id: number;
        }
      | undefined;

    if (!project) {
      throw new Error(
        `Project "${task.projectName}" tidak ditemukan di database.`,
      );
    }

    const stmt = this.database.getDb().prepare(
      `
        INSERT INTO tasks (
          project_id,
          account_id,
          task_type,
          target_url,
          description,
          status
        )
        VALUES (?, ?, ?, ?, ?, 'PENDING')
        `,
    );

    const result = stmt.run(
      project.id,
      task.accountId,
      task.taskType,
      task.targetUrl ?? task.form?.targetUrl ?? null,
      task.description,
    );

    return Number(result.lastInsertRowid);
  }

  private checkDependencies(
    task: PlannedTask,
    completedPlanTaskIds: Set<string>,
  ): {
    ok: boolean;
    reason?: string;
  } {
    if (!task.dependsOn || task.dependsOn.length === 0) {
      return {
        ok: true,
      };
    }

    const missing = task.dependsOn.filter(
      (dependency) => !completedPlanTaskIds.has(dependency),
    );

    if (missing.length > 0) {
      return {
        ok: false,
        reason: `Dependency belum selesai: ${missing.join(", ")}`,
      };
    }

    return {
      ok: true,
    };
  }

  private isXAction(taskType: string): boolean {
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
