import http from "http";
import { AgentDatabase } from "../src/database/agent-database.js";
import { XActionExecutor } from "../src/tasks/x-action-executor.js";
import { PlannedTask } from "../src/tasks/task-planner.js";

const PORT = 3459;

function startTestServer(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>X Action Executor Test</title>
          </head>

          <body>
            <h1>X Action Executor Test</h1>

            <button
              data-testid="followButton"
              onclick="
                this.innerText = 'Following';
                this.setAttribute('data-followed', 'true');
              "
            >
              Follow
            </button>
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
  console.log("🧪 X Action Executor Test");
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

  const task: PlannedTask = {
    planTaskId: "account-1-x-follow-test",

    projectName: "HoodBear",

    accountId: account.id,

    accountName: account.name,

    twitterHandle: account.twitter_handle,

    walletAddress: account.wallet_address,

    taskType: "X_FOLLOW",

    targetUrl: `http://127.0.0.1:${PORT}`,

    description: "Test X_FOLLOW action using local test page.",

    dependsOn: [],

    outputKey: null,

    inputFrom: null,

    form: null,
  };

  const executor = new XActionExecutor();

  try {
    console.log("");
    console.log("▶️ Executing X_FOLLOW test...");

    const result = await executor.execute(task);

    console.log("");
    console.log("📊 X Action Result:");

    console.log(JSON.stringify(result, null, 2));

    console.log("");

    if (!result.success) {
      throw new Error("X_FOLLOW executor mengembalikan success=false.");
    }

    if (result.action !== "X_FOLLOW") {
      throw new Error(`Expected X_FOLLOW, got ${result.action}`);
    }

    if (result.accountId !== account.id) {
      throw new Error(
        `Expected account ${account.id}, got ${result.accountId}`,
      );
    }

    if (!result.output) {
      throw new Error("X_FOLLOW berhasil tetapi output kosong.");
    }

    console.log("🎉 X ACTION EXECUTOR TEST BERHASIL.");

    console.log("✅ Account berhasil ditemukan.");

    console.log("✅ AccountBrowser berhasil digunakan.");

    console.log("✅ X_FOLLOW berhasil dijalankan.");

    console.log("✅ Output action berhasil dibuat.");
  } finally {
    server.close();

    console.log("");
    console.log("🧹 Test server ditutup.");
  }
}

main().catch((error) => {
  console.error("");
  console.error("❌ X Action Executor test gagal:");
  console.error(error);
  process.exit(1);
});
