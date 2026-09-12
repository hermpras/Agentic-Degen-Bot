import { AgentDatabase } from "../src/database/agent-database.js";
import { TaskExecutor } from "../src/tasks/task-executor.js";
import { XActionExecutor } from "../src/tasks/x-action-executor.js";
import type { PlannedTask } from "../src/tasks/task-planner.js";

async function main() {
  const accountId = Number(process.argv[2] ?? 1);

  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw new Error("Account ID harus berupa angka positif.");
  }

  const database = new AgentDatabase();

  try {
    const db = database.getDb();

    const account = db
      .prepare(
        `
        SELECT id, name, twitter_handle, wallet_address, status
        FROM accounts
        WHERE id = ?
        LIMIT 1
        `,
      )
      .get(accountId) as
      | {
          id: number;
          name: string;
          twitter_handle: string | null;
          wallet_address: string | null;
          status: string;
        }
      | undefined;

    if (!account) {
      throw new Error(`Account ${accountId} tidak ditemukan.`);
    }

    if (account.status !== "ACTIVE") {
      throw new Error(
        `Account ${accountId} tidak ACTIVE. Status: ${account.status}`,
      );
    }

    const project = db
      .prepare(
        `
        SELECT id, name
        FROM projects
        WHERE name = ?
        LIMIT 1
        `,
      )
      .get("ARCWAR") as
      | {
          id: number;
          name: string;
        }
      | undefined;

    if (!project) {
      throw new Error(
        'Project "ARCWAR" tidak ditemukan. Pastikan project sudah ada di database.',
      );
    }

    const targetUrl = "https://x.com/arcwargg";

    const task: PlannedTask = {
      planTaskId: `integration-x-follow-${Date.now()}`,
      projectName: project.name,
      accountId: account.id,
      accountName: account.name,
      twitterHandle: account.twitter_handle ?? "",
      walletAddress: account.wallet_address ?? "",
      taskType: "X_FOLLOW",
      targetUrl,
      description: `Integration test: follow ${targetUrl}`,
      dependsOn: [],
    };

    console.log("");
    console.log("========================================");
    console.log("TASK EXECUTOR → REAL X_FOLLOW TEST");
    console.log("========================================");
    console.log(`Account : ${account.id} (${account.name})`);
    console.log(`Project : ${project.name}`);
    console.log(`Target  : ${targetUrl}`);
    console.log("");

    const executor = new TaskExecutor(database, new XActionExecutor());

    const beforeCount = db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM tasks
        WHERE account_id = ?
          AND task_type = 'X_FOLLOW'
        `,
      )
      .get(account.id) as { count: number };

    console.log(`📊 X_FOLLOW tasks sebelum test: ${beforeCount.count}`);

    const result = await executor.executeTask(task);

    console.log("");
    console.log("========================================");
    console.log("EXECUTION RESULT");
    console.log("========================================");
    console.log(`Plan Task ID : ${result.planTaskId}`);
    console.log(`DB Task ID   : ${result.taskId}`);
    console.log(`Status       : ${result.status}`);
    console.log(`Output       : ${result.output ?? "-"}`);
    console.log(`Error        : ${result.error ?? "-"}`);

    if (result.taskId === null) {
      throw new Error("TaskExecutor tidak membuat database task.");
    }

    const savedTask = db
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
        WHERE id = ?
        LIMIT 1
        `,
      )
      .get(result.taskId) as
      | {
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
        }
      | undefined;

    if (!savedTask) {
      throw new Error(
        `Task #${result.taskId} tidak ditemukan setelah execution.`,
      );
    }

    console.log("");
    console.log("========================================");
    console.log("DATABASE RESULT");
    console.log("========================================");
    console.log(`Task ID      : ${savedTask.id}`);
    console.log(`Task Type    : ${savedTask.task_type}`);
    console.log(`Target URL   : ${savedTask.target_url ?? "-"}`);
    console.log(`Status       : ${savedTask.status}`);
    console.log(`Proof        : ${savedTask.proof ?? "-"}`);
    console.log(`Error        : ${savedTask.error ?? "-"}`);
    console.log(`Completed At : ${savedTask.completed_at ?? "-"}`);

    console.log("");
    console.log("========================================");

    if (result.status !== "DONE") {
      console.error("❌ TEST FAILED: TaskExecutor tidak menghasilkan DONE.");
      process.exitCode = 1;
      return;
    }

    if (savedTask.status !== "DONE") {
      console.error("❌ TEST FAILED: status task di database bukan DONE.");
      process.exitCode = 1;
      return;
    }

    if (!savedTask.proof) {
      console.error("❌ TEST FAILED: task DONE tetapi proof kosong.");
      process.exitCode = 1;
      return;
    }

    console.log("✅ TASK EXECUTOR BERHASIL");
    console.log("✅ X_FOLLOW berhasil");
    console.log("✅ DB status = DONE");
    console.log("✅ Proof tersimpan");
    console.log("");
    console.log("TEST PASSED");
  } finally {
    // AgentDatabase tidak menyediakan close().
    // SQLite connection akan dikelola oleh process.
  }
}

main().catch((error) => {
  console.error("");
  console.error("❌ TEST ERROR");
  console.error(error);
  process.exitCode = 1;
});
