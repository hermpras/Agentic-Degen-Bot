import { LLMProvider } from "../providers/llm.interface.js";
import { MemoryManager } from "../memory/memory-manager.js";
import { Agent } from "../agent/agent.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import { ApprovalManager } from "../approval/approval-manager.js";
import { AgentDatabase } from "../database/agent-database.js";

import { getCurrentTimeTool } from "../tools/impl/get-current-time.tool.js";
import { webSearchTool } from "../tools/impl/web-search.tool.js";
import { readFileTool } from "../tools/impl/read-file.tool.js";
import { writeFileTool } from "../tools/impl/write-file.tool.js";
import { browsePageTool } from "../tools/impl/browse-page.tool.js";

import { githubReadFileTool } from "../tools/impl/github-read-file.tool.js";
import { githubListDirectoryTool } from "../tools/impl/github-list-directory.tool.js";
import { githubGetRecentCommitsTool } from "../tools/impl/github-get-recent-commits.tool.js";
import { githubGetWorkflowStatusTool } from "../tools/impl/github-get-workflow-status.tool.js";

import { createAccountTool } from "../tools/impl/create-account.tool.js";
import { listAccountsTool } from "../tools/impl/list-accounts.tool.js";
import { updateAccountTool } from "../tools/impl/update-account.tool.js";
import { renameAccountTool } from "../tools/impl/rename-account.tool.js";

import { createProjectTool } from "../tools/impl/create-project.tool.js";
import { listProjectsTool } from "../tools/impl/list-projects.tool.js";
import { addToWatchlistTool } from "../tools/impl/add-to-watchlist.tool.js";
import { updateProjectTool } from "../tools/impl/update-project.tool.js";
import { updateWatchlistTool } from "../tools/impl/update-watchlist.tool.js";

import { createProjectTaskPlanTool } from "../tools/impl/create-project-task-plan.tool.js";
import { executeProjectTaskPlanTool } from "../tools/impl/execute-project-task-plan.tool.js";

export interface AgentProfile {
  /**
   * Nama unik agent, dipakai orchestrator buat routing.
   */
  name: string;

  /**
   * Deskripsi buat orchestrator memilih agent
   * yang paling cocok untuk sebuah pesan.
   */
  description: string;

  /**
   * Instance agent.
   */
  agent: Agent;

  /**
   * Approval manager yang dipakai oleh ToolRegistry
   * agent ini.
   */
  approvalManager: ApprovalManager;
}

/**
 * Membuat semua Agent instance yang tersedia.
 *
 * Setiap agent mempunyai:
 * - system instruction sendiri
 * - tool registry sendiri
 * - approval manager sendiri
 */
