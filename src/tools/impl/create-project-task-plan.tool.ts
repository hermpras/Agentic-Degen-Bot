import { AgentDatabase } from "../../database/agent-database.js";
import { ProjectTaskAnalyzer } from "../../projects/project-task-analyzer.js";
import { BrowserExecutor } from "../../browser/browser-executor.js";
import { LLMProvider } from "../../providers/llm.interface.js";
import { TaskPlanner } from "../../tasks/task-planner.js";
import type { Tool } from "../tool.interface.js";

interface CreateProjectTaskPlanArgs {
  projectName: string;
  sourceUrl: string;
}

export function createProjectTaskPlanTool(
  database: AgentDatabase,
  browser: BrowserExecutor,
  llm: LLMProvider,
): Tool {
  const planner = new TaskPlanner(database);

  const analyzer = new ProjectTaskAnalyzer({
    browser,
    llm,
  });

  return {
    name: "create_project_task_plan",

    description:
      "Menganalisis halaman project secara langsung menggunakan ProjectTaskAnalyzer, " +
      "mengambil grounded task evidence dari halaman yang diperiksa, " +
      "menormalisasikannya menjadi atomic task secara deterministik, " +
      "lalu membuat dan menyimpan task plan untuk ACTIVE accounts. " +
      "Tool ini HANYA membuat dan menyimpan plan, TIDAK mengeksekusi task. " +
      "Plan yang dibuat memiliki planId yang nantinya digunakan untuk execution setelah approval.",

    riskLevel: "SAFE",

    parameters: {
      type: "object" as const,

      properties: {
        projectName: {
          type: "string" as const,
          description: "Nama project yang sedang dibuatkan task plan.",
        },

        sourceUrl: {
          type: "string" as const,
          description:
            "URL halaman project, whitelist, quest, announcement, atau requirements yang harus dianalisis.",
        },
      },

      required: ["projectName", "sourceUrl"],
    },

    async execute(args: Record<string, any>): Promise<any> {
      const input = args as CreateProjectTaskPlanArgs;

      if (!input.projectName || typeof input.projectName !== "string") {
        throw new Error("projectName wajib diisi.");
      }

      if (!input.sourceUrl || typeof input.sourceUrl !== "string") {
        throw new Error("sourceUrl wajib diisi.");
      }

      const projectName = input.projectName.trim();
      const sourceUrl = input.sourceUrl.trim();

      if (!projectName) {
        throw new Error("projectName tidak boleh kosong.");
      }

      if (!sourceUrl) {
        throw new Error("sourceUrl tidak boleh kosong.");
      }

      console.log(
        `🔎 [create_project_task_plan] Menganalisis source URL: ${sourceUrl}`,
      );

      /*
       * IMPORTANT:
       *
       * Jangan menerima evidence dari LLM utama.
       *
       * ProjectTaskAnalyzer adalah satu-satunya komponen yang:
       *
       * 1. membuka halaman project
       * 2. membaca visible page content
       * 3. membaca discovered links
       * 4. meminta LLM analyzer menghasilkan TaskEvidence
       * 5. menjalankan deterministic normalization
       *
       * Dengan demikian main Agent tidak bisa mengarang
       * evidence lalu memasukkannya langsung ke planner.
       */
      const plannerInput = await analyzer.analyze(sourceUrl);

      /*
       * projectName dari analyzer/source dipakai sebagai source of truth
       * untuk planner. Namun nama project dari tool tetap menjadi fallback
       * karena user memberikan projectName secara eksplisit.
       */
      const normalizedPlannerInput = {
        ...plannerInput,
        projectName: plannerInput.projectName.trim() || projectName,
        sourceUrl,
      };

      const plan = planner.createPlan(normalizedPlannerInput);

      const planId = database.saveTaskPlan({
        projectName: plan.projectName,
        sourceUrl: plan.sourceUrl,
        accountCount: plan.accountCount,
        taskCount: plan.taskCount,
        tasks: plan.tasks,
      });

      console.log(
        `📋 [create_project_task_plan] Plan #${planId} disimpan untuk project "${plan.projectName}".`,
      );

      return {
        success: true,
        executionStarted: false,

        planId,

        status: "PLANNED",

        message:
          `Task plan #${planId} berhasil dibuat dan disimpan. ` +
          `Task dibuat berdasarkan halaman project yang dianalisis oleh ProjectTaskAnalyzer. ` +
          `Belum ada task yang dieksekusi. ` +
          `Gunakan planId ${planId} untuk execution setelah approval.`,

        projectName: plan.projectName,
        sourceUrl: plan.sourceUrl,

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
