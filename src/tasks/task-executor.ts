import { AgentDatabase } from "../database/agent-database.js";
import { BrowserExecutor } from "../browser/browser-executor.js";
import { TaskManager, TaskStatus } from "./task-manager.js";
import { FormExecutor } from "./form-executor.js";
import { XActionExecutor, type XActionResult } from "./x-action-executor.js";
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

export class TaskExecutor {
  private readonly taskManager: TaskManager;
  private readonly xActionExecutor: XActionExecutor;
  private readonly formExecutor?: FormExecutor;

  constructor(
    private readonly database: AgentDatabase,
    xActionExecutor?: XActionExecutor,
    formExecutor?: FormExecutor,
  ) {
    this.taskManager = new TaskManager(database);

    this.xActionExecutor = xActionExecutor ?? new XActionExecutor();

    this.formExecutor = formExecutor;
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

      const actionResult = await this.executeTaskAction(task);

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

  private async executeTaskAction(task: PlannedTask): Promise<{
    output: string | null;
  }> {
    if (this.isXAction(task.taskType)) {
      return this.executeXAction(task);
    }

    switch (task.taskType) {
      case "OPEN_PAGE":
        return this.executeOpenPage(task);

      case "FORM":
      case "FORM_TWITTER":
      case "FORM_WALLET":
      case "FORM_SUBMIT":
        return this.executeFormTask(task);

      case "WHITELIST":
        return this.executeWhitelistTask(task);

      case "CUSTOM":
        return this.executeCustomTask(task);

      default:
        throw new Error(
          `Task type "${task.taskType}" belum memiliki executor.`,
        );
    }
  }

  private async executeXAction(task: PlannedTask): Promise<{
    output: string | null;
  }> {
    console.log(`𝕏 [TaskExecutor] Routing ${task.taskType} → XActionExecutor`);

    const result: XActionResult = await this.xActionExecutor.execute(task);

    if (!result.success) {
      throw new Error(result.output ?? `X action ${task.taskType} gagal.`);
    }

    return {
      output: result.output,
    };
  }

  private async executeOpenPage(task: PlannedTask): Promise<{
    output: string | null;
  }> {
    if (!task.targetUrl) {
      throw new Error(`Task ${task.planTaskId} membutuhkan targetUrl.`);
    }

    console.log(`🌐 [TaskExecutor] OPEN_PAGE → ${task.targetUrl}`);

    const browser = new BrowserExecutor({
      headless: true,
    });

    try {
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
      };
    } finally {
      await browser.close();
    }
  }

  private async executeFormTask(task: PlannedTask): Promise<{
    output: string | null;
  }> {
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

      return {
        output: JSON.stringify(
          {
            action: "FORM",
            formType: task.form.formType,
            targetUrl: task.form.targetUrl,
            fieldsConfigured: task.form.fields.length,
            checkboxesConfigured: task.form.checkboxes.length,
            fieldsFilled: formResult.fieldsFilled,
            checkboxesChecked: formResult.checkboxesChecked,
            submitAttempted: formResult.submitAttempted,
            message: formResult.message,
          },
          null,
          2,
        ),
      };
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

      return {
        output: JSON.stringify(
          {
            action: "FORM",
            formType: task.form.formType,
            targetUrl: task.form.targetUrl,
            fieldsConfigured: task.form.fields.length,
            checkboxesConfigured: task.form.checkboxes.length,
            fieldsFilled: formResult.fieldsFilled,
            checkboxesChecked: formResult.checkboxesChecked,
            submitAttempted: formResult.submitAttempted,
            message: formResult.message,
          },
          null,
          2,
        ),
      };
    } finally {
      await browser.close();
    }
  }

  private async executeWhitelistTask(task: PlannedTask): Promise<{
    output: string | null;
  }> {
    console.log(`📝 [TaskExecutor] WHITELIST task: ${task.description}`);

    if (task.form) {
      return this.executeFormTask(task);
    }

    if (task.targetUrl) {
      return this.executeOpenPage(task);
    }

    return {
      output: JSON.stringify(
        {
          action: "WHITELIST",
          description: task.description,
          targetUrl: null,
          message:
            "Whitelist task belum memiliki form atau target URL untuk dieksekusi.",
        },
        null,
        2,
      ),
    };
  }

  private async executeCustomTask(task: PlannedTask): Promise<{
    output: string | null;
  }> {
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
    };
  }

  private createDatabaseTask(task: PlannedTask): number {
    const projectStmt = this.database.getDb().prepare(`
        SELECT id
        FROM projects
        WHERE name = ?
        ORDER BY id ASC
        LIMIT 1
      `);

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

    const stmt = this.database.getDb().prepare(`
        INSERT INTO tasks (
          project_id,
          account_id,
          task_type,
          target_url,
          description,
          status
        )
        VALUES (?, ?, ?, ?, ?, 'PENDING')
      `);

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
