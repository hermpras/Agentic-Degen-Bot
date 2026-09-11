import { AgentDatabase } from "../src/database/agent-database.js";
import { createProjectTaskPlanTool } from "../src/tools/impl/create-project-task-plan.tool.js";

async function main(): Promise<void> {
  console.log("🧪 create_project_task_plan tool test");

  const database = new AgentDatabase(":memory:");
  const db = database.getDb();

  const testId = Date.now();

  const accountA = `Test Account A ${testId}`;
  const accountB = `Test Account B ${testId}`;
  const projectName = `Test Project ${testId}`;

  // ============================================================
  // Isolate test database
  // ============================================================

  db.exec(`
    DELETE FROM eligibility_checks;
    DELETE FROM tasks;
    DELETE FROM watchlist;
    DELETE FROM projects;
    DELETE FROM accounts;
  `);

  console.log("✅ Test database berhasil diisolasi.");

  // ============================================================
  // Setup test accounts
  // ============================================================

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
  ).run(accountA, `@account_a_${testId}`, `0xACCOUNT_A_${testId}`, "ACTIVE");

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
  ).run(accountB, `@account_b_${testId}`, `0xACCOUNT_B_${testId}`, "ACTIVE");

  // ============================================================
  // Setup test project
  // ============================================================

  db.prepare(
    `
    INSERT INTO projects (
      name,
      website_url,
      twitter_url
    )
    VALUES (?, ?, ?)
  `,
  ).run(projectName, "https://example.com", "https://x.com/testproject");

  console.log("✅ Test account dan project berhasil dibuat.");

  // ============================================================
  // Create tool
  // ============================================================

  const tool = createProjectTaskPlanTool(database);

  if (tool.name !== "create_project_task_plan") {
    throw new Error(`Nama tool salah: ${tool.name}`);
  }

  if (tool.riskLevel !== "SAFE") {
    throw new Error(`riskLevel harus SAFE, tetapi: ${tool.riskLevel}`);
  }

  console.log("✅ Tool berhasil dibuat dan riskLevel SAFE.");

  // ============================================================
  // Execute tool
  // ============================================================

  const result = await tool.execute({
    projectName,

    sourceUrl: "https://example.com/requirements",

    requirements: [
      {
        type: "OPEN_PAGE",

        description: "Buka halaman project",

        targetUrl: "https://example.com",
      },

      {
        type: "X_FOLLOW",

        description: "Follow akun project di X",

        targetUrl: "https://x.com/testproject",
      },

      {
        type: "FORM_WALLET",

        description: "Isi wallet pada form whitelist",

        form: {
          formType: "WEBSITE",

          targetUrl: "https://example.com/form",

          fields: [
            {
              type: "WALLET_ADDRESS",

              label: "Wallet Address",

              required: true,
            },
          ],
        },
      },
    ],
  });

  // ============================================================
  // Validate basic result
  // ============================================================

  if (result.success !== true) {
    throw new Error("Tool result.success bukan true.");
  }

  if (result.executionStarted !== false) {
    throw new Error("Tool tidak boleh memulai execution.");
  }

  if (result.projectName !== projectName) {
    throw new Error(`Project name salah: ${result.projectName}`);
  }

  if (result.accountCount !== 2) {
    throw new Error(`Account count harus 2, actual: ${result.accountCount}`);
  }

  if (result.taskCount !== 6) {
    throw new Error(`Task count harus 6, actual: ${result.taskCount}`);
  }

  if (!Array.isArray(result.tasks)) {
    throw new Error("result.tasks bukan array.");
  }

  if (result.tasks.length !== 6) {
    throw new Error(`Jumlah task harus 6, actual: ${result.tasks.length}`);
  }

  console.log("✅ Task plan berhasil dibuat.");

  console.log(`   Accounts: ${result.accountCount}`);

  console.log(`   Tasks: ${result.taskCount}`);

  // ============================================================
  // Validate task distribution
  // ============================================================

  const accountATasks = result.tasks.filter(
    (task: any) => task.accountName === accountA,
  );

  const accountBTasks = result.tasks.filter(
    (task: any) => task.accountName === accountB,
  );

  if (accountATasks.length !== 3) {
    throw new Error(
      `Account A harus memiliki 3 task, actual: ${accountATasks.length}`,
    );
  }

  if (accountBTasks.length !== 3) {
    throw new Error(
      `Account B harus memiliki 3 task, actual: ${accountBTasks.length}`,
    );
  }

  console.log("✅ Task berhasil dibagi ke semua ACTIVE account.");

  // ============================================================
  // Validate task types
  // ============================================================

  const taskTypes = result.tasks.map((task: any) => task.taskType);

  const requiredTaskTypes = ["OPEN_PAGE", "X_FOLLOW", "FORM_WALLET"];

  for (const taskType of requiredTaskTypes) {
    const count = taskTypes.filter((type: string) => type === taskType).length;

    if (count !== 2) {
      throw new Error(
        `Task type ${taskType} harus muncul 2 kali, actual: ${count}`,
      );
    }
  }

  console.log("✅ Semua task type berhasil dibuat untuk setiap account.");

  // ============================================================
  // Critical assertion:
  // Tool hanya membuat PLAN.
  // Tidak boleh ada execution task di DB.
  // ============================================================

  const persistedTasks = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM tasks
      `,
    )
    .get() as {
    count: number;
  };

  if (persistedTasks.count !== 0) {
    throw new Error(
      `Tool seharusnya tidak membuat execution task di DB. Found: ${persistedTasks.count}`,
    );
  }

  console.log("✅ Tidak ada task execution yang dibuat di database.");

  // ============================================================
  // Print summary
  // ============================================================

  console.log("");
  console.log("📋 Planned tasks:");

  for (const task of result.tasks) {
    console.log(
      `   - ${task.accountName}: ${task.taskType} | ${task.description}`,
    );
  }

  console.log("");
  console.log("🎉 create_project_task_plan tool test PASSED.");
}

main().catch((error) => {
  console.error("❌ create_project_task_plan tool test FAILED.");

  console.error(error);

  process.exit(1);
});
