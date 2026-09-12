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
import type { PlannedTask } from "./task-planner.js";

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

  async executePlan(tasks: PlannedTask[]): Promise<TaskExecutionReport> {
    const report: TaskExecutionReport = {
      totalTasks: tasks.length,
      completedTasks: 0,
      failedTasks: 0,
      skippedTasks: 0,
      results: [],
    };

    const completedPlanTaskIds = new Set<string>();

    for (const task of tasks) {
      const result = await this.executeTask(task, completedPlanTaskIds);

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

    return report;
  }

  async executeTask(
    task: PlannedTask,
    completedPlanTaskIds = new Set<string>(),
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

      const actionResult = await this.executeTaskAction(task, databaseTaskId);

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
  ): Promise<TaskActionResult> {
    if (this.isXAction(task.taskType)) {
      return this.executeXAction(task);
    }

    switch (task.taskType) {
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

  private async executeXAction(task: PlannedTask): Promise<TaskActionResult> {
    console.log(`𝕏 [TaskExecutor] Routing ${task.taskType} → XActionExecutor`);

    const result: XActionResult = await this.xActionExecutor.execute(task);

    if (!result.success) {
      throw new Error(result.output ?? `X action ${task.taskType} gagal.`);
    }

    return {
      output: result.output ?? null,
      status: "DONE",
    };
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
      process.env.GEMINI_MODEL || "gemini-3.5-flash",
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
