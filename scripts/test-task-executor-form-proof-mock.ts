import fs from "fs";

import { AgentDatabase } from "../src/database/agent-database.js";
import { TaskExecutor } from "../src/tasks/task-executor.js";
import type { PlannedTask } from "../src/tasks/task-planner.js";
import type { FormExecutor } from "../src/tasks/form-executor.js";

async function main(): Promise<void> {
  const dbPath = "data/test-task-executor-proof.db";

  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const database = new AgentDatabase(dbPath);
  const db = database.getDb();

  try {
    db.prepare(
      `
      INSERT INTO projects (
        name,
        website_url
      )
      VALUES (?, ?)
    `,
    ).run("Integration Proof Project", "https://example.com");

    db.prepare(
      `
      INSERT INTO accounts (
        name,
        twitter_handle,
        wallet_address
      )
      VALUES (?, ?, ?)
    `,
    ).run(
      "Integration Proof Account",
      "@integration_test",
      "0x1234567890abcdef",
    );

    const account = db
      .prepare(
        `
      SELECT id
      FROM accounts
      WHERE name = ?
      LIMIT 1
    `,
      )
      .get("Integration Proof Account") as {
      id: number;
    };

    const mockFormExecutor = {
      inspectForm: async () => {
        return JSON.stringify({
          fields: 2,
          checkboxes: 1,
        });
      },

      fillForm: async () => {
        return {
          formType: "WEBSITE" as const,
          url: "https://example.com/whitelist",
          fieldsFilled: 2,
          checkboxesChecked: 1,
          submitAttempted: false,
          message: "Mock form berhasil diisi dan siap submit.",
          proof: {
            version: 1 as const,
            createdAt: new Date().toISOString(),
            url: "https://example.com/whitelist",
            formType: "WEBSITE" as const,
            executionStatus: "READY_TO_SUBMIT" as const,
            submitAttempted: false,
            fieldsFilled: 2,
            checkboxesChecked: 1,
            fields: [
              {
                index: 0,
                type: "TWITTER_HANDLE",
                label: "Twitter Username",
                valueProvided: true,
                status: "FILLED" as const,
              },
              {
                index: 1,
                type: "WALLET_ADDRESS",
                label: "Wallet Address",
                valueProvided: true,
                status: "FILLED" as const,
              },
            ],
            summary:
              "Form berhasil diisi. 2 field terisi. 1 checkbox dicentang. Submit belum dilakukan.",
          },
        };
      },
    } as unknown as FormExecutor;

    const taskExecutor = new TaskExecutor(
      database,
      undefined,
      mockFormExecutor,
    );

    const plannedTask: PlannedTask = {
      planTaskId: "integration-form-proof-001",
      projectName: "Integration Proof Project",
      accountId: account.id,
      accountName: "Integration Proof Account",
      twitterHandle: "@integration_test",
      walletAddress: "0x1234567890abcdef",
      taskType: "FORM",
      targetUrl: "https://example.com/whitelist",
      description: "Integration test form proof persistence.",
      dependsOn: [],
      outputKey: "form_proof",
      inputFrom: [],
      form: {
        formType: "WEBSITE",
        targetUrl: "https://example.com/whitelist",
        fields: [
          {
            type: "TWITTER_HANDLE",
            label: "Twitter Username",
            required: true,
            value: "@integration_test",
          },
          {
            type: "WALLET_ADDRESS",
            label: "Wallet Address",
            required: true,
            value: "0x1234567890abcdef",
          },
        ],
        checkboxes: [
          {
            type: "TERMS",
            label: "Terms",
            checked: true,
          },
        ],
      },
    };

    const result = await taskExecutor.executeTask(plannedTask);

    console.log("");
    console.log("📋 Task execution result:");
    console.log(JSON.stringify(result, null, 2));

    if (result.taskId === null) {
      throw new Error("Task ID tidak terbentuk.");
    }

    const savedTask = db
      .prepare(
        `
      SELECT
        id,
        status,
        proof
      FROM tasks
      WHERE id = ?
      LIMIT 1
    `,
      )
      .get(result.taskId) as {
      id: number;
      status: string;
      proof: string | null;
    };

    console.log("");
    console.log("💾 Database task:");
    console.log(JSON.stringify(savedTask, null, 2));

    if (savedTask.status !== "IN_PROGRESS") {
      throw new Error(
        `Expected task status IN_PROGRESS, got ${savedTask.status}`,
      );
    }

    if (!savedTask.proof) {
      throw new Error("Task proof tidak tersimpan di database.");
    }

    const proof = JSON.parse(savedTask.proof) as {
      version: number;
      executionStatus: string;
      submitAttempted: boolean;
      fieldsFilled: number;
      checkboxesChecked: number;
    };

    if (proof.version !== 1) {
      throw new Error(`Expected proof version 1, got ${proof.version}`);
    }

    if (proof.executionStatus !== "READY_TO_SUBMIT") {
      throw new Error(`Expected READY_TO_SUBMIT, got ${proof.executionStatus}`);
    }

    if (proof.submitAttempted !== false) {
      throw new Error("Expected submitAttempted=false.");
    }

    if (proof.fieldsFilled !== 2) {
      throw new Error(`Expected 2 fields filled, got ${proof.fieldsFilled}`);
    }

    if (proof.checkboxesChecked !== 1) {
      throw new Error(
        `Expected 1 checkbox checked, got ${proof.checkboxesChecked}`,
      );
    }

    console.log("");
    console.log(
      "🔍 Proof berhasil mengalir dari FormExecutor → TaskExecutor → SQLite.",
    );
    console.log("⏸️ Task tetap IN_PROGRESS karena form belum disubmit.");
    console.log("");
    console.log("🎉 TaskExecutor form proof integration test passed.");
  } finally {
    database.getDb().close();

    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
