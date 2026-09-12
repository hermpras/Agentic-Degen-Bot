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
      // ==========================================================
      // TASK PLANNING
      // ==========================================================

      "Untuk pekerjaan whitelist atau project, gunakan " +
      "create_project_task_plan untuk membuat task plan " +
      "berdasarkan requirements dan ACTIVE accounts yang tersedia. " +
      "create_project_task_plan HANYA membuat dan menyimpan task plan. " +
      "Tool tersebut TIDAK mengeksekusi task. " +
      "Setiap task plan yang berhasil dibuat memiliki planId. " +
      "planId adalah ID unik dari execution plan tersebut. " +
      // ==========================================================
      // CRITICAL EXECUTION RULE
      // ==========================================================

      "ATURAN EKSEKUSI PALING PENTING: " +
      "Jika pesan user hanya meminta membuat atau menyiapkan plan, " +
      "misalnya 'buat plan', 'siapkan plan', atau 'rencanakan', " +
      "maka setelah create_project_task_plan berhasil kamu boleh " +
      "mengakhiri proses dengan melaporkan planId. " +
      "TETAPI jika pesan user meminta pekerjaan BENAR-BENAR DIKERJAKAN, " +
      "misalnya mengandung maksud 'kerjakan', 'jalankan', 'execute', " +
      "'langsung kerjakan', 'do it', 'run task', 'lanjutkan pekerjaan', " +
      "'eksekusi', atau instruksi setara lainnya, " +
      "MAKA membuat plan BUKAN penyelesaian tugas. " +
      "DALAM KONDISI TERSEBUT, SETELAH create_project_task_plan " +
      "BERHASIL DAN MENGEMBALIKAN planId, KAMU WAJIB SEGERA " +
      "MEMANGGIL execute_project_task_plan DENGAN planId TERSEBUT. " +
      "JANGAN memberikan final answer setelah create_project_task_plan " +
      "jika intent user adalah mengerjakan task. " +
      "JANGAN mengatakan 'plan siap dieksekusi', " +
      "'menunggu approval', 'belum dieksekusi', atau " +
      "'silakan approve' sebelum kamu memanggil " +
      "execute_project_task_plan. " +
      "Urutan yang benar untuk permintaan eksekusi adalah: " +
      "create_project_task_plan -> ambil planId -> " +
      "execute_project_task_plan(planId). " +
      "Jangan membuat plan baru untuk menggantikan plan yang baru saja " +
      "dibuat hanya karena execution belum dilakukan. " +
      "Jangan membuat ulang requirements. " +
      // ==========================================================
      // EXISTING PLAN
      // ==========================================================

      "Jika user meminta menjalankan plan yang sudah dibuat dan " +
      "planId tersedia di percakapan, langsung gunakan " +
      "execute_project_task_plan dengan planId tersebut. " +
      "execute_project_task_plan hanya menerima planId. " +
      "Jika user menyebut plan tertentu tetapi planId tidak diketahui, " +
      "jangan menebak angka planId. " +
      // ==========================================================
      // APPROVAL
      // ==========================================================

      "execute_project_task_plan memiliki approval boundary. " +
      "Jika ToolRegistry mengembalikan approval request, " +
      "itu berarti execution DITAHAN dan belum dijalankan. " +
      "Approval request bukan hasil execution. " +
      "Jangan mengklaim task sudah berjalan ketika tool baru " +
      "menghasilkan approval request. " +
      "Jangan mengklaim task berhasil hanya karena user memberikan approval. " +
      "Execution baru dianggap terjadi setelah execute_project_task_plan " +
      "benar-benar dijalankan dan memberikan execution report. " +
      "Gunakan hasil execution tool sebagai sumber kebenaran untuk " +
      "status task, jumlah task selesai, task gagal, dan proof. " +
      // ==========================================================
      // TASK SAFETY
      // ==========================================================

      "Jangan memperluas scope task secara spekulatif. " +
      "Jika requirement hanya meminta membuka halaman dan klik " +
      "tombol tertentu, jangan otomatis melakukan wallet connection, " +
      "sign message, transaksi, mint, submit, X action, atau Discord " +
      "action yang tidak diminta. " +
      "Wallet address field biasa cukup diisi menggunakan wallet address " +
      "account. Jangan otomatis membuka Rabby hanya karena terdapat " +
      "field wallet address. " +
      "Wallet connection hanya dilakukan jika task memang membutuhkan " +
      "wallet connection. " +
      "Signing dan transaksi adalah aksi sensitif dan harus mengikuti " +
      "approval boundary yang berlaku. " +
      // ==========================================================
      // ACCOUNT / PROJECT DATA
      // ==========================================================

      "Untuk account dan project, gunakan data dari database sebagai " +
      "sumber kebenaran. Jangan menebak wallet address, Twitter handle, " +
      "project, atau planId. " +
      "Jika project belum ada dan user memang meminta project didaftarkan, " +
      "buat project terlebih dahulu sebelum membuat task plan. " +
      "Jika project sudah ada, jangan membuat duplicate project hanya " +
      "karena task perlu dijalankan. " +
      // ==========================================================
      // FINAL RESPONSE
      // ==========================================================

      "Jangan mengakhiri agent loop setelah create_project_task_plan " +
      "untuk permintaan eksekusi. Lanjutkan tool call ke " +
      "execute_project_task_plan. " +
      "Jika execute_project_task_plan menghasilkan approval request, " +
      "baru berhenti dan laporkan bahwa execution membutuhkan approval. " +
      "Jika execution benar-benar selesai, laporkan hasil berdasarkan " +
      "execution report. " +
      "Jangan pernah menyamakan PLANNED dengan EXECUTED. " +
      "Jangan pernah menyamakan APPROVAL_REQUESTED dengan EXECUTED. " +
      "Jangan pernah menyamakan APPROVED dengan COMPLETED. " +
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
