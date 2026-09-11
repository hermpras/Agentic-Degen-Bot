import { existsSync, unlinkSync } from "node:fs";
import { AgentDatabase } from "../src/database/agent-database.js";
import { ApprovalManager } from "../src/approval/approval-manager.js";
import { ToolRegistry } from "../src/tools/tool-registry.js";
import { executeProjectTaskPlanTool } from "../src/tools/impl/execute-project-task-plan.tool.js";

async function main(): Promise<void> {
  console.log("🧪 execute_project_task_plan approval test");

  const dbPath = "data/test-execute-project-task-plan.db";

  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }

  const database = new AgentDatabase(dbPath);

  try {
    const db = database.getDb();

    db.exec(`
      DELETE FROM eligibility_checks;
      DELETE FROM tasks;
      DELETE FROM watchlist;
      DELETE FROM projects;
      DELETE FROM accounts;
    `);

    console.log("✅ Test database berhasil diisolasi.");

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
    ).run(
      "Approval Test Account",
      "@approval_test",
      "0xApprovalTestWallet",
      "ACTIVE",
    );

    db.prepare(
      `
      INSERT INTO projects (
        name,
        website_url,
        whitelist_status,
        mint_status
      )
      VALUES (?, ?, ?, ?)
    `,
    ).run(
      "Approval Test Project",
      "https://example.com",
      "OPEN",
      "NOT_STARTED",
    );

    console.log("✅ Test account dan project berhasil dibuat.");

    const registry = new ToolRegistry();
    const executeTool = executeProjectTaskPlanTool(database);

    registry.register(executeTool);

    console.log("✅ execute_project_task_plan berhasil diregister.");

    if (executeTool.riskLevel !== "APPROVAL") {
      throw new Error(
        `Risk level salah. Expected APPROVAL, got ${executeTool.riskLevel}`,
      );
    }

    console.log("✅ Risk level = APPROVAL.");

    const chatId = 999999;

    const args = {
      projectName: "Approval Test Project",
      sourceUrl: "https://example.com",
      requirements: [
        {
          type: "CUSTOM",
          description: "Approval boundary test",
        },
      ],
    };

    // ------------------------------------------------------------
    // 5. Execute tool WITHOUT approval
    // ------------------------------------------------------------

    const blockedResultRaw = await registry.executeTool(
      "execute_project_task_plan",
      args,
      chatId,
    );

    const blockedResult =
      typeof blockedResultRaw === "string"
        ? JSON.parse(blockedResultRaw)
        : blockedResultRaw;

    console.log("📦 Initial execution result:");
    console.log(blockedResult);

    if (blockedResult.success !== false) {
      throw new Error("Tool seharusnya belum boleh dieksekusi.");
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

    console.log("✅ Execution berhasil diblok sampai approval.");

    // ------------------------------------------------------------
    // 6. Verify no task was created before approval
    // ------------------------------------------------------------

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

    console.log("✅ Tidak ada task yang dibuat sebelum approval.");

    // ------------------------------------------------------------
    // 7. Verify approval request
    // ------------------------------------------------------------

    const approvalManager: ApprovalManager = registry.getApprovalManager();

    const approval = approvalManager.getRequest(blockedResult.approvalId);

    if (!approval) {
      throw new Error("Approval request tidak ditemukan.");
    }

    if (approval.status !== "PENDING") {
      throw new Error(
        `Status approval salah. Expected PENDING, got ${approval.status}`,
      );
    }

    if (approval.toolName !== "execute_project_task_plan") {
      throw new Error(`Tool pada approval salah: ${approval.toolName}`);
    }

    console.log("✅ Approval request tersimpan dengan status PENDING.");

    // ------------------------------------------------------------
    // 8. Approve
    // ------------------------------------------------------------

    const approved = approvalManager.approveRequest(blockedResult.approvalId);

    if (!approved) {
      throw new Error("Approval gagal dilakukan.");
    }

    if (approved.status !== "APPROVED") {
      throw new Error(
        `Status approval salah setelah approve: ${approved.status}`,
      );
    }

    console.log("✅ Approval berhasil diberikan.");

    // ------------------------------------------------------------
    // 9. Execute approved tool
    // ------------------------------------------------------------

    const executionResultRaw = await registry.executeApprovedTool(
      blockedResult.approvalId,
    );

    const executionResult =
      typeof executionResultRaw === "string"
        ? JSON.parse(executionResultRaw)
        : executionResultRaw;

    console.log("📦 Approved execution result:");
    console.log(executionResult);

    if (executionResult.success !== true) {
      throw new Error(
        `Approved execution gagal: ${JSON.stringify(executionResult)}`,
      );
    }

    if (executionResult.executionStarted !== true) {
      throw new Error(
        "Approved execution seharusnya memiliki executionStarted=true.",
      );
    }

    console.log("✅ Approved tool berhasil dieksekusi.");

    // ------------------------------------------------------------
    // 10. Verify task persistence
    // ------------------------------------------------------------

    const tasks = db
      .prepare(
        `
        SELECT
          id,
          project_id,
          account_id,
          task_type,
          status,
          description
        FROM tasks
        ORDER BY id ASC
      `,
      )
      .all() as Array<{
      id: number;
      project_id: number;
      account_id: number;
      task_type: string;
      status: string;
      description: string;
    }>;

    if (tasks.length !== 1) {
      throw new Error(`Expected 1 persisted task, got ${tasks.length}.`);
    }

    if (tasks[0].task_type !== "CUSTOM") {
      throw new Error(`Task type salah: ${tasks[0].task_type}`);
    }

    if (tasks[0].status !== "DONE") {
      throw new Error(`Task status salah: ${tasks[0].status}`);
    }

    console.log("✅ Task berhasil dipersist ke database sebagai DONE.");

    // ------------------------------------------------------------
    // 11. Final summary
    // ------------------------------------------------------------

    console.log("");
    console.log("📋 Approval flow:");
    console.log("   1. Tool dipanggil");
    console.log("   2. Execution diblok");
    console.log("   3. Approval request dibuat");
    console.log("   4. Tidak ada task sebelum approval");
    console.log("   5. Approval diberikan");
    console.log("   6. Tool dieksekusi");
    console.log("   7. Task tersimpan sebagai DONE");
    console.log("");
    console.log("🎉 execute_project_task_plan approval test PASSED.");
  } finally {
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  }
}

main().catch((error) => {
  console.error("❌ execute_project_task_plan approval test FAILED.");
  console.error(error);
  process.exit(1);
});
