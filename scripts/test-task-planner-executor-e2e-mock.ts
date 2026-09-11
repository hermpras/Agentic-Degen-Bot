import fs from "fs";
import path from "path";

import { AgentDatabase } from "../src/database/agent-database.js";
import {
  TaskPlanner,
  type TaskRequirement,
} from "../src/tasks/task-planner.js";
import { TaskExecutor } from "../src/tasks/task-executor.js";
import type { FormExecutor } from "../src/tasks/form-executor.js";
import type { FormExecutionResult } from "../src/tasks/form-executor.js";

const TEST_DB_PATH = "data/test-task-planner-executor-e2e.db";

function cleanupDatabase(): void {
  const fullPath = path.resolve(process.cwd(), TEST_DB_PATH);

  if (fs.existsSync(fullPath)) {
    fs.rmSync(fullPath, { force: true });
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
  ).run("Account A", "@account_a", "0xAAA");

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
  ).run("Account B", "@account_b", "0xBBB");

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
  ).run("Account C", "@account_c", "0xCCC");

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
  ).run("E2E Test Project", "https://example.com", "https://x.com/example");
}

function createMockFormExecutor(
  mode: "SUCCESS" | "FAIL_ACCOUNT_B_TASK_1",
): FormExecutor {
  let executionCount = 0;

  const mock = {
    inspectForm: async () => {
      return JSON.stringify(
        {
          url: "https://example.com/form",
          title: "Mock Whitelist Form",
          fields: [
            {
              index: 0,
              kind: "INPUT",
              type: "text",
              name: "twitter",
              id: "twitter",
              label: "Twitter",
              placeholder: null,
              ariaLabel: null,
              required: true,
              selector: "#twitter",
            },
            {
              index: 1,
              kind: "INPUT",
              type: "text",
              name: "wallet",
              id: "wallet",
              label: "Wallet",
              placeholder: null,
              ariaLabel: null,
              required: true,
              selector: "#wallet",
            },
          ],
          checkboxes: [],
          summary: "Mock form with Twitter and wallet fields.",
        },
        null,
        2,
      );
    },

    fillForm: async (): Promise<FormExecutionResult> => {
      executionCount += 1;

      /*
       * Execution order:
       *
       * 1 = Account A task 1
       * 2 = Account A task 2
       * 3 = Account B task 1
       * 4 = Account B task 2
       * 5 = Account C task 1
       * 6 = Account C task 2
       *
       * Pada failure case, Account B task 1 gagal.
       * Maka Account B task 2 harus di-skip
       * karena dependency-nya tidak selesai.
       */
      const shouldFail =
        mode === "FAIL_ACCOUNT_B_TASK_1" && executionCount === 3;

      const executionStatus = shouldFail ? "FAILED" : "SUBMITTED";

      const submitSucceeded = !shouldFail;

      return {
        formType: "WEBSITE",
        url: "https://example.com/form",
        fieldsFilled: 2,
        checkboxesChecked: 0,
        submitAttempted: true,
        submitSucceeded,
        message: shouldFail
          ? "Mock submission failed for Account B task 1."
          : "Mock submission succeeded.",
        proof: {
          version: 1,
          createdAt: new Date().toISOString(),
          url: "https://example.com/form",
          formType: "WEBSITE",
          executionStatus,
          submitAttempted: true,
          submitSucceeded,
          fieldsFilled: 2,
          checkboxesChecked: 0,
          fields: [
            {
              index: 0,
              type: "TWITTER_HANDLE",
              label: "Twitter",
              valueProvided: true,
              status: "FILLED",
            },
            {
              index: 1,
              type: "WALLET_ADDRESS",
              label: "Wallet",
              valueProvided: true,
              status: "FILLED",
            },
          ],
          summary: shouldFail
            ? "Mock form execution gagal."
            : "Mock form berhasil disubmit.",
        },
      };
    },
  };

  return mock as FormExecutor;
}

