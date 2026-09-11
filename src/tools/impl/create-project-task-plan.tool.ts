import { AgentDatabase } from "../../database/agent-database.js";
import {
  TaskPlanner,
  type TaskPlannerInput,
} from "../../tasks/task-planner.js";
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

interface CreateProjectTaskPlanArgs {
  projectName: string;
  sourceUrl: string;
  requirements: WorkflowRequirementInput[];
}

export function createProjectTaskPlanTool(database: AgentDatabase): Tool {
  const planner = new TaskPlanner(database);

  return {
    name: "create_project_task_plan",

    description:
      "Membuat task plan whitelist/project berdasarkan project yang sudah ada di database dan requirements yang diberikan. Tool ini HANYA membuat plan dan TIDAK mengeksekusi task.",

    riskLevel: "SAFE",

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
      const input = args as CreateProjectTaskPlanArgs;

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

      const plan = planner.createPlan(plannerInput);

      return {
        success: true,

        executionStarted: false,

        message: "Task plan berhasil dibuat. Belum ada task yang dieksekusi.",

        projectName: plan.projectName,

        accountCount: plan.accountCount,

        taskCount: plan.taskCount,

        tasks: plan.tasks.map((task) => ({
          planTaskId: task.planTaskId,

          taskType: task.taskType,

          projectName: task.projectName,

          accountName: task.accountName,

          description: task.description,

          targetUrl: task.targetUrl,

          dependsOn: task.dependsOn,

          hasForm: Boolean(task.form),
        })),
      };
    },
  };
}
