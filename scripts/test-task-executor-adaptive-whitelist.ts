import "dotenv/config";

import { AgentDatabase } from "../src/database/agent-database.js";
import { TaskExecutor } from "../src/tasks/task-executor.js";
import type { PlannedTask } from "../src/tasks/task-planner.js";

async function main() {
  console.log("🧪 TaskExecutor → AdaptiveWebExecutor Integration Test");
  console.log("========================================================");

  const database = new AgentDatabase("data/agent.db");

  try {
    const existingProject = database
      .getDb()
      .prepare(
        `
    SELECT id
    FROM projects
    WHERE name = ?
    LIMIT 1
    `,
      )
      .get("MOTIF") as { id: number } | undefined;

    if (!existingProject) {
      database
        .getDb()
        .prepare(
          `
      INSERT INTO projects (
        name,
        website_url,
        whitelist_status,
        mint_status,
        notes
      )
      VALUES (?, ?, ?, ?, ?)
      `,
        )
        .run(
          "MOTIF",
          "https://themotif.art/ensemble#/ensemble",
          "UNKNOWN",
          "UNKNOWN",
          "Integration test project.",
        );

      console.log("📦 Project MOTIF dibuat untuk integration test.");
    }
    const executor = new TaskExecutor(database);

    const task: PlannedTask = {
      planTaskId: "integration-motif-wallet-check-001",
      projectName: "MOTIF",
      accountId: 1,
      accountName: "Raja Tuyul",
      twitterHandle: "@solkikip",
      walletAddress: "0xcf51dbba6a82c2ed1f0a6ff9dacd803298693ae9",
      taskType: "WHITELIST",
      targetUrl: "https://themotif.art/ensemble#/ensemble",
      description:
        "Check the account wallet on the project page and determine the whitelist/eligibility result.",
      dependsOn: [],
      outputKey: null,
      inputFrom: null,
      form: null,
    };

    console.log("\n📋 Planned Task");
    console.log(JSON.stringify(task, null, 2));

    const result = await executor.executeTask(task);

    console.log("\n================================");
    console.log("🎯 RESULT");
    console.log("================================");
    console.log(JSON.stringify(result, null, 2));

    console.log("\n================================");
    console.log("💾 DATABASE TASK");
    console.log("================================");

    const dbTask = database
      .getDb()
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
        WHERE account_id = ?
          AND task_type = ?
        ORDER BY id DESC
        LIMIT 1
        `,
      )
      .get(1, "WHITELIST");

    console.log(JSON.stringify(dbTask, null, 2));

    if (result.status !== "DONE") {
      throw new Error(`Integration test gagal: status = ${result.status}`);
    }

    if (!dbTask) {
      throw new Error("Integration test gagal: database task tidak ditemukan.");
    }

    const typedDbTask = dbTask as {
      id: number;
      status: string;
      proof: string | null;
      error: string | null;
    };

    if (typedDbTask.status !== "DONE") {
      throw new Error(
        `Integration test gagal: database task status = ${typedDbTask.status}`,
      );
    }

    if (!typedDbTask.proof) {
      throw new Error("Integration test gagal: proof tidak tersimpan.");
    }

    console.log("\n✅ Integration test PASS.");
    console.log(
      "✅ TaskExecutor berhasil merouting WHITELIST → AdaptiveWebExecutor.",
    );
    console.log("✅ Adaptive execution berhasil selesai.");
    console.log("✅ Task status tersimpan sebagai DONE.");
    console.log("✅ Proof tersimpan di database.");
  } finally {
    database.getDb().close();
  }
}

main().catch((error) => {
  console.error("\n❌ TaskExecutor adaptive integration test failed:");
  console.error(error);
  process.exit(1);
});
