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

export interface AgentProfile {
  /**
   * Nama unik agent, dipakai orchestrator buat routing.
   */
  name: string;

  /**
   * Deskripsi buat orchestrator milih agent mana yang cocok untuk sebuah pesan.
   */
  description: string;

  /**
   * Instance agent.
   */
  agent: Agent;

  /**
   * Approval manager yang dipakai oleh ToolRegistry agent ini.
   */
  approvalManager: ApprovalManager;
}

/**
 * Bikin semua Agent instance yang tersedia, masing-masing dengan tool & system prompt sendiri.
 *
 * Tambah agent baru di sini kalau mau nambah specialized agent lain
 * (Research, Web3, dst).
 */
export function buildAgentProfiles(
  provider: LLMProvider,
  memoryManager: MemoryManager,
  database: AgentDatabase,
): AgentProfile[] {
  // Database akan digunakan oleh specialized tools,
  // misalnya AccountManager dan ProjectManager.
  void database;

  // === General Agent — fallback default, buat research/degen/general chat ===
  const generalTools = new ToolRegistry();

  generalTools.register(getCurrentTimeTool);
  generalTools.register(webSearchTool);
  generalTools.register(browsePageTool);

  const generalAgent = new Agent(provider, generalTools, {
    memoryManager,
    systemInstruction:
      "Kamu adalah Degen Agent AI - General/Research Agent. Kamu bantu riset Web3, cari info terkini, dan ngobrol santai soal degen/meme/NFT. Kamu mengingat riwayat percakapan sebelumnya. Gunakan tool yang tersedia kalau butuh info real-time.",
  });

  // === Dev & HoodBear Agent — debugging code, baca repo, urusan project HoodBear ===
  const devTools = new ToolRegistry();

  devTools.register(getCurrentTimeTool);
  devTools.register(readFileTool);
  devTools.register(writeFileTool);
  devTools.register(githubReadFileTool);
  devTools.register(githubListDirectoryTool);
  devTools.register(githubGetRecentCommitsTool);
  devTools.register(githubGetWorkflowStatusTool);
  devTools.register(browsePageTool);

  // Account management
  devTools.register(createAccountTool);
  devTools.register(listAccountsTool);
  devTools.register(updateAccountTool);

  const devAgent = new Agent(provider, devTools, {
    memoryManager,
    systemInstruction:
      "Kamu adalah Degen Agent AI - Dev & HoodBear Agent. Kamu bantu debugging code, baca repository GitHub (commit, status build/CI, isi file), dan urusan development project HoodBear (koleksi NFT 5.555 pixel bear di hoodbear.xyz). Kamu juga mengelola profile account whitelist user, termasuk membuat account baru, melihat daftar account, dan memperbarui data account seperti Twitter/X, wallet address, atau status ACTIVE/INACTIVE. Kamu mengingat riwayat percakapan sebelumnya.",
  });

  return [
    {
      name: "general",
      description:
        "Untuk riset Web3 umum, cari info/berita terkini, ngobrol santai, atau pertanyaan yang tidak spesifik soal development/HoodBear.",
      agent: generalAgent,
      approvalManager: generalTools.getApprovalManager(),
    },

    {
      name: "dev_hoodbear",
      description:
        "Untuk debugging code, baca/tulis file lokal, cek GitHub (commit, status build, isi repo), mengelola account whitelist, atau apa pun yang berhubungan dengan development project HoodBear.",
      agent: devAgent,
      approvalManager: devTools.getApprovalManager(),
    },
  ];
}
