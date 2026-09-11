import http from "http";
import { AgentDatabase } from "../src/database/agent-database.js";
import { XActionExecutor } from "../src/tasks/x-action-executor.js";
import { PlannedTask } from "../src/tasks/task-planner.js";

const PORT = 3460;

type TestState = "FOLLOW" | "FOLLOWING" | "UNKNOWN";

function startTestServer(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

    const state = url.searchParams.get("state") as TestState | null;

    let button = "";

    if (state === "FOLLOW") {
      button = `
          <button
            data-testid="followButton"
          >
            Follow
          </button>
        `;
    }

    if (state === "FOLLOWING") {
      button = `
          <button
            data-testid="unfollowButton"
          >
            Following
          </button>
        `;
    }

    if (state === "UNKNOWN") {
      button = `
          <button
            data-testid="otherButton"
          >
            Something Else
          </button>
        `;
    }

    const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>X Follow Inspection Test</title>
          </head>

          <body>
            <h1>X Follow Inspection Test</h1>

            <p>
              Test state: ${state}
            </p>

            ${button}
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

function getAccount(): {
  id: number;
  name: string;
  twitter_handle: string | null;
  wallet_address: string | null;
} {
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
    throw new Error("Account ID 1 tidak ditemukan di database.");
  }

  return account;
}

function buildTask(
  account: {
    id: number;
    name: string;
    twitter_handle: string | null;
    wallet_address: string | null;
  },
  state: TestState,
): PlannedTask {
  return {
    planTaskId: `inspection-${state.toLowerCase()}`,

    projectName: "HoodBear",

    accountId: account.id,

    accountName: account.name,

    twitterHandle: account.twitter_handle,

    walletAddress: account.wallet_address,

    taskType: "X_FOLLOW",

    targetUrl: `http://127.0.0.1:${PORT}?state=${state}`,

    description: `Inspect X follow state: ${state}`,

    dependsOn: [],

    outputKey: null,

    inputFrom: null,

    form: null,
  };
}

async function runInspectionTest(
  executor: XActionExecutor,
  account: {
    id: number;
    name: string;
    twitter_handle: string | null;
    wallet_address: string | null;
  },
  state: TestState,
  expectedState: TestState,
): Promise<void> {
  console.log("");
  console.log(`🔎 Testing state: ${state}`);

  const task = buildTask(account, state);

  const result = await executor.inspectFollow(task);

  console.log(JSON.stringify(result, null, 2));

  if (result.state !== expectedState) {
    throw new Error(`Expected state ${expectedState}, got ${result.state}`);
  }

  if (result.accountId !== account.id) {
    throw new Error(`Expected account ${account.id}, got ${result.accountId}`);
  }

  console.log(`✅ ${state} → ${result.state}`);
}

async function main(): Promise<void> {
  console.log("");
  console.log("==========================================");
  console.log("🧪 X Follow Inspection Test");
  console.log("==========================================");
  console.log("");

  const server = await startTestServer();

  const account = getAccount();

  console.log(`👤 Account ditemukan: #${account.id} → ${account.name}`);

  const executor = new XActionExecutor();

  try {
    await runInspectionTest(executor, account, "FOLLOW", "FOLLOW");

    await runInspectionTest(executor, account, "FOLLOWING", "FOLLOWING");

    await runInspectionTest(executor, account, "UNKNOWN", "UNKNOWN");

    console.log("");
    console.log("🎉 X FOLLOW INSPECTION TEST BERHASIL.");

    console.log("✅ FOLLOW berhasil terdeteksi.");

    console.log("✅ FOLLOWING berhasil terdeteksi.");

    console.log("✅ UNKNOWN berhasil terdeteksi.");

    console.log("✅ Account-aware browser tetap digunakan.");
  } finally {
    server.close();

    console.log("");
    console.log("🧹 Test server ditutup.");
  }
}

main().catch((error) => {
  console.error("");
  console.error("❌ X Follow Inspection test gagal:");
  console.error(error);
  process.exit(1);
});
