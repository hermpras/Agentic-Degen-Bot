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
      "menormalisasikannya secara deterministic, memastikan project tersimpan " +
      "di database, membuat task plan untuk semua ACTIVE accounts, dan " +
      "menyimpan plan ke database. Tool ini hanya membuat plan dan tidak " +
      "mengeksekusi task.",

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

      /**
       * Browser lifecycle dibuat lazy/idempotent.
       */
      await browser.start();

      console.log(
        "🌐 [create_project_task_plan] Browser siap, menjalankan ProjectTaskAnalyzer...",
      );

      /**
       * Analyzer membaca halaman project secara langsung.
       */
      const plannerInput = await analyzer.analyze(sourceUrl);

      /**
       * Project name dari analyzer boleh dipakai jika valid.
       * Fallback ke projectName dari tool tetap tersedia.
       */
      const normalizedProjectName =
        typeof plannerInput.projectName === "string" &&
        plannerInput.projectName.trim()
          ? plannerInput.projectName.trim()
          : projectName;

      const normalizedPlannerInput = {
        ...plannerInput,
        projectName: normalizedProjectName,
        sourceUrl,
      };

      console.log(
        `🧠 [create_project_task_plan] Requirement ditemukan: ${normalizedPlannerInput.requirements.length}`,
      );

      /**
       * ============================================================
       * ENSURE PROJECT EXISTS
       * ============================================================
       *
       * TaskExecutor nantinya mencari project berdasarkan nama.
       *
       * Sebelumnya create_project_task_plan hanya menyimpan:
       *
       *   task_plans
       *
       * tetapi tidak membuat:
       *
       *   projects
       *
       * Akibatnya execution plan berhasil dibuat tetapi gagal saat
       * TaskExecutor mencoba mencari project.
       *
       * Sekarang project dipastikan ada terlebih dahulu.
       */
      const db = database.getDb();

      const existingProject = db
        .prepare(
          `
            SELECT
              id,
              name,
              website_url AS websiteUrl
            FROM projects
            WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
            ORDER BY id DESC
            LIMIT 1
          `,
        )
        .get(normalizedProjectName) as
        | {
            id: number;
            name: string;
            websiteUrl: string | null;
          }
        | undefined;

      let projectId: number;

      if (existingProject) {
        projectId = existingProject.id;

        console.log(
          `📁 [create_project_task_plan] Project ditemukan: #${projectId} "${existingProject.name}".`,
        );

        /**
         * Jangan menghapus data project yang sudah ada.
         *
         * Website URL hanya diperbarui apabila kosong atau berbeda.
         */
        if (existingProject.websiteUrl !== sourceUrl) {
          db.prepare(
            `
              UPDATE projects
              SET
                website_url = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `,
          ).run(sourceUrl, projectId);

          console.log(
            `🔄 [create_project_task_plan] Website URL project #${projectId} diperbarui.`,
          );
        }
      } else {
        const result = db
          .prepare(
            `
              INSERT INTO projects (
                name,
                website_url
              )
              VALUES (?, ?)
            `,
          )
          .run(normalizedProjectName, sourceUrl);

        projectId = Number(result.lastInsertRowid);

        console.log(
          `🆕 [create_project_task_plan] Project baru dibuat: #${projectId} "${normalizedProjectName}".`,
        );
      }

      /**
       * ============================================================
       * CREATE TASK PLAN
       * ============================================================
       */
      const plan = planner.createPlan(normalizedPlannerInput);

      /**
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
          projectId,

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