function createRequirements(): TaskRequirement[] {
  return [
    {
      type: "FORM_TWITTER",
      description: "Submit Twitter account to whitelist form.",
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
        submit: {
          selector: "#submit-twitter",
          successText: "Submission successful",
        },
      },
    },
    {
      type: "FORM_WALLET",
      description: "Submit wallet address to whitelist form.",
      form: {
        formType: "WEBSITE",
        targetUrl: "https://example.com/form",
        fields: [
          {
            type: "TWITTER_HANDLE",
            label: "Twitter",
            required: true,
          },
          {
            type: "WALLET_ADDRESS",
            label: "Wallet",
            required: true,
          },
        ],
        submit: {
          selector: "#submit-wallet",
          successText: "Submission successful",
        },
      },
    },
  ];
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSuccessCase(): Promise<void> {
  console.log("");
  console.log("🧪 Case 1: Planner → Executor semua task berhasil");
  console.log("");

  cleanupDatabase();

  const database = new AgentDatabase(TEST_DB_PATH);

  seedDatabase(database);

  const planner = new TaskPlanner(database);

  const plan = planner.createPlan({
    projectName: "E2E Test Project",
    sourceUrl: "https://example.com",
    requirements: createRequirements(),
  });

  console.log(
    `📋 Planner membuat ${plan.taskCount} task untuk ${plan.accountCount} account.`,
  );

  assert(plan.accountCount === 3, "Planner harus menemukan 3 ACTIVE accounts.");

  assert(
    plan.taskCount === 6,
    "Planner harus membuat 6 task (3 account × 2 requirement).",
  );

  const accountATasks = plan.tasks.filter(
    (task) => task.accountName === "Account A",
  );

  const accountBTasks = plan.tasks.filter(
    (task) => task.accountName === "Account B",
  );

  const accountCTasks = plan.tasks.filter(
    (task) => task.accountName === "Account C",
  );

  assert(accountATasks.length === 2, "Account A harus memiliki 2 task.");

  assert(accountBTasks.length === 2, "Account B harus memiliki 2 task.");

  assert(accountCTasks.length === 2, "Account C harus memiliki 2 task.");

  assert(
    accountATasks[0].dependsOn.length === 0,
    "Task pertama Account A tidak boleh memiliki dependency.",
  );

  assert(
    accountATasks[1].dependsOn.includes(accountATasks[0].planTaskId),
    "Task kedua Account A harus bergantung pada task pertama.",
  );

  assert(
    accountBTasks[1].dependsOn.includes(accountBTasks[0].planTaskId),
    "Task kedua Account B harus bergantung pada task pertama.",
  );

  assert(
    accountCTasks[1].dependsOn.includes(accountCTasks[0].planTaskId),
    "Task kedua Account C harus bergantung pada task pertama.",
  );

  console.log("✅ Planner menghasilkan task dan dependency yang benar.");

  const formExecutor = createMockFormExecutor("SUCCESS");

  const executor = new TaskExecutor(database, undefined, formExecutor);

  const report = await executor.executePlan(plan.tasks);

  console.log("");

  console.log(
    `📊 Execution report: ${report.completedTasks} DONE / ${report.failedTasks} FAILED / ${report.skippedTasks} SKIPPED`,
  );

  assert(
    report.totalTasks === 6,
    "Execution report harus berisi 6 total task.",
  );

  assert(report.completedTasks === 6, "Semua 6 task harus DONE.");

  assert(
    report.failedTasks === 0,
    "Tidak boleh ada task FAILED pada success case.",
  );

  assert(
    report.skippedTasks === 0,
    "Tidak boleh ada task SKIPPED pada success case.",
  );

  const db = database.getDb();

  const rows = db
    .prepare(
      `
      SELECT
        t.id,
        t.task_type,
        t.status,
        t.proof,
        a.name AS account_name
      FROM tasks t
      JOIN accounts a
        ON a.id = t.account_id
      ORDER BY t.id ASC
    `,
    )
    .all() as Array<{
    id: number;
    task_type: string;
    status: string;
    proof: string | null;
    account_name: string;
  }>;

  assert(rows.length === 6, "SQLite harus memiliki 6 task.");

  for (const row of rows) {
    assert(
      row.status === "DONE",
      `Task #${row.id} (${row.account_name}) harus DONE.`,
    );

    assert(
      row.proof !== null,
      `Task #${row.id} (${row.account_name}) harus memiliki proof.`,
    );

    const proof = JSON.parse(row.proof!);

    assert(
      proof.executionStatus === "SUBMITTED",
      `Task #${row.id} proof harus SUBMITTED.`,
    );

    assert(
      proof.submitSucceeded === true,
      `Task #${row.id} proof submitSucceeded harus true.`,
    );
  }

  console.log(
    "✅ SQLite menyimpan 6 task sebagai DONE dengan proof SUBMITTED.",
  );

  console.log("");
  console.log("🎉 Case 1 passed.");

  cleanupDatabase();
}

