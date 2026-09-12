import { existsSync, unlinkSync } from "node:fs";

import { AgentDatabase } from "../src/database/agent-database.js";
import { ApprovalManager } from "../src/approval/approval-manager.js";
import { ToolRegistry } from "../src/tools/tool-registry.js";
import { executeProjectTaskPlanTool } from "../src/tools/impl/execute-project-task-plan.tool.js";

async function main(): Promise<void> {
  console.log("");
  console.log("========================================");
  console.log("REAL FULL-CHAIN X_FOLLOW APPROVAL TEST");
  console.log("========================================");

  const dbPath = "data/test-real-x-follow-approval.db";

  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }

  const database = new AgentDatabase(dbPath);

  try {
    const db = database.getDb();

    /*
     * Test DB hanya punya SATU account.
     *
     * ID akan menjadi 1, sehingga XActionExecutor
     * menggunakan session:
     *
     * playwright/.auth/account-1.json
     */
    db.exec(`
      DELETE FROM eligibility_checks;
      DELETE FROM tasks;
      DELETE FROM watchlist;
      DELETE FROM projects;
      DELETE FROM accounts;
    `);

    db.prepare(
      `
      INSERT INTO accounts (
        name,
        twitter_handle,
        wallet_address,
        status
      )
      VALUES (?, ?, ?, ?)
      `,
    ).run("Raja Tuyul", "@Arcwargg", "0xTestWallet", "ACTIVE");

    db.prepare(
      `
      INSERT INTO projects (
        name,
        website_url,
        twitter_url,
        whitelist_status,
        mint_status
      )
      VALUES (?, ?, ?, ?, ?)
      `,
    ).run(
      "ARCWAR",
      "https://quest.arcwar.gg/",
      "https://x.com/arcwargg",
      "OPEN",
      "NOT_STARTED",
    );

    console.log("✅ Isolated test database siap.");
    console.log("✅ Account 1 = Raja Tuyul.");
    console.log("✅ Project = ARCWAR.");
    console.log("✅ X session = playwright/.auth/account-1.json.");

    const registry = new ToolRegistry();

    const executeTool = executeProjectTaskPlanTool(database);

    registry.register(executeTool);

    console.log("");
    console.log("🔧 Tool registered:");
    console.log(`   ${executeTool.name}`);
    console.log(`   riskLevel = ${executeTool.riskLevel}`);

    if (executeTool.riskLevel !== "APPROVAL") {
      throw new Error(
        `Risk level salah. Expected APPROVAL, got ${executeTool.riskLevel}`,
      );
    }

    const chatId = 999999;

    const args = {
      projectName: "ARCWAR",
      sourceUrl: "https://quest.arcwar.gg/",
      requirements: [
        {
          type: "X_FOLLOW",
          description: "Follow akun X resmi ARCWAR.",
          targetUrl: "https://x.com/arcwargg",
        },
      ],
    };

    console.log("");
    console.log("========================================");
    console.log("STEP 1 — EXECUTE WITHOUT APPROVAL");
    console.log("========================================");

    const blockedResultRaw = await registry.executeTool(
      "execute_project_task_plan",
      args,
      chatId,
    );

    const blockedResult =
      typeof blockedResultRaw === "string"
        ? JSON.parse(blockedResultRaw)
        : blockedResultRaw;

    console.log("📦 Blocked result:");
    console.log(blockedResult);

    if (blockedResult.success !== false) {
      throw new Error(
        "Tool seharusnya belum boleh dieksekusi sebelum approval.",
      );
    }

    if (blockedResult.blocked !== true) {
      throw new Error("Tool seharusnya berstatus blocked.");
    }

    if (blockedResult.requiresApproval !== true) {
      throw new Error("Tool seharusnya meminta approval.");
    }

    if (!blockedResult.approvalId) {
      throw new Error("approvalId tidak dibuat.");
    }

    console.log("✅ Execution berhasil diblok.");
    console.log(`✅ Approval ID: ${blockedResult.approvalId}`);

    const beforeApprovalCount = (
      db.prepare(`SELECT COUNT(*) AS count FROM tasks`).get() as {
        count: number;
      }
    ).count;

    if (beforeApprovalCount !== 0) {
      throw new Error(
        `Task seharusnya 0 sebelum approval, tetapi ditemukan ${beforeApprovalCount}.`,
      );
    }

    console.log("✅ Tidak ada task sebelum approval.");

    console.log("");
    console.log("========================================");
    console.log("STEP 2 — VERIFY APPROVAL REQUEST");
    console.log("========================================");

    const approvalManager: ApprovalManager = registry.getApprovalManager();

    const approval = approvalManager.getRequest(blockedResult.approvalId);

    if (!approval) {
      throw new Error("Approval request tidak ditemukan.");
    }

    if (approval.status !== "PENDING") {
      throw new Error(`Status approval salah: ${approval.status}`);
    }

    if (approval.toolName !== "execute_project_task_plan") {
      throw new Error(`Tool pada approval salah: ${approval.toolName}`);
    }

    console.log("✅ Approval request ditemukan.");
    console.log("✅ Status approval = PENDING.");

    console.log("");
    console.log("========================================");
    console.log("STEP 3 — APPROVE");
    console.log("========================================");

    const approved = approvalManager.approveRequest(blockedResult.approvalId);

    if (!approved) {
      throw new Error("Approval gagal.");
    }

    if (approved.status !== "APPROVED") {
      throw new Error(
        `Status approval setelah approve salah: ${approved.status}`,
      );
    }

    console.log("✅ Approval diberikan.");
    console.log("✅ Status approval = APPROVED.");

    console.log("");
    console.log("========================================");
    console.log("STEP 4 — EXECUTE APPROVED TOOL");
    console.log("========================================");
    console.log("🚀 Sekarang workflow REAL X_FOLLOW dimulai.");
    console.log("");

    const executionResultRaw = await registry.executeApprovedTool(
      blockedResult.approvalId,
    );

    const executionResult =
      typeof executionResultRaw === "string"
        ? JSON.parse(executionResultRaw)
        : executionResultRaw;

    console.log("");
    console.log("📦 Approved execution result:");
    console.log(executionResult);

    if (executionResult.success !== true) {
      throw new Error(
        `Approved execution gagal: ${JSON.stringify(executionResult)}`,
      );
    }

    if (executionResult.executionStarted !== true) {
      throw new Error("executionStarted seharusnya true.");
    }

    console.log("");
    console.log("✅ Approved tool berhasil menjalankan workflow.");

    console.log("");
    console.log("========================================");
    console.log("STEP 5 — VERIFY DATABASE");
    console.log("========================================");

    const tasks = db
      .prepare(
        `
        SELECT
          id,
          project_id,
          account_id,
          task_type,
          target_url,
          description,
          status,
          proof,
          error,
          completed_at
        FROM tasks
        ORDER BY id ASC
        `,
      )
      .all() as Array<{
      id: number;
      project_id: number;
      account_id: number;
      task_type: string;
      target_url: string | null;
      description: string;
      status: string;
      proof: string | null;
      error: string | null;
      completed_at: string | null;
    }>;

    if (tasks.length !== 1) {
      throw new Error(`Expected 1 task, got ${tasks.length}.`);
    }

    const task = tasks[0];

    console.log(`Task ID      : ${task.id}`);
    console.log(`Account ID   : ${task.account_id}`);
    console.log(`Task Type    : ${task.task_type}`);
    console.log(`Target URL   : ${task.target_url}`);
    console.log(`Status       : ${task.status}`);
    console.log(`Proof        : ${task.proof}`);
    console.log(`Error        : ${task.error ?? "-"}`);
    console.log(`Completed At : ${task.completed_at ?? "-"}`);

    if (task.account_id !== 1) {
      throw new Error(`Expected account_id=1, got ${task.account_id}.`);
    }

    if (task.task_type !== "X_FOLLOW") {
      throw new Error(`Expected X_FOLLOW, got ${task.task_type}.`);
    }

    if (task.status !== "DONE") {
      throw new Error(`Expected task status DONE, got ${task.status}.`);
    }

    if (!task.proof) {
      throw new Error("Task DONE tetapi proof kosong.");
    }

    if (task.error) {
      throw new Error(`Task DONE tetapi memiliki error: ${task.error}`);
    }

    console.log("");
    console.log("========================================");
    console.log("FINAL RESULT");
    console.log("========================================");
    console.log("✅ Approval boundary bekerja.");
    console.log("✅ Execution hanya dimulai setelah approval.");
    console.log("✅ ProjectTaskWorkflow berhasil.");
    console.log("✅ TaskPlanner berhasil.");
    console.log("✅ TaskExecutor berhasil.");
    console.log("✅ XActionExecutor berhasil.");
    console.log("✅ Account 1 session berhasil digunakan.");
    console.log("✅ X_FOLLOW berhasil.");
    console.log("✅ Task DB = DONE.");
    console.log("✅ Proof tersimpan.");
    console.log("");
    console.log("🎉 FULL-CHAIN REAL X_FOLLOW TEST PASSED.");
  } finally {
    database.close?.();

    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  }
}

main().catch((error) => {
  console.error("");
  console.error("❌ FULL-CHAIN REAL X_FOLLOW TEST FAILED.");
  console.error(error);
  process.exit(1);
});
