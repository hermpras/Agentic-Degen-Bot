import { AgentDatabase } from "../src/database/agent-database.js";
import {
  TaskExecutor,
  type TaskExecutionReport,
} from "../src/tasks/task-executor.js";
import {
  XActionExecutor,
  type XBrowser,
  type XBrowserProvider,
} from "../src/tasks/x-action-executor.js";
import type { PlannedTask } from "../src/tasks/task-planner.js";

class MockXBrowser implements XBrowser {
  private currentUrl = "";

  public clickCount = 0;

  async open(url: string): Promise<{
    url: string;
    title: string;
    text: string;
  }> {
    this.currentUrl = url;

    console.log(`🌐 [MockBrowser] Open: ${url}`);

    return {
      url,
      title: "Mock X Profile",
      text: "Mock X profile page",
    };
  }

  async elementExists(selector: string): Promise<boolean> {
    console.log(`🔎 [MockBrowser] elementExists: ${selector}`);

    return selector === 'button[data-testid="followButton"]';
  }

  async click(selector: string): Promise<void> {
    this.clickCount += 1;

    console.log(`🖱️ [MockBrowser] Click: ${selector}`);
  }

  async getText(selector: string): Promise<string> {
    console.log(`📄 [MockBrowser] getText: ${selector}`);

    return "Mock X profile page";
  }

  getCurrentUrl(): string {
    return this.currentUrl;
  }
}

class MockXBrowserProvider implements XBrowserProvider {
  public readonly browser = new MockXBrowser();

  public openedAccountId: number | null = null;

  public closeCount = 0;

  async openForAccount(accountId: number): Promise<XBrowser> {
    this.openedAccountId = accountId;

    console.log(`👤 [MockBrowserProvider] Open account ${accountId}`);

    return this.browser;
  }

  async close(): Promise<void> {
    this.closeCount += 1;

    console.log("🔒 [MockBrowserProvider] Close");
  }
}

async function main(): Promise<void> {
  console.log("");
  console.log("🧪 TaskExecutor → XActionExecutor mock integration test");
  console.log("");

  const database = new AgentDatabase("data/test-task-executor-x-follow.db");

  const db = database.getDb();

  db.exec(`
    DELETE FROM tasks;
    DELETE FROM eligibility_checks;
    DELETE FROM watchlist;
    DELETE FROM projects;
    DELETE FROM accounts;
  `);

  const accountResult = db
    .prepare(
      `
      INSERT INTO accounts (
        name,
        twitter_handle,
        wallet_address,
        status
      )
      VALUES (?, ?, ?, 'ACTIVE')
      `,
    )
    .run("Mock Account", "@mockaccount", "0xMockWallet");

  const accountId = Number(accountResult.lastInsertRowid);

  const projectResult = db
    .prepare(
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
    )
    .run(
      "Mock X Project",
      "http://mock-project.local",
      "http://mock-x.local/project",
    );

  const projectId = Number(projectResult.lastInsertRowid);

  console.log(`👤 Mock account created: #${accountId}`);

  console.log(`📦 Mock project created: #${projectId}`);

  const plannedTask: PlannedTask = {
    planTaskId: "mock-x-follow-1",

    projectName: "Mock X Project",

    accountId,

    accountName: "Mock Account",

    twitterHandle: "@mockaccount",

    walletAddress: "0xMockWallet",

    taskType: "X_FOLLOW",

    targetUrl: "http://mock-x.local/profile",

    description: "Follow mock X profile",

    dependsOn: [],

    outputKey: null,

    inputFrom: null,

    form: null,
  };

  const mockProvider = new MockXBrowserProvider();

  const xActionExecutor = new XActionExecutor(mockProvider);

  const executor = new TaskExecutor(database, xActionExecutor);

  console.log("");
  console.log("▶️ Executing X_FOLLOW task...");

  const report: TaskExecutionReport = await executor.executePlan([plannedTask]);

  console.log("");
  console.log("📊 Execution report:");

  console.log(JSON.stringify(report, null, 2));

  if (report.results.length !== 1) {
    throw new Error(
      `Expected 1 execution result, got ${report.results.length}.`,
    );
  }

  const result = report.results[0];

  if (!result) {
    throw new Error("Execution result tidak ditemukan.");
  }

  if (result.taskId === null) {
    throw new Error("Execution result tidak memiliki database taskId.");
  }

  const storedTask = db
    .prepare(
      `
      SELECT
        id,
        status,
        proof,
        error
      FROM tasks
      WHERE id = ?
      `,
    )
    .get(result.taskId) as
    | {
        id: number;
        status: string;
        proof: string | null;
        error: string | null;
      }
    | undefined;

  if (!storedTask) {
    throw new Error(`Task #${result.taskId} tidak ditemukan di database.`);
  }

  if (mockProvider.openedAccountId !== accountId) {
    throw new Error(
      `Account yang dibuka salah. Expected ${accountId}, got ${mockProvider.openedAccountId}.`,
    );
  }

  if (mockProvider.browser.clickCount !== 1) {
    throw new Error(
      `Expected 1 click, got ${mockProvider.browser.clickCount}.`,
    );
  }

  if (mockProvider.closeCount !== 1) {
    throw new Error(
      `Expected browser close 1x, got ${mockProvider.closeCount}.`,
    );
  }

  if (storedTask.status !== "DONE") {
    throw new Error(`Expected DB task status DONE, got ${storedTask.status}.`);
  }

  if (storedTask.error !== null) {
    throw new Error(`Expected DB task error null, got ${storedTask.error}.`);
  }

  if (report.completedTasks !== 1) {
    throw new Error(
      `Expected completedTasks = 1, got ${report.completedTasks}.`,
    );
  }

  if (report.failedTasks !== 0) {
    throw new Error(`Expected failedTasks = 0, got ${report.failedTasks}.`);
  }

  if (report.skippedTasks !== 0) {
    throw new Error(`Expected skippedTasks = 0, got ${report.skippedTasks}.`);
  }

  if (result.status !== "DONE") {
    throw new Error(`Expected execution result DONE, got ${result.status}.`);
  }

  if (result.projectName !== "Mock X Project") {
    throw new Error(
      `Expected projectName "Mock X Project", got ${result.projectName}.`,
    );
  }

  if (result.accountName !== "Mock Account") {
    throw new Error(
      `Expected accountName "Mock Account", got ${result.accountName}.`,
    );
  }

  if (result.taskType !== "X_FOLLOW") {
    throw new Error(`Expected taskType X_FOLLOW, got ${result.taskType}.`);
  }

  console.log("");

  console.log("✅ TaskExecutor → XActionExecutor integration test passed.");

  console.log("✅ X_FOLLOW routed correctly.");

  console.log("✅ Mock account opened correctly.");

  console.log("✅ Follow button clicked exactly once.");

  console.log("✅ Browser closed correctly.");

  console.log(`✅ Database task #${result.taskId} status = DONE.`);

  console.log("✅ Execution report = DONE.");

  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("❌ Integration test failed.");
  console.error(error);
  process.exit(1);
});
