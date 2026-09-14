import { AgentDatabase } from "../../database/agent-database.js";
import { ProjectTaskWorkflow } from "../../workflows/project-task-workflow.js";
import type { TaskPlan } from "../../tasks/task-planner.js";
import type { Tool } from "../tool.interface.js";

interface ExecuteProjectTaskPlanArgs {
  planId: number;
  accountId?: number;
}

export function executeProjectTaskPlanTool(database: AgentDatabase): Tool {
  const workflow = new ProjectTaskWorkflow(database);

  return {
    name: "execute_project_task_plan",

    description:
      "Mengeksekusi task plan yang SUDAH dibuat dan disimpan sebelumnya berdasarkan planId. Tool ini TIDAK membuat atau mengubah task plan. Gunakan hanya setelah user secara eksplisit meminta execution. accountId bersifat optional untuk membatasi execution ke satu account tertentu tanpa mengubah isi task plan. Tool ini memiliki approval boundary.",

    riskLevel: "APPROVAL",

    parameters: {
      type: "object",

      properties: {
        planId: {
          type: "number",
          description:
            "ID plan yang sudah dibuat oleh create_project_task_plan dan ingin dieksekusi.",
        },

        accountId: {
          type: "number",
          description:
            "Optional. Jika diisi, hanya task milik account tersebut yang akan dieksekusi. Task plan asli tidak diubah.",
        },
      },

      required: ["planId"],
    },

    async execute(args: Record<string, any>): Promise<any> {
      const input = args as ExecuteProjectTaskPlanArgs;

      if (
        input.planId === undefined ||
        input.planId === null ||
        typeof input.planId !== "number" ||
        !Number.isInteger(input.planId) ||
        input.planId <= 0
      ) {
        throw new Error("planId wajib berupa angka integer positif.");
      }

      if (
        input.accountId !== undefined &&
        input.accountId !== null &&
        (typeof input.accountId !== "number" ||
          !Number.isInteger(input.accountId) ||
          input.accountId <= 0)
      ) {
        throw new Error(
          "accountId jika diisi wajib berupa angka integer positif.",
        );
      }

      const storedPlan = database.getTaskPlan(input.planId);

      if (!storedPlan) {
        throw new Error(
          `Task plan #${input.planId} tidak ditemukan di database.`,
        );
      }

      if (storedPlan.status !== "PLANNED") {
        throw new Error(
          `Task plan #${input.planId} tidak bisa dieksekusi karena status saat ini adalah "${storedPlan.status}".`,
        );
      }

      let plan: TaskPlan;

      try {
        plan = JSON.parse(storedPlan.planJson) as TaskPlan;
      } catch {
        throw new Error(
          `Snapshot task plan #${input.planId} rusak dan tidak dapat dibaca.`,
        );
      }

      validateStoredPlan(plan, storedPlan);

      const executionScope =
        input.accountId !== undefined
          ? `account #${input.accountId}`
          : "semua account";

      console.log(
        `🚀 [execute_project_task_plan] Mengeksekusi plan #${input.planId} untuk project "${plan.projectName}" → ${executionScope}.`,
      );

      database.updateTaskPlanStatus(input.planId, "EXECUTING");

      try {
        const report = await workflow.executePlan(plan, input.accountId);

        const finalStatus = report.failedTasks > 0 ? "FAILED" : "COMPLETED";

        database.updateTaskPlanStatus(input.planId, finalStatus);

        return {
          success: report.failedTasks === 0,
          executionStarted: true,

          planId: input.planId,

          status: finalStatus,

          executionScope: {
            accountId: input.accountId ?? null,
            mode:
              input.accountId !== undefined ? "SINGLE_ACCOUNT" : "ALL_ACCOUNTS",
          },

          message:
            report.failedTasks === 0
              ? `Task plan #${input.planId} berhasil dieksekusi${
                  input.accountId !== undefined
                    ? ` untuk account #${input.accountId}`
                    : ""
                }.`
              : `Task plan #${input.planId} selesai dengan ${report.failedTasks} task gagal.`,

          projectName: plan.projectName,
          sourceUrl: plan.sourceUrl,

          accountCount: input.accountId !== undefined ? 1 : plan.accountCount,

          taskCount: report.totalTasks,

          report: {
            totalTasks: report.totalTasks,

            completedTasks: report.completedTasks,

            failedTasks: report.failedTasks,

            skippedTasks: report.skippedTasks,

            results: report.results,
          },
        };
      } catch (error) {
        database.updateTaskPlanStatus(input.planId, "FAILED");

        throw error;
      }
    },
  };
}

function validateStoredPlan(
  plan: TaskPlan,
  storedPlan: {
    projectName: string;
    sourceUrl: string;
    accountCount: number;
    taskCount: number;
  },
): void {
  if (!plan || typeof plan !== "object") {
    throw new Error("Snapshot task plan tidak valid.");
  }

  if (!plan.projectName?.trim()) {
    throw new Error("Snapshot task plan tidak memiliki projectName.");
  }

  if (!plan.sourceUrl?.trim()) {
    throw new Error("Snapshot task plan tidak memiliki sourceUrl.");
  }

  if (!Array.isArray(plan.tasks)) {
    throw new Error("Snapshot task plan memiliki tasks yang tidak valid.");
  }

  if (plan.taskCount !== plan.tasks.length) {
    throw new Error(
      `Snapshot task plan tidak konsisten: taskCount=${plan.taskCount}, actual=${plan.tasks.length}.`,
    );
  }

  if (plan.accountCount <= 0) {
    throw new Error("Snapshot task plan tidak memiliki account.");
  }

  if (plan.accountCount !== storedPlan.accountCount) {
    throw new Error(
      `Snapshot task plan tidak konsisten dengan database: accountCount=${plan.accountCount}, stored=${storedPlan.accountCount}.`,
    );
  }

  if (plan.taskCount !== storedPlan.taskCount) {
    throw new Error(
      `Snapshot task plan tidak konsisten dengan database: taskCount=${plan.taskCount}, stored=${storedPlan.taskCount}.`,
    );
  }

  if (plan.projectName !== storedPlan.projectName) {
    throw new Error(
      `Snapshot task plan tidak konsisten dengan database: projectName="${plan.projectName}", stored="${storedPlan.projectName}".`,
    );
  }

  if (plan.sourceUrl !== storedPlan.sourceUrl) {
    throw new Error(
      "Snapshot task plan tidak konsisten dengan database: sourceUrl berbeda.",
    );
  }
}
