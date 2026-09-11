import http from "http";
import { AgentDatabase } from "../src/database/agent-database.js";
import { XActionExecutor } from "../src/tasks/x-action-executor.js";
import { PlannedTask } from "../src/tasks/task-planner.js";

const PORT = 3461;

type TestState = "FOLLOW" | "FOLLOWING" | "UNKNOWN";

function startTestServer(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

    const state = url.searchParams.get("state") as TestState | null;

    let content = "";

    if (state === "FOLLOW") {
      content = `
          <button
            data-testid="followButton"
            onclick="
              this.innerText = 'Following';
              this.setAttribute('data-followed', 'true');
            "
          >
            Follow
          </button>

          <p id="result">NOT_FOLLOWED</p>

          <script>
            const button =
              document.querySelector(
                '[data-testid="followButton"]'
              );

            button.addEventListener(
              "click",
              () => {
                document.getElementById(
                  "result"
                ).innerText = "FOLLOWED";
              }
            );
          </script>
        `;
    }

    if (state === "FOLLOWING") {
      content = `
          <button
            data-testid="unfollowButton"
          >
            Following
          </button>

          <p id="result">ALREADY_FOLLOWING</p>
        `;
    }

    if (state === "UNKNOWN") {
      content = `
          <button
            data-testid="otherButton"
          >
            Something Else
          </button>

          <p id="result">UNKNOWN_STATE</p>
        `;
    }

    const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>X Follow Execution Test</title>
          </head>

          <body>
            <h1>X Follow Execution Test</h1>

            <p>
              Test state: ${state}
            </p>

            ${content}
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
    planTaskId: `execute-${state.toLowerCase()}`,

    projectName: "HoodBear",

    accountId: account.id,

    accountName: account.name,

    twitterHandle: account.twitter_handle,

    walletAddress: account.wallet_address,

    taskType: "X_FOLLOW",

    targetUrl: `http://127.0.0.1:${PORT}?state=${state}`,

    description: `Execute X_FOLLOW state: ${state}`,

    dependsOn: [],

    outputKey: null,

    inputFrom: null,

    form: null,
  };
}

async function testFollow(
  executor: XActionExecutor,
  account: {
    id: number;
    name: string;
    twitter_handle: string | null;
    wallet_address: string | null;
  },
): Promise<void> {
  console.log("");
  console.log("1️⃣ Testing FOLLOW → click");

  const task = buildTask(account, "FOLLOW");

  const result = await executor.execute(task);

  console.log(JSON.stringify(result, null, 2));

  if (!result.success) {
    throw new Error("FOLLOW seharusnya berhasil.");
  }

  if (!result.output) {
    throw new Error("FOLLOW berhasil tetapi output kosong.");
  }

  const output = JSON.parse(result.output) as {
    actionPerformed?: boolean;
    state?: string;
  };

  if (output.actionPerformed !== true) {
    throw new Error("FOLLOW seharusnya melakukan click.");
  }

  if (output.state !== "FOLLOW") {
    throw new Error(`Expected state FOLLOW, got ${output.state}`);
  }

  console.log("✅ FOLLOW → click berhasil.");
}

async function testFollowing(
  executor: XActionExecutor,
  account: {
    id: number;
    name: string;
    twitter_handle: string | null;
    wallet_address: string | null;
  },
): Promise<void> {
  console.log("");
  console.log("2️⃣ Testing FOLLOWING → skip click");

  const task = buildTask(account, "FOLLOWING");

  const result = await executor.execute(task);

  console.log(JSON.stringify(result, null, 2));

  if (!result.success) {
    throw new Error("FOLLOWING seharusnya dianggap berhasil.");
  }

  if (!result.output) {
    throw new Error("FOLLOWING berhasil tetapi output kosong.");
  }

  const output = JSON.parse(result.output) as {
    alreadyFollowing?: boolean;
    actionPerformed?: boolean;
    state?: string;
  };

  if (output.alreadyFollowing !== true) {
    throw new Error("FOLLOWING harus ditandai alreadyFollowing=true.");
  }

  if (output.actionPerformed !== false) {
    throw new Error("FOLLOWING tidak boleh melakukan click.");
  }

  if (output.state !== "FOLLOWING") {
    throw new Error(`Expected state FOLLOWING, got ${output.state}`);
  }

  console.log("✅ FOLLOWING → tidak click dan dianggap selesai.");
}

async function testUnknown(
  executor: XActionExecutor,
  account: {
    id: number;
    name: string;
    twitter_handle: string | null;
    wallet_address: string | null;
  },
): Promise<void> {
  console.log("");
  console.log("3️⃣ Testing UNKNOWN → reject action");

  const task = buildTask(account, "UNKNOWN");

  try {
    await executor.execute(task);

    throw new Error("UNKNOWN seharusnya gagal dan tidak melakukan action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.log(`ℹ️ Expected error: ${message}`);

    if (!message.toLowerCase().includes("follow state")) {
      throw new Error(`Error UNKNOWN tidak sesuai: ${message}`);
    }

    console.log("✅ UNKNOWN → action ditolak.");
  }
}

async function main(): Promise<void> {
  console.log("");
  console.log("==========================================");
  console.log("🧪 X Follow Execution Test");
  console.log("==========================================");
  console.log("");

  const server = await startTestServer();

  const account = getAccount();

  console.log(`👤 Account ditemukan: #${account.id} → ${account.name}`);

  const executor = new XActionExecutor();

  try {
    await testFollow(executor, account);

    await testFollowing(executor, account);

    await testUnknown(executor, account);

    console.log("");
    console.log("🎉 X FOLLOW EXECUTION TEST BERHASIL.");

    console.log("✅ FOLLOW → click.");

    console.log("✅ FOLLOWING → skip click.");

    console.log("✅ UNKNOWN → reject action.");
  } finally {
    server.close();

    console.log("");
    console.log("🧹 Test server ditutup.");
  }
}

main().catch((error) => {
  console.error("");
  console.error("❌ X Follow Execution test gagal:");
  console.error(error);
  process.exit(1);
});
