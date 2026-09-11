import { AccountBrowser } from "../browser/account-browser.js";
import { AgentDatabase } from "../database/agent-database.js";
import { FormExecutor } from "./form-executor.js";
import { TaskManager } from "./task-manager.js";
import { PlannedTask, TaskPlan } from "./task-planner.js";

export type TaskExecutionStatus = "DONE" | "FAILED";

export interface TaskExecutionResult {
  planTaskId: string;
  accountId: number;
  accountName: string;
  taskType: string;
  status: TaskExecutionStatus;
  output: string | null;
  error: string | null;
}

export interface TaskExecutionReport {
  projectName: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  results: TaskExecutionResult[];
}

export class TaskExecutor {
  private readonly taskManager: TaskManager;

  constructor(private readonly database: AgentDatabase) {
    this.taskManager = new TaskManager(database);
  }

  async executePlan(plan: TaskPlan): Promise<TaskExecutionReport> {
    const results: TaskExecutionResult[] = [];

    const completedTaskIds = new Set<string>();

    const completedOutputs = new Map<string, string>();

    for (const task of plan.tasks) {
      const result = await this.executeTask(
        task,
        completedTaskIds,
        completedOutputs,
      );

      results.push(result);

      if (result.status === "DONE") {
        completedTaskIds.add(task.planTaskId);

        if (result.output !== null) {
          completedOutputs.set(task.planTaskId, result.output);
        }
      }
    }

    return {
      projectName: plan.projectName,

      totalTasks: results.length,

      completedTasks: results.filter((result) => result.status === "DONE")
        .length,

      failedTasks: results.filter((result) => result.status === "FAILED")
        .length,

      results,
    };
  }

