import { existsSync, unlinkSync } from "node:fs";
import { AgentDatabase } from "../src/database/agent-database.js";
import { MemoryManager } from "../src/memory/memory-manager.js";
import { GeminiProvider } from "../src/providers/gemini.provider.js";
import { buildAgentProfiles } from "../src/agents/agent-profiles.js";

async function main(): Promise<void> {
  console.log("🧪 dev_hoodbear execution tool integration test");

  const dbPath = "data/test-dev-hoodbear-execution.db";

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
      DELETE FROM messages;
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
      "Dev HoodBear Test Account",
      "@dev_hoodbear_test",
      "0xDevHoodBearTestWallet",
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
      "Dev HoodBear Test Project",
      "https://example.com",
      "OPEN",
      "NOT_STARTED",
    );

    console.log("✅ Test account dan project berhasil dibuat.");

    const memoryManager = new MemoryManager(database);

    // Provider hanya diperlukan untuk membangun Agent.
    // Test ini tidak melakukan request ke Gemini.
    const provider = new GeminiProvider("test-api-key");

    const profiles = buildAgentProfiles(provider, memoryManager, database);

    console.log(`✅ Agent profiles berhasil dibuat: ${profiles.length}`);

    const devProfile = profiles.find(
      (profile) => profile.name === "dev_hoodbear",
    );

    if (!devProfile) {
      throw new Error("Profile dev_hoodbear tidak ditemukan.");
    }

    console.log("✅ Profile dev_hoodbear ditemukan.");

    const registry = devProfile.agent.getToolRegistry();

    const createPlanTool = registry.getTool("create_project_task_plan");

    if (!createPlanTool) {
      throw new Error(
        "create_project_task_plan tidak terdaftar di dev_hoodbear.",
      );
    }

    console.log("✅ create_project_task_plan terdaftar.");

    if (createPlanTool.riskLevel !== "SAFE") {
      throw new Error(
        `Risk level create_project_task_plan salah: ${createPlanTool.riskLevel}`,
      );
    }

    console.log("✅ create_project_task_plan riskLevel = SAFE.");

    const executeTool = registry.getTool("execute_project_task_plan");

    if (!executeTool) {
      throw new Error(
        "execute_project_task_plan tidak terdaftar di dev_hoodbear.",
      );
    }

    console.log("✅ execute_project_task_plan terdaftar.");

    if (executeTool.riskLevel !== "APPROVAL") {
      throw new Error(
        `Risk level execute_project_task_plan salah: ${executeTool.riskLevel}`,
      );
    }

    console.log("✅ execute_project_task_plan riskLevel = APPROVAL.");

    const chatId = 888888;

    const args = {
      projectName: "Dev HoodBear Test Project",
      sourceUrl: "https://example.com",
      requirements: [
        {
          type: "CUSTOM",
          description: "Dev HoodBear profile integration test",
        },
      ],
    };

    const blockedRaw = await registry.executeTool(
      "execute_project_task_plan",
      args,
      chatId,
    );

    const blocked =
      typeof blockedRaw === "string" ? JSON.parse(blockedRaw) : blockedRaw;

    console.log("📦 Execution request result:");
    console.log(blocked);

    if (blocked.success !== false) {
      throw new Error("Execution seharusnya belum dijalankan.");
    }

    if (blocked.blocked !== true) {
      throw new Error("Execution seharusnya berstatus blocked.");
    }

    if (blocked.requiresApproval !== true) {
      throw new Error("Execution seharusnya membutuhkan approval.");
    }

    if (!blocked.approvalId) {
      throw new Error("Approval ID tidak dibuat.");
    }

    console.log("✅ dev_hoodbear execution berhasil masuk approval boundary.");

    const taskCountBefore = (
      db.prepare(`SELECT COUNT(*) AS count FROM tasks`).get() as {
        count: number;
      }
    ).count;

    if (taskCountBefore !== 0) {
      throw new Error(
        `Task seharusnya 0 sebelum approval, got ${taskCountBefore}.`,
      );
    }

    console.log("✅ Tidak ada task yang dibuat sebelum approval.");

    const approvalManager = devProfile.approvalManager;

    const approval = approvalManager.getRequest(blocked.approvalId);

    if (!approval) {
      throw new Error("Approval request tidak ditemukan.");
    }

    if (approval.status !== "PENDING") {
      throw new Error(`Approval status salah: ${approval.status}`);
    }

    console.log("✅ Approval request dev_hoodbear berstatus PENDING.");

    const approved = approvalManager.approveRequest(blocked.approvalId);

    if (!approved) {
      throw new Error("Approval gagal.");
    }

    console.log("✅ Approval dev_hoodbear berhasil diberikan.");

    const executionRaw = await registry.executeApprovedTool(blocked.approvalId);

    const execution =
      typeof executionRaw === "string"
        ? JSON.parse(executionRaw)
        : executionRaw;

    console.log("📦 Approved execution result:");
    console.log(execution);

    if (execution.success !== true) {
      throw new Error(`Approved execution gagal: ${JSON.stringify(execution)}`);
    }

    if (execution.executionStarted !== true) {
      throw new Error("executionStarted seharusnya true.");
    }

    console.log("✅ dev_hoodbear berhasil menjalankan approved execution.");

    const tasks = db
      .prepare(
        `
        SELECT
          id,
          task_type,
          status,
          description
        FROM tasks
        ORDER BY id ASC
      `,
      )
      .all() as Array<{
      id: number;
      task_type: string;
      status: string;
      description: string;
    }>;

    if (tasks.length !== 1) {
      throw new Error(`Expected 1 task, got ${tasks.length}.`);
    }

    if (tasks[0].task_type !== "CUSTOM") {
      throw new Error(`Task type salah: ${tasks[0].task_type}`);
    }

    if (tasks[0].status !== "DONE") {
      throw new Error(`Task status salah: ${tasks[0].status}`);
    }

    console.log("✅ Task dev_hoodbear berhasil dipersist sebagai DONE.");

    console.log("");
    console.log("🎉 dev_hoodbear execution tool integration test PASSED.");
  } finally {
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  }
}

main().catch((error) => {
  console.error("❌ dev_hoodbear execution tool integration test FAILED.");
  console.error(error);
  process.exit(1);
});
