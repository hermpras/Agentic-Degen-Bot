import { AgentDatabase } from "../../database/agent-database.js";
import { ProjectTaskWorkflow } from "../../workflows/project-task-workflow.js";
import type { TaskPlannerInput } from "../../tasks/task-planner.js";
import type { Tool } from "../tool.interface.js";

interface WorkflowRequirementInput {
  type: string;
  description: string;
  targetUrl?: string;
  producesOwnTweetUrl?: boolean;
  requiresOwnTweetUrl?: boolean;
  form?: {
    formType: string;
    targetUrl: string;
    fields?: Array<{
      type: string;
      label?: string;
      required?: boolean;
    }>;
    checkboxes?: Array<{
      type: string;
      label?: string;
      required?: boolean;
    }>;
    submit?: {
      selector?: string;
      label?: string;
      successSelector?: string;
      successText?: string;
    };
  };
}

interface ExecuteProjectTaskPlanArgs {
  projectName: string;
  sourceUrl: string;
  requirements: WorkflowRequirementInput[];
}

export function executeProjectTaskPlanTool(database: AgentDatabase): Tool {
  const workflow = new ProjectTaskWorkflow(database);

  return {
    name: "execute_project_task_plan",

    description:
      "Menjalankan task workflow whitelist/project untuk semua ACTIVE account. Tool ini membuat task plan lalu mengeksekusinya secara berurutan. Tool ini memerlukan approval user sebelum execution dimulai.",

    riskLevel: "APPROVAL",

    parameters: {
      type: "object",

      properties: {
        projectName: {
          type: "string",
          description: "Nama project yang sudah terdaftar di database.",
        },

        sourceUrl: {
          type: "string",
          description:
            "URL sumber project, website, announcement, Twitter/X, atau halaman requirements.",
        },

        requirements: {
          type: "array",
          description:
            "Daftar requirements/task yang harus dilakukan untuk project.",
        },
      },

      required: ["projectName", "sourceUrl", "requirements"],
    },

    async execute(args: Record<string, any>): Promise<any> {
      const input = args as ExecuteProjectTaskPlanArgs;

      if (!input.projectName || typeof input.projectName !== "string") {
        throw new Error("projectName wajib diisi.");
      }

      if (!input.sourceUrl || typeof input.sourceUrl !== "string") {
        throw new Error("sourceUrl wajib diisi.");
      }

      if (
        !Array.isArray(input.requirements) ||
        input.requirements.length === 0
      ) {
        throw new Error(
          "requirements wajib berupa array dan minimal memiliki satu requirement.",
        );
      }

      const plannerInput: TaskPlannerInput = {
        projectName: input.projectName.trim(),

        sourceUrl: input.sourceUrl.trim(),

        requirements: input.requirements as any,
      };

      console.log(
        `🚀 [execute_project_task_plan] Memulai workflow untuk project "${plannerInput.projectName}".`,
      );

      const result = await workflow.run(plannerInput);

      return {
        success: true,

        executionStarted: true,

        message: "Project task workflow berhasil dieksekusi.",

        projectName: result.plan.projectName,

        accountCount: result.plan.accountCount,

        taskCount: result.plan.taskCount,

        report: {
          totalTasks: result.report.totalTasks,

          completedTasks: result.report.completedTasks,

          failedTasks: result.report.failedTasks,

          skippedTasks: result.report.skippedTasks,

          results: result.report.results,
        },
      };
    },
  };
}
