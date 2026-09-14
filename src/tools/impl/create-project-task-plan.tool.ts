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
      "Menganalisis source URL project secara langsung menggunakan browser, " +
      "menemukan requirement task yang benar-benar terlihat di halaman, " +
      "menormalisasikannya secara deterministic, membuat task plan untuk " +
      "semua ACTIVE accounts, dan menyimpan plan ke database. " +
      "Tool ini hanya membuat plan dan tidak mengeksekusi task.",

    riskLevel: "SAFE",

    parameters: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "Nama project.",
        },
        sourceUrl: {
          type: "string",
          description:
            "URL halaman project yang menjadi sumber requirement task.",
        },
      },
      required: ["projectName", "sourceUrl"],
    },

    async execute(args: unknown): Promise<string> {
      const input = args as Partial<CreateProjectTaskPlanArgs>;

      const projectName =
        typeof input.projectName === "string" ? input.projectName.trim() : "";

      const sourceUrl =
        typeof input.sourceUrl === "string" ? input.sourceUrl.trim() : "";

      if (!projectName) {
        throw new Error("projectName wajib diisi.");
      }

      if (!sourceUrl) {
        throw new Error("sourceUrl wajib diisi.");
      }

      if (
        !sourceUrl.startsWith("http://") &&
        !sourceUrl.startsWith("https://")
      ) {
        throw new Error(`Source URL tidak didukung: ${sourceUrl}`);
      }

      console.log(
        `🔎 [create_project_task_plan] Menganalisis source URL: ${sourceUrl}`,
      );

      /*
       * Browser lifecycle dibuat lazy/idempotent.
       *
       * BrowserExecutor.start() aman dipanggil berkali-kali:
       * - kalau browser belum hidup -> browser dijalankan
       * - kalau browser sudah hidup -> langsung return
       *
       * Dengan begitu tool tidak bergantung sepenuhnya pada lifecycle
       * BrowserExecutor di agent-profiles.ts.
       */
      await browser.start();

      console.log(
        "🌐 [create_project_task_plan] Browser siap, menjalankan ProjectTaskAnalyzer...",
      );

      /*
       * Analyzer membaca halaman project secara langsung.
       *
       * Analyzer bertanggung jawab untuk:
       * 1. membuka source URL
       * 2. membaca page text + links
       * 3. meminta LLM membuat grounded TaskEvidence
       * 4. melakukan deterministic normalization
       *
       * Main Agent tidak mengirim evidence manual.
       */
      const plannerInput = await analyzer.analyze(sourceUrl);

      /*
       * Project name dari analyzer boleh dipakai jika valid.
       * Namun fallback ke projectName yang diberikan tool tetap tersedia.
       */
      const normalizedPlannerInput = {
        ...plannerInput,
        projectName:
          typeof plannerInput.projectName === "string" &&
          plannerInput.projectName.trim()
            ? plannerInput.projectName.trim()
            : projectName,
        sourceUrl,
      };

      console.log(
        `🧠 [create_project_task_plan] Requirement ditemukan: ${normalizedPlannerInput.requirements.length}`,
      );

      /*
       * TaskPlanner membuat task deterministic berdasarkan:
       * - requirement hasil analyzer
       * - ACTIVE accounts dari database
       */
      const plan = planner.createPlan(normalizedPlannerInput);

      /*
       * Simpan plan ke database.
       */
      const planId = database.saveTaskPlan({
        projectName: plan.projectName,
        sourceUrl: plan.sourceUrl,
        accountCount: plan.accountCount,
        taskCount: plan.taskCount,
        tasks: plan.tasks,
      });

      console.log(
        `📋 [create_project_task_plan] Plan #${planId} tersimpan: ` +
          `${plan.accountCount} accounts, ${plan.taskCount} tasks.`,
      );

      return JSON.stringify(
        {
          success: true,
          message: "Task plan berhasil dibuat dan disimpan.",
          planId,
          projectName: plan.projectName,
          sourceUrl: plan.sourceUrl,
          accountCount: plan.accountCount,
          taskCount: plan.taskCount,
          tasks: plan.tasks,
        },
        null,
        2,
      );
    },
  };
}