async function runDependencyFailureCase(): Promise<void> {
  console.log("");
  console.log("🧪 Case 2: Task gagal → dependency berikutnya di-skip");
  console.log("");

  cleanupDatabase();

  const database = new AgentDatabase(TEST_DB_PATH);

  seedDatabase(database);

  const planner = new TaskPlanner(database);

  const plan = planner.createPlan({
    projectName: "E2E Test Project",
    sourceUrl: "https://example.com",
    requirements: createRequirements(),
  });

  const formExecutor = createMockFormExecutor("FAIL_ACCOUNT_B_TASK_1");

  const executor = new TaskExecutor(database, undefined, formExecutor);

  const report = await executor.executePlan(plan.tasks);

  console.log("");

  console.log(
    `📊 Execution report: ${report.completedTasks} DONE / ${report.failedTasks} FAILED / ${report.skippedTasks} SKIPPED`,
  );

  assert(
    report.totalTasks === 6,
    "Execution report harus berisi 6 total task.",
  );

  assert(report.completedTasks === 4, "Harus ada 4 task DONE.");

  assert(report.failedTasks === 1, "Harus ada 1 task FAILED.");

  assert(
    report.skippedTasks === 1,
    "Harus ada 1 task SKIPPED karena dependency gagal.",
  );

  const accountBResults = report.results.filter(
    (result) => result.accountName === "Account B",
  );

  assert(
    accountBResults.length === 2,
    "Account B harus memiliki 2 execution result.",
  );

  assert(
    accountBResults[0].status === "FAILED",
    "Task pertama Account B harus FAILED.",
  );

  assert(
    accountBResults[1].status === "PENDING",
    "Task kedua Account B harus PENDING karena di-skip akibat dependency gagal.",
  );

  assert(
    accountBResults[1].taskId === null,
    "Task yang di-skip tidak boleh membuat database task.",
  );

  assert(
    accountBResults[1].error !== null,
    "Task yang di-skip harus memiliki alasan dependency.",
  );

  console.log("✅ Account B task 1 FAILED → task 2 SKIPPED.");

  const accountAResults = report.results.filter(
    (result) => result.accountName === "Account A",
  );

  assert(
    accountAResults.every((result) => result.status === "DONE"),
    "Semua task Account A harus tetap DONE.",
  );

  const accountCResults = report.results.filter(
    (result) => result.accountName === "Account C",
  );

  assert(
    accountCResults.every((result) => result.status === "DONE"),
    "Semua task Account C harus tetap DONE.",
  );

  console.log("✅ Kegagalan Account B tidak mengganggu Account A dan C.");

  const db = database.getDb();

  const rows = db
    .prepare(
      `
      SELECT
        t.id,
        t.status,
        t.error,
        t.proof,
        a.name AS account_name
      FROM tasks t
      JOIN accounts a
        ON a.id = t.account_id
      ORDER BY t.id ASC
    `,
    )
    .all() as Array<{
    id: number;
    status: string;
    error: string | null;
    proof: string | null;
    account_name: string;
  }>;

  /*
   * 5 task masuk SQLite:
   *
   * Account A → 2
   * Account B → task 1 saja
   * Account B task 2 → SKIPPED sebelum createDatabaseTask()
   * Account C → 2
   */
  assert(
    rows.length === 5,
    "SQLite harus memiliki 5 task karena task dependency yang skip tidak dibuat.",
  );

  const failedRow = rows.find(
    (row) => row.account_name === "Account B" && row.status === "FAILED",
  );

  assert(
    failedRow !== undefined,
    "SQLite harus memiliki task FAILED untuk Account B.",
  );

  assert(failedRow!.error !== null, "Task FAILED harus memiliki error.");

  assert(failedRow!.proof !== null, "Task FAILED harus memiliki proof.");

  const failedProof = JSON.parse(failedRow!.proof!);

  assert(
    failedProof.executionStatus === "FAILED",
    "Proof task FAILED harus memiliki executionStatus FAILED.",
  );

  assert(
    failedProof.submitSucceeded === false,
    "Proof task FAILED harus memiliki submitSucceeded false.",
  );

  console.log("✅ SQLite menyimpan FAILED + error + proof dengan benar.");

  console.log("");
  console.log("🎉 Case 2 passed.");

  cleanupDatabase();
}

async function main(): Promise<void> {
  try {
    await runSuccessCase();
    await runDependencyFailureCase();

    console.log("");
    console.log("🎉🎉 TaskPlanner → TaskExecutor E2E mock test PASSED.");
    console.log("");
  } finally {
    cleanupDatabase();
  }
}

main().catch((error) => {
  console.error("");
  console.error("❌ E2E test FAILED.");
  console.error(error);
  console.error("");

  cleanupDatabase();
  process.exit(1);
});
