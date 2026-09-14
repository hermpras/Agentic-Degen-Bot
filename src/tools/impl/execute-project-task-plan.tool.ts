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
      "Mengeksekusi task plan yang SUDAH dibuat dan disimpan sebelumnya berdasarkan planId. " +
      "Tool ini TIDAK membuat atau mengubah isi task plan. Gunakan hanya setelah user secara eksplisit meminta execution. " +
      "accountId bersifat optional untuk membatasi execution ke satu account tertentu tanpa mengubah isi task plan. " +
      "Jika accountId diisi, status keseluruhan plan tidak dianggap selesai karena account lain mungkin belum dieksekusi. " +
      "Tool ini memiliki approval boundary.",

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
            "Optional. Jika diisi, hanya task milik account tersebut yang akan dieksekusi. Task plan asli tidak diubah dan plan tetap dapat dieksekusi untuk account lain.",
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

      /*
       * Task plan adalah blueprint yang reusable.
       *
       * PLANNED:
       *   Belum pernah dieksekusi.
       *
       * EXECUTING:
       *   Ada execution sebelumnya/berjalan.
       *   Untuk sekarang tetap boleh dijalankan kembali secara eksplisit.
       *
       * COMPLETED:
       *   Execution sebelumnya selesai.
       *   Masih boleh dipakai lagi, terutama untuk account-scoped execution.
       *
       * FAILED:
       *   Execution sebelumnya gagal.
       *   Masih boleh dicoba kembali.
       *
       * Jadi status plan TIDAK dipakai sebagai "sekali pakai".
       */

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

      /*
       * Hanya full-plan execution yang mengubah status lifecycle plan.
       *
       * Account-scoped execution tidak boleh mengubah status keseluruhan
       * karena account lain masih mungkin belum dieksekusi.
       */
      if (input.accountId === undefined) {
        database.updateTaskPlanStatus(input.planId, "EXECUTING");
      }

      try {
        const report = await workflow.executePlan(plan, input.accountId);

        /*
         * ACCOUNT-SCOPED EXECUTION
         *
         * Jangan mengubah status blueprint.
         * Plan tetap reusable untuk account lain.
         */
        if (input.accountId !== undefined) {
          return {
            success: report.failedTasks === 0,

            executionStarted: true,

            planId: input.planId,

            status: storedPlan.status,

            executionScope: {
              accountId: input.accountId,
              mode: "SINGLE_ACCOUNT",
            },

            message:
              report.failedTasks === 0
                ? `Task plan #${input.planId} berhasil dieksekusi untuk account #${input.accountId}. Plan tetap tersedia untuk account lain.`
                : `Execution plan #${input.planId} untuk account #${input.accountId} selesai dengan ${report.failedTasks} task gagal. Plan tetap tersedia untuk retry/account lain.`,

            projectName: plan.projectName,

            sourceUrl: plan.sourceUrl,

            accountCount: 1,

            taskCount: report.totalTasks,

            report: {
              totalTasks: report.totalTasks,
              completedTasks: report.completedTasks,
              failedTasks: report.failedTasks,
              skippedTasks: report.skippedTasks,
              results: report.results,
            },
          };
        }

        /*
         * FULL PLAN EXECUTION
         *
         * Hanya di sini status keseluruhan plan diubah.
         */
        const finalStatus = report.failedTasks > 0 ? "FAILED" : "COMPLETED";

        database.updateTaskPlanStatus(input.planId, finalStatus);

        return {
          success: report.failedTasks === 0,

          executionStarted: true,

          planId: input.planId,

          status: finalStatus,

          executionScope: {
            accountId: null,
            mode: "ALL_ACCOUNTS",
          },

          message:
            report.failedTasks === 0
              ? `Task plan #${input.planId} berhasil dieksekusi untuk semua account.`
              : `Task plan #${input.planId} selesai dengan ${report.failedTasks} task gagal.`,

          projectName: plan.projectName,

          sourceUrl: plan.sourceUrl,

          accountCount: plan.accountCount,

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
        /*
         * Account-scoped execution tidak boleh mengubah lifecycle
         * keseluruhan plan menjadi FAILED.
         */
        if (input.accountId === undefined) {
          database.updateTaskPlanStatus(input.planId, "FAILED");
        }

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
