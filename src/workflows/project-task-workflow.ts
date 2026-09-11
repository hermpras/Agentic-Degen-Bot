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
  executePlan(tasks: TaskPlan["tasks"]): Promise<TaskExecutionReport>;
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

  async executePlan(plan: TaskPlan): Promise<TaskExecutionReport> {
    this.validatePlan(plan);

    return this.executor.executePlan(plan.tasks);
  }

  async run(input: TaskPlannerInput): Promise<ProjectTaskWorkflowResult> {
    const plan = this.createPlan(input);

    const report = await this.executePlan(plan);

    return {
      plan,
      report,
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
