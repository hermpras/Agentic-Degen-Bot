import fs from "fs";
import path from "path";

import { AgentDatabase } from "../src/database/agent-database.js";
import {
  ProjectTaskWorkflow,
  type ProjectTaskWorkflowExecutor,
} from "../src/workflows/project-task-workflow.js";
import type { TaskExecutionReport } from "../src/tasks/task-executor.js";

const TEST_DB_PATH = "data/test-project-task-workflow.db";

function cleanup(): void {
  const fullPath = path.resolve(process.cwd(), TEST_DB_PATH);

  if (fs.existsSync(fullPath)) {
    fs.rmSync(fullPath, {
      force: true,
    });
  }
}

function seedDatabase(database: AgentDatabase): void {
  const db = database.getDb();

  db.prepare(
    `
    INSERT INTO accounts (
      name,
      twitter_handle,
      wallet_address,
      status
    )
    VALUES (?, ?, ?, 'ACTIVE')
  `,
  ).run("Workflow Account A", "@workflow_a", "0xWORKFLOW_A");

  db.prepare(
    `
    INSERT INTO accounts (
      name,
      twitter_handle,
      wallet_address,
      status
    )
    VALUES (?, ?, ?, 'ACTIVE')
  `,
  ).run("Workflow Account B", "@workflow_b", "0xWORKFLOW_B");

  db.prepare(
    `
    INSERT INTO projects (
      name,
      website_url,
      twitter_url,
      whitelist_status,
      mint_status
    )
    VALUES (?, ?, ?, 'UNKNOWN', 'UNKNOWN')
  `,
  ).run(
    "Workflow Test Project",
    "https://example.com",
    "https://x.com/example",
  );
}

function createMockExecutor(): ProjectTaskWorkflowExecutor {
  return {
    async executePlan(tasks): Promise<TaskExecutionReport> {
      return {
        totalTasks: tasks.length,
        completedTasks: tasks.length,
        failedTasks: 0,
        skippedTasks: 0,
        results: tasks.map((task) => ({
          planTaskId: task.planTaskId,
          taskId: null,
          projectName: task.projectName,
          accountName: task.accountName,
          taskType: task.taskType,
          status: "DONE",
          output: "Mock workflow execution.",
          error: null,
        })),
      };
    },
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function main(): Promise<void> {
  console.log("");
  console.log("🧪 ProjectTaskWorkflow test");
  console.log("");

  cleanup();

  try {
    const database = new AgentDatabase(TEST_DB_PATH);

    seedDatabase(database);

    const workflow = new ProjectTaskWorkflow(
      database,
      undefined,
      createMockExecutor(),
    );

    const plan = workflow.createPlan({
      projectName: "Workflow Test Project",
      sourceUrl: "https://example.com",
      requirements: [
        {
          type: "FORM_TWITTER",
          description: "Submit Twitter handle.",
          form: {
            formType: "WEBSITE",
            targetUrl: "https://example.com/form",
            fields: [
              {
                type: "TWITTER_HANDLE",
                label: "Twitter",
                required: true,
              },
            ],
          },
        },
        {
          type: "FORM_WALLET",
          description: "Submit wallet.",
          form: {
            formType: "WEBSITE",
            targetUrl: "https://example.com/form",
            fields: [
              {
                type: "WALLET_ADDRESS",
                label: "Wallet",
                required: true,
              },
            ],
          },
        },
      ],
    });

    assert(
      plan.projectName === "Workflow Test Project",
      "Workflow harus membuat plan untuk project yang benar.",
    );

    assert(
      plan.accountCount === 2,
      "Workflow harus menggunakan 2 ACTIVE account.",
    );

    assert(plan.taskCount === 4, "Workflow harus menghasilkan 4 task.");

    assert(plan.tasks.length === 4, "Plan harus memiliki 4 task.");

    console.log("✅ createPlan() berhasil.");

    const report = await workflow.executePlan(plan);

    assert(report.totalTasks === 4, "Executor harus menerima 4 task.");

    assert(
      report.completedTasks === 4,
      "Mock executor harus menyelesaikan 4 task.",
    );

    assert(report.failedTasks === 0, "Tidak boleh ada task FAILED.");

    assert(report.skippedTasks === 0, "Tidak boleh ada task SKIPPED.");

    console.log("✅ executePlan() berhasil.");

    const fullRun = await workflow.run({
      projectName: "Workflow Test Project",
      sourceUrl: "https://example.com",
      requirements: [
        {
          type: "FORM_TWITTER",
          description: "Run workflow test.",
          form: {
            formType: "WEBSITE",
            targetUrl: "https://example.com/form",
            fields: [
              {
                type: "TWITTER_HANDLE",
                label: "Twitter",
                required: true,
              },
            ],
          },
        },
      ],
    });

    assert(fullRun.plan.taskCount === 2, "run() harus membuat 2 task.");

    assert(fullRun.report.totalTasks === 2, "run() harus mengeksekusi 2 task.");

    assert(
      fullRun.report.completedTasks === 2,
      "run() harus menghasilkan 2 task DONE.",
    );

    console.log("✅ run() berhasil.");

    console.log("");
    console.log("🎉 ProjectTaskWorkflow test PASSED.");
    console.log("");
  } finally {
    cleanup();
  }
}

main().catch((error) => {
  console.error("");
  console.error("❌ ProjectTaskWorkflow test FAILED.");
  console.error(error);
  console.error("");

  cleanup();
  process.exit(1);
});
