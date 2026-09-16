import { AgentDatabase } from "../database/agent-database.js";

import {
  TaskPlanner,
  type TaskPlan,
  type TaskPlannerInput,
} from "../tasks/task-planner.js";

import {
  TaskExecutor,
  type TaskExecutionReport,
} from "../tasks/task-executor.js";

export interface ProjectTaskWorkflowResult {
  plan: TaskPlan;
  report: TaskExecutionReport;
}

export interface ProjectTaskWorkflowExecutor {
  executePlan(plan: TaskPlan): Promise<TaskExecutionReport>;
}

export class ProjectTaskWorkflow {
  private readonly planner: TaskPlanner;

  private readonly executor: ProjectTaskWorkflowExecutor;

  constructor(
    private readonly database: AgentDatabase,
    planner?: TaskPlanner,
    executor?: ProjectTaskWorkflowExecutor,
  ) {
    this.planner = planner ?? new TaskPlanner(database);
    this.executor = executor ?? new TaskExecutor(database);
  }

  createPlan(input: TaskPlannerInput): TaskPlan {
    this.validateProject(input.projectName);

    return this.planner.createPlan(input);
  }

  async executePlan(
    plan: TaskPlan,
    accountId?: number,
  ): Promise<TaskExecutionReport> {
    this.validatePlan(plan);

    const executionPlan = this.filterPlanByAccount(plan, accountId);

    this.validatePlan(executionPlan);

    console.log(
      accountId !== undefined
        ? `🎯 [ProjectTaskWorkflow] Execution scope → account #${accountId}`
        : `🎯 [ProjectTaskWorkflow] Execution scope → all accounts`,
    );

    console.log(
      `📋 [ProjectTaskWorkflow] Tasks to execute: ${executionPlan.tasks.length}`,
    );

    return this.executor.executePlan(executionPlan);
  }

  async run(input: TaskPlannerInput): Promise<ProjectTaskWorkflowResult> {
    const plan = this.createPlan(input);

    const report = await this.executePlan(plan);

    return {
      plan,
      report,
    };
  }

  private filterPlanByAccount(plan: TaskPlan, accountId?: number): TaskPlan {
    if (accountId === undefined) {
      return plan;
    }

    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new Error("accountId wajib berupa angka integer positif.");
    }

    const filteredTasks = plan.tasks.filter(
      (task) => task.accountId === accountId,
    );

    if (filteredTasks.length === 0) {
      throw new Error(
        `Task plan untuk project "${plan.projectName}" tidak memiliki task untuk account #${accountId}.`,
      );
    }

    /**
     * Karena execution scope hanya menjalankan satu account,
     * semua dependency yang berasal dari account lain harus
     * dianggap tidak relevan.
     *
     * Namun dependency antar-task dalam account yang sama
     * tetap dipertahankan.
     */
    const filteredTaskIds = new Set(
      filteredTasks.map((task) => task.planTaskId),
    );

    const scopedTasks = filteredTasks.map((task) => ({
      ...task,
      dependsOn: (task.dependsOn ?? []).filter((dependency) =>
        filteredTaskIds.has(dependency),
      ),
    }));

    return {
      ...plan,
      accountCount: 1,
      taskCount: scopedTasks.length,
      tasks: scopedTasks,
    };
  }

  private validateProject(projectName: string): void {
    const normalizedName = projectName.trim();

    if (!normalizedName) {
      throw new Error("Nama project wajib diisi.");
    }

    const project = this.database
      .getDb()
      .prepare(
        `
          SELECT id
          FROM projects
          WHERE name = ?
          ORDER BY id ASC
          LIMIT 1
        `,
      )
      .get(normalizedName) as { id: number } | undefined;

    if (!project) {
      throw new Error(
        `Project "${normalizedName}" tidak ditemukan di database.`,
      );
    }
  }

  private validatePlan(plan: TaskPlan): void {
    if (!plan) {
      throw new Error("Task plan wajib tersedia.");
    }

    if (!plan.projectName?.trim()) {
      throw new Error("Task plan tidak memiliki nama project.");
    }

    if (!Array.isArray(plan.tasks)) {
      throw new Error("Task plan memiliki daftar task yang tidak valid.");
    }

    if (plan.taskCount !== plan.tasks.length) {
      throw new Error(
        `Task plan tidak konsisten: taskCount=${plan.taskCount}, actual=${plan.tasks.length}.`,
      );
    }

    if (plan.accountCount <= 0) {
      throw new Error("Task plan tidak memiliki account.");
    }

    if (plan.tasks.length === 0) {
      throw new Error("Task plan tidak memiliki task untuk dieksekusi.");
    }
  }
}