  private async executeTask(
    task: PlannedTask,
    completedTaskIds: Set<string>,
    completedOutputs: Map<string, string>,
  ): Promise<TaskExecutionResult> {
    console.log("");
    console.log(
      `▶️ [TaskExecutor] ${task.planTaskId} → ${task.taskType} → Account ${task.accountId}`,
    );

    const dependencyError = this.validateDependencies(
      task,
      completedTaskIds,
      completedOutputs,
    );

    if (dependencyError) {
      console.log(`⛔ [TaskExecutor] Dependency failed: ${dependencyError}`);

      return {
        planTaskId: task.planTaskId,

        accountId: task.accountId,

        accountName: task.accountName,

        taskType: task.taskType,

        status: "FAILED",

        output: null,

        error: dependencyError,
      };
    }

    let databaseTaskId: number | null = null;

    try {
      const databaseTask = this.taskManager.createTask({
        projectName: task.projectName,

        accountName: task.accountName,

        taskType: task.taskType,

        targetUrl: task.targetUrl,

        description: task.description,
      });

      databaseTaskId = databaseTask.id;

      this.taskManager.markTaskInProgress(databaseTaskId);

      const output = await this.executeTaskAction(task, completedOutputs);

      this.taskManager.markTaskDone(databaseTaskId, output);

      console.log(`✅ [TaskExecutor] ${task.planTaskId} completed.`);

      return {
        planTaskId: task.planTaskId,

        accountId: task.accountId,

        accountName: task.accountName,

        taskType: task.taskType,

        status: "DONE",

        output,

        error: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (databaseTaskId !== null) {
        this.taskManager.markTaskFailed(databaseTaskId, errorMessage);
      }

      console.log(
        `❌ [TaskExecutor] ${task.planTaskId} failed: ${errorMessage}`,
      );

      return {
        planTaskId: task.planTaskId,

        accountId: task.accountId,

        accountName: task.accountName,

        taskType: task.taskType,

        status: "FAILED",

        output: null,

        error: errorMessage,
      };
    }
  }

  private async executeTaskAction(
    task: PlannedTask,
    completedOutputs: Map<string, string>,
  ): Promise<string | null> {
    switch (task.taskType) {
      case "OPEN_PAGE":
        return this.executeOpenPage(task);

      case "FORM":
        return this.executeForm(task, completedOutputs);

      case "FORM_TWITTER":
      case "FORM_WALLET":
      case "FORM_SUBMIT":
        return this.executeForm(task, completedOutputs);

      case "CUSTOM":
        return this.executeCustomTask(task, completedOutputs);

      default:
        throw new Error(
          `Task type "${task.taskType}" belum memiliki executor.`,
        );
    }
  }

  private async executeOpenPage(task: PlannedTask): Promise<string> {
    if (!task.targetUrl) {
      throw new Error(`Task ${task.planTaskId} membutuhkan targetUrl.`);
    }

    const accountBrowser = new AccountBrowser(undefined, {
      headless: true,
    });

    try {
      const browser = await accountBrowser.openForAccount(task.accountId);

      const result = await browser.open(task.targetUrl);

      return JSON.stringify({
        url: result.url,
        title: result.title,
        textPreview: result.text.slice(0, 1000),
      });
    } finally {
      await accountBrowser.close();
    }
  }

  private async executeForm(
    task: PlannedTask,
    completedOutputs: Map<string, string>,
  ): Promise<string> {
    if (!task.form) {
      throw new Error(
        `Task ${task.planTaskId} bertipe ${task.taskType} tetapi form schema belum tersedia.`,
      );
    }

    const accountBrowser = new AccountBrowser(undefined, {
      headless: true,
    });

    try {
      const browser = await accountBrowser.openForAccount(task.accountId);

      const resolvedForm = this.resolveFormInputs(task, completedOutputs);

      const formExecutor = new FormExecutor(browser);

      const result = await formExecutor.fillForm(resolvedForm);

      return JSON.stringify({
        formType: result.formType,

        url: result.url,

        fieldsFilled: result.fieldsFilled,

        checkboxesChecked: result.checkboxesChecked,

        submitAttempted: result.submitAttempted,

        message: result.message,
      });
    } finally {
      await accountBrowser.close();
    }
  }

  private resolveFormInputs(
    task: PlannedTask,
    completedOutputs: Map<string, string>,
  ) {
    if (!task.form) {
      throw new Error("Form schema tidak tersedia.");
    }

    const fields = task.form.fields.map((field) => {
      if (field.type === "OWN_TWEET_URL" && task.inputFrom) {
        const output = completedOutputs.get(task.inputFrom);

        if (!output) {
          throw new Error(
            `Output ownTweetUrl dari "${task.inputFrom}" belum tersedia.`,
          );
        }

        return {
          ...field,
          value: this.extractOutputValue(output, "ownTweetUrl"),
        };
      }

      return field;
    });

    return {
      ...task.form,
      fields,
    };
  }

  private extractOutputValue(output: string, key: string): string {
    try {
      const parsed = JSON.parse(output);

      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof parsed[key] === "string"
      ) {
        return parsed[key];
      }

      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof parsed.url === "string" &&
        key === "ownTweetUrl"
      ) {
        return parsed.url;
      }
    } catch {
      // Output bukan JSON.
    }

    return output;
  }

  private async executeCustomTask(
    task: PlannedTask,
    completedOutputs: Map<string, string>,
  ): Promise<string> {
    const inputs = task.dependsOn.map((dependencyId) => ({
      dependencyId,

      output: completedOutputs.get(dependencyId) ?? null,
    }));

    return JSON.stringify({
      message: "CUSTOM task belum menjalankan browser action.",

      task: task.description,

      inputs,
    });
  }

  private validateDependencies(
    task: PlannedTask,
    completedTaskIds: Set<string>,
    completedOutputs: Map<string, string>,
  ): string | null {
    for (const dependencyId of task.dependsOn) {
      if (!completedTaskIds.has(dependencyId)) {
        return `Dependency "${dependencyId}" belum berhasil diselesaikan.`;
      }
    }

    if (task.inputFrom) {
      const output = completedOutputs.get(task.inputFrom);

      if (!output) {
        return `Output dari "${task.inputFrom}" belum tersedia.`;
      }
    }

    return null;
  }
}
