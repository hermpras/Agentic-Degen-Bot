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
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                description:
                  "Jenis task, misalnya OPEN_PAGE, X_FOLLOW, X_LIKE, FORM, FORM_TWITTER, FORM_WALLET, WHITELIST, atau CUSTOM.",
              },
              description: {
                type: "string",
                description: "Deskripsi task yang harus dilakukan.",
              },
              targetUrl: {
                type: "string",
                description: "URL target task jika diperlukan.",
              },
              producesOwnTweetUrl: {
                type: "boolean",
                description:
                  "Apakah task ini menghasilkan URL tweet milik account.",
              },
              requiresOwnTweetUrl: {
                type: "boolean",
                description:
                  "Apakah task ini membutuhkan URL tweet milik account.",
              },
              form: {
                type: "object",
                description:
                  "Konfigurasi form jika task membutuhkan pengisian form.",
                properties: {
                  formType: {
                    type: "string",
                    description: "Tipe form: WEBSITE atau GOOGLE_FORM.",
                  },
                  targetUrl: {
                    type: "string",
                    description: "URL form yang akan dibuka.",
                  },
                  fields: {
                    type: "array",
                    description: "Field form yang harus diisi.",
                    items: {
                      type: "object",
                      properties: {
                        type: {
                          type: "string",
                          description: "Tipe field.",
                        },
                        label: {
                          type: "string",
                          description: "Label field jika diketahui.",
                        },
                        required: {
                          type: "boolean",
                          description: "Apakah field wajib diisi.",
                        },
                      },
                      required: ["type"],
                    },
                  },
                  checkboxes: {
                    type: "array",
                    description: "Checkbox form yang harus dicentang.",
                    items: {
                      type: "object",
                      properties: {
                        type: {
                          type: "string",
                          description: "Tipe checkbox.",
                        },
                        label: {
                          type: "string",
                          description: "Label checkbox jika diketahui.",
                        },
                        required: {
                          type: "boolean",
                          description: "Apakah checkbox wajib dicentang.",
                        },
                      },
                      required: ["type"],
                    },
                  },
                  submit: {
                    type: "object",
                    description:
                      "Konfigurasi submit dan verifikasi hasil form.",
                    properties: {
                      selector: {
                        type: "string",
                        description: "CSS selector tombol submit.",
                      },
                      label: {
                        type: "string",
                        description: "Label tombol submit.",
                      },
                      successSelector: {
                        type: "string",
                        description:
                          "CSS selector yang harus muncul setelah submit berhasil.",
                      },
                      successText: {
                        type: "string",
                        description:
                          "Teks yang harus muncul setelah submit berhasil.",
                      },
                    },
                  },
                },
                required: ["formType", "targetUrl"],
              },
            },
            required: ["type", "description"],
          },
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
