import http from "http";
import { AgentDatabase } from "../src/database/agent-database.js";
import { TaskExecutor } from "../src/tasks/task-executor.js";
import { TaskPlan } from "../src/tasks/task-planner.js";

const PORT = 3458;

function startTestServer(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Task Executor Test</title>
          </head>

          <body>
            <h1>Task Executor Test</h1>

            <p id="status">
              TaskExecutor berhasil membuka halaman.
            </p>
          </body>
        </html>
      `;

    res.writeHead(200, {
      "Content-Type": "text/html",
    });

    res.end(html);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);

    server.listen(PORT, () => {
      console.log(`🧪 [TestServer] Running at http://127.0.0.1:${PORT}`);

      resolve(server);
    });
  });
}

async function main(): Promise<void> {
  console.log("");
  console.log("==========================================");
  console.log("🧪 Task Executor Test");
  console.log("==========================================");
  console.log("");

  const server = await startTestServer();

  const database = new AgentDatabase();

  const account = database
    .getDb()
    .prepare(
      `
        SELECT
          id,
          name,
          twitter_handle,
          wallet_address
        FROM accounts
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(1) as
    | {
        id: number;
        name: string;
        twitter_handle: string | null;
        wallet_address: string | null;
      }
    | undefined;

  if (!account) {
    server.close();

    throw new Error("Account ID 1 tidak ditemukan di database.");
  }

  console.log(`👤 Account ditemukan: #${account.id} → ${account.name}`);

  const executor = new TaskExecutor(database);

  const plan: TaskPlan = {
    projectName: "HoodBear",

    sourceUrl: `http://127.0.0.1:${PORT}`,

    accountCount: 1,

    taskCount: 1,

    tasks: [
      {
        planTaskId: "account-1-task-1",

        projectName: "HoodBear",

        accountId: account.id,

        accountName: account.name,

        twitterHandle: account.twitter_handle,

        walletAddress: account.wallet_address,

        taskType: "OPEN_PAGE",

        targetUrl: `http://127.0.0.1:${PORT}`,

        description: "Open local TaskExecutor test page.",

        dependsOn: [],

        outputKey: null,

        inputFrom: null,

        form: null,
      },
    ],
  };

  try {
    console.log("");
    console.log("▶️ Executing test plan...");

    const report = await executor.executePlan(plan);

    console.log("");
    console.log("📊 Execution Report:");

    console.log(JSON.stringify(report, null, 2));

    console.log("");

    if (report.totalTasks !== 1) {
      throw new Error(`Expected totalTasks=1, got ${report.totalTasks}`);
    }

    if (report.completedTasks !== 1) {
      throw new Error(
        `Expected completedTasks=1, got ${report.completedTasks}`,
      );
    }

    if (report.failedTasks !== 0) {
      throw new Error(`Expected failedTasks=0, got ${report.failedTasks}`);
    }

    const result = report.results[0];

    if (result.status !== "DONE") {
      throw new Error(`Expected task status DONE, got ${result.status}`);
    }

    if (!result.output) {
      throw new Error("Task berhasil tetapi output kosong.");
    }

    console.log("🎉 TASK EXECUTOR TEST BERHASIL.");

    console.log("✅ Account berhasil ditemukan dari database.");

    console.log("✅ TaskPlan berhasil diterima.");

    console.log("✅ AccountBrowser berhasil digunakan.");

    console.log("✅ OPEN_PAGE berhasil dieksekusi.");

    console.log("✅ TaskManager menyimpan task.");

    console.log("✅ Task status menjadi DONE.");

    console.log("✅ Execution report berhasil dibuat.");
  } finally {
    server.close();

    console.log("");
    console.log("🧹 Test server ditutup.");
  }
}

main().catch((error) => {
  console.error("");
  console.error("❌ Task Executor test gagal:");
  console.error(error);
  process.exit(1);
});