export function buildAgentProfiles(
  provider: LLMProvider,
  memoryManager: MemoryManager,
  database: AgentDatabase,
): AgentProfile[] {
  // ============================================================
  // General Agent
  // ============================================================

  const generalTools = new ToolRegistry();

  generalTools.register(getCurrentTimeTool);
  generalTools.register(webSearchTool);
  generalTools.register(browsePageTool);

  const generalAgent = new Agent(provider, generalTools, {
    memoryManager,

    systemInstruction:
      "Kamu adalah Degen Agent AI - General/Research Agent. " +
      "Kamu bantu riset Web3, cari info terkini, dan ngobrol santai " +
      "soal degen/meme/NFT. Kamu mengingat riwayat percakapan sebelumnya. " +
      "Gunakan tool yang tersedia kalau butuh info real-time.",
  });

  // ============================================================
  // Dev & HoodBear Agent
  // ============================================================

  const devTools = new ToolRegistry();

  // ============================================================
  // General / development tools
  // ============================================================

  devTools.register(getCurrentTimeTool);
  devTools.register(readFileTool);
  devTools.register(writeFileTool);

  devTools.register(githubReadFileTool);
  devTools.register(githubListDirectoryTool);
  devTools.register(githubGetRecentCommitsTool);
  devTools.register(githubGetWorkflowStatusTool);

  devTools.register(browsePageTool);

  // ============================================================
  // Account tools
  // ============================================================

  devTools.register(createAccountTool);
  devTools.register(listAccountsTool);
  devTools.register(updateAccountTool);
  devTools.register(renameAccountTool);

  // ============================================================
  // Project / Watchlist tools
  // ============================================================

  devTools.register(createProjectTool);
  devTools.register(listProjectsTool);
  devTools.register(addToWatchlistTool);
  devTools.register(updateProjectTool);
  devTools.register(updateWatchlistTool);

  // ============================================================
  // Project Task Workflow
  // ============================================================

  /**
   * Tool ini hanya membuat task plan.
   *
   * Tool TIDAK mengeksekusi task.
   *
   * Hasil penting dari tool ini adalah planId.
   * planId harus dipertahankan dan digunakan untuk execution
   * terhadap plan yang sama.
   */
  devTools.register(createProjectTaskPlanTool(database));

  /**
   * Tool ini mengeksekusi task plan yang sudah tersimpan.
   *
   * Tool menerima planId, BUKAN projectName/sourceUrl/requirements.
   *
   * Tool memiliki risk level APPROVAL sehingga ToolRegistry
   * akan menahan execution sampai user memberikan approval
   * melalui ApprovalService.
   */
  devTools.register(executeProjectTaskPlanTool(database));

  const devAgent = new Agent(provider, devTools, {
    memoryManager,

    systemInstruction:
      "Kamu adalah Degen Agent AI - Dev & HoodBear Agent. " +
      "Kamu bantu debugging code, baca repository GitHub, " +
      "development project HoodBear, mengelola account whitelist, " +
      "dan mengelola project whitelist/watchlist. " +
      "Untuk account, kamu bisa membuat, melihat, memperbarui, " +
      "dan rename account. " +
      "Untuk project, kamu bisa mendaftarkan project baru, " +
      "melihat project, mengubah informasi project, " +
      "dan mengelola watchlist. " +
      "Jika user meminta menyiapkan pekerjaan whitelist atau project, " +
      "gunakan tool create_project_task_plan untuk membuat task plan " +
      "berdasarkan requirements dan ACTIVE accounts yang tersedia. " +
      "create_project_task_plan HANYA membuat dan menyimpan task plan. " +
      "Tool tersebut TIDAK mengeksekusi task dan TIDAK melakukan submit. " +
      "Setiap task plan yang berhasil dibuat memiliki planId. " +
      "Jika kamu membuat task plan, selalu perhatikan dan pertahankan " +
      "planId tersebut sebagai identitas plan yang akan dieksekusi. " +
      "Jangan membuat ulang requirements, jangan membuat plan baru, " +
      "dan jangan memanggil create_project_task_plan lagi hanya untuk " +
      "mengeksekusi plan yang sudah ada. " +
      "Jika user secara eksplisit meminta task plan yang sudah dibuat " +
      "untuk dijalankan, gunakan execute_project_task_plan dengan " +
      "planId dari task plan yang sudah dibuat. " +
      "execute_project_task_plan HANYA menerima planId dan akan " +
      "mengeksekusi snapshot plan yang sudah tersimpan. " +
      "Jika planId belum diketahui atau tidak ada plan yang jelas " +
      "untuk dieksekusi, jangan menebak planId. " +
      "execute_project_task_plan memiliki approval boundary. " +
      "Approval berarti user mengizinkan execution, tetapi approval " +
      "bukan bukti bahwa task sudah berhasil. " +
      "Jangan pernah mengklaim task sudah dijalankan ketika execution " +
      "masih menunggu approval. " +
      "Jangan pernah mengklaim sebuah task berhasil jika hasil execution " +
      "tidak menunjukkan task tersebut berhasil. " +
      "Gunakan hasil execution tool sebagai sumber kebenaran untuk " +
      "status task, jumlah task selesai, task gagal, dan proof. " +
      "Untuk informasi real-time, gunakan tool yang tersedia. " +
      "Kamu mengingat riwayat percakapan sebelumnya.",
  });

  // ============================================================
  // Profiles
  // ============================================================

  return [
    {
      name: "general",

      description:
        "Untuk riset Web3 umum, cari info/berita terkini, ngobrol santai, " +
        "atau pertanyaan yang tidak spesifik soal development/HoodBear.",

      agent: generalAgent,
      approvalManager: generalTools.getApprovalManager(),
    },

    {
      name: "dev_hoodbear",

      description:
        "Untuk debugging code, baca/tulis file lokal, cek GitHub, " +
        "mengelola account whitelist, mengelola project/watchlist, " +
        "membuat task plan whitelist/project, dan menjalankan task " +
        "yang memerlukan approval user.",

      agent: devAgent,
      approvalManager: devTools.getApprovalManager(),
    },
  ];
}
