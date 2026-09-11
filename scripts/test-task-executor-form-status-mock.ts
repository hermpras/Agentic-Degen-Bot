import fs from "fs";

import { AgentDatabase } from "../src/database/agent-database.js";
import { TaskExecutor } from "../src/tasks/task-executor.js";
import { FormExecutor } from "../src/tasks/form-executor.js";
import type {
  PlannedTask,
  PlannedForm,
} from "../src/tasks/task-planner.js";

const dbPath = "data/test-task-executor-form-status.db";

if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

const database = new AgentDatabase(dbPath);

const db = database.getDb();

db.prepare(`
  INSERT INTO projects (
    name,
    website_url,
    whitelist_status
  )
  VALUES (?, ?, ?)
`).run(
  "Status Test Project",
  "https://example.com",
  "OPEN",
);

db.prepare(`
  INSERT INTO accounts (
    name,
    twitter_handle,
    wallet_address,
    status
  )
  VALUES (?, ?, ?, ?)
`).run(
  "Status Test Account",
  "@status_test",
  "0xSTATUS",
  "ACTIVE",
);

const account = db.prepare(`
  SELECT id
  FROM accounts
  WHERE name = ?
`).get("Status Test Account") as {
  id: number;
};

const form: PlannedForm = {
  formType: "WEBSITE",
  targetUrl: "https://example.com/whitelist",
  fields: [
    {
      type: "TWITTER_HANDLE",
      label: "Twitter Username",
      value: "@status_test",
    },
    {
      type: "WALLET_ADDRESS",
      label: "Wallet Address",
      value: "0xSTATUS",
    },
  ],
  checkboxes: [],
  submit: null,
};

function createMockFormExecutor(
  executionStatus: "SUBMITTED" | "FAILED",
): FormExecutor {
  const mock = Object.create(
    FormExecutor.prototype,
  ) as FormExecutor;

  mock.inspectForm = async () => "mock inspection";

  mock.fillForm = async () => {
    const submitSucceeded =
      executionStatus === "SUBMITTED";

    return {
      url: form.targetUrl,
      formType: form.formType,
      fieldsFilled: 2,
      checkboxesChecked: 0,
      submitAttempted: true,
      submitSucceeded,
      message:
        executionStatus === "SUBMITTED"
          ? "Mock form berhasil disubmit."
          : "Mock form submit gagal.",
      proof: {
        version: 1 as const,
        createdAt: new Date().toISOString(),
        url: form.targetUrl,
        formType: form.formType,
        executionStatus,
        submitAttempted: true,
        submitSucceeded,
        fieldsFilled: 2,
        checkboxesChecked: 0,
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
          executionStatus === "SUBMITTED"
            ? "Mock form berhasil disubmit."
            : "Mock form submit gagal.",
      },
    };
  };

  return mock;
}

function createTask(
  planTaskId: string,
): PlannedTask {
  return {
    planTaskId,
    projectName: "Status Test Project",
    accountId: account.id,
    accountName: "Status Test Account",
    twitterHandle: "@status_test",
    walletAddress: "0xSTATUS",
    taskType: "FORM_SUBMIT",
    targetUrl: form.targetUrl,
    description: "Status transition test",
    dependsOn: [],
    outputKey: null,
    inputFrom: null,
    form,
  };
}

async function testSubmitted(): Promise<void> {
  const executor = new TaskExecutor(
    database,
    undefined,
    createMockFormExecutor("SUBMITTED"),
  );

  const result = await executor.executeTask(
    createTask("status-submitted-001"),
  );

  if (result.status !== "DONE") {
    throw new Error(
      `SUBMITTED expected DONE, got ${result.status}`,
    );
  }

  if (result.taskId === null) {
    throw new Error(
      "SUBMITTED result tidak memiliki taskId.",
    );
  }

  const dbTask = db.prepare(`
    SELECT status, proof, error
    FROM tasks
    WHERE id = ?
  `).get(result.taskId) as {
    status: string;
    proof: string | null;
    error: string | null;
  };

  if (dbTask.status !== "DONE") {
    throw new Error(
      `Database SUBMITTED expected DONE, got ${dbTask.status}`,
    );
  }

  if (!dbTask.proof) {
    throw new Error(
      "Database SUBMITTED tidak memiliki proof.",
    );
  }

  const proof = JSON.parse(dbTask.proof);

  if (proof.executionStatus !== "SUBMITTED") {
    throw new Error(
      `Expected proof SUBMITTED, got ${proof.executionStatus}`,
    );
  }

  if (proof.submitSucceeded !== true) {
    throw new Error(
      "Expected submitSucceeded=true.",
    );
  }

  if (dbTask.error !== null) {
    throw new Error(
      `SUBMITTED task memiliki error: ${dbTask.error}`,
    );
  }

  console.log(
    "✅ Case 1 SUBMITTED → DONE passed.",
  );
}

async function testFailed(): Promise<void> {
  const executor = new TaskExecutor(
    database,
    undefined,
    createMockFormExecutor("FAILED"),
  );

  const result = await executor.executeTask(
    createTask("status-failed-001"),
  );

  if (result.status !== "FAILED") {
    throw new Error(
      `FAILED expected FAILED, got ${result.status}`,
    );
  }

  if (result.taskId === null) {
    throw new Error(
      "FAILED result tidak memiliki taskId.",
    );
  }

  const dbTask = db.prepare(`
    SELECT status, proof, error
    FROM tasks
    WHERE id = ?
  `).get(result.taskId) as {
    status: string;
    proof: string | null;
    error: string | null;
  };

  if (dbTask.status !== "FAILED") {
    throw new Error(
      `Database FAILED expected FAILED, got ${dbTask.status}`,
    );
  }

  if (!dbTask.proof) {
    throw new Error(
      "Database FAILED tidak memiliki proof.",
    );
  }

  const proof = JSON.parse(dbTask.proof);

  if (proof.executionStatus !== "FAILED") {
    throw new Error(
      `Expected proof FAILED, got ${proof.executionStatus}`,
    );
  }

  if (proof.submitSucceeded !== false) {
    throw new Error(
      "Expected submitSucceeded=false.",
    );
  }

  if (!dbTask.error) {
    throw new Error(
      "FAILED task seharusnya memiliki error.",
    );
  }

  console.log(
    "✅ Case 2 FAILED → FAILED passed.",
  );
}

async function main(): Promise<void> {
  await testSubmitted();
  await testFailed();

  console.log("");
  console.log(
    "🎉 TaskExecutor form status test passed.",
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "❌ TaskExecutor form status test failed.",
  );
  console.error(
    error instanceof Error
      ? error.message
      : String(error),
  );

  process.exit(1);
});
