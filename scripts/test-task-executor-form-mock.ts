import { AgentDatabase } from "../src/database/agent-database.js";
import { FormExecutor } from "../src/tasks/form-executor.js";
import { TaskExecutor } from "../src/tasks/task-executor.js";
import type { PlannedTask } from "../src/tasks/task-planner.js";

class MockBrowser {
  private readonly values = new Map<string, string>();
  private readonly clickedSelectors: string[] = [];
  private readonly openedUrls: string[] = [];

  async open(url: string) {
    console.log(`🌐 [MockBrowser] Open: ${url}`);

    this.openedUrls.push(url);

    return {
      url,
      title: "Mock Whitelist Form",
      text: "Mock whitelist form",
    };
  }

  async getText(selector?: string): Promise<string> {
    console.log(`📄 [MockBrowser] getText: ${selector ?? "<body>"}`);

    return "Mock whitelist form";
  }

  async elementExists(selector: string): Promise<boolean> {
    console.log(`🔎 [MockBrowser] elementExists: ${selector}`);

    return true;
  }

  async fill(selector: string, value: string): Promise<void> {
    console.log(`✍️ [MockBrowser] Fill: ${selector} = ${value}`);

    this.values.set(selector, value);
  }

  async click(selector: string): Promise<void> {
    console.log(`🖱️ [MockBrowser] Click: ${selector}`);

    this.clickedSelectors.push(selector);
  }

  getFilledValues(): Map<string, string> {
    return this.values;
  }

  getClickedSelectors(): string[] {
    return this.clickedSelectors;
  }

  getOpenedUrls(): string[] {
    return this.openedUrls;
  }
}

async function main(): Promise<void> {
  console.log("🧪 TaskExecutor → FormExecutor mock integration test");

  console.log("");

  const database = new AgentDatabase("data/test-task-executor-form.db");

  const db = database.getDb();

  db.exec(`
    DELETE FROM tasks;
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
    .run("Mock Account", "@mock_account", "0x1234567890abcdef");

  const accountId = Number(accountResult.lastInsertRowid);

  console.log(`👤 Mock account created: #${accountId}`);

  const projectResult = db
    .prepare(
      `
      INSERT INTO projects (
        name,
        website_url,
        whitelist_status
      )
      VALUES (?, ?, 'OPEN')
    `,
    )
    .run("Mock Form Project", "http://mock-form.local");

  const projectId = Number(projectResult.lastInsertRowid);

  console.log(`📦 Mock project created: #${projectId}`);

  const mockBrowser = new MockBrowser();

  const formExecutor = new FormExecutor(mockBrowser as any);

  const taskExecutor = new TaskExecutor(database, undefined, formExecutor);

  const task: PlannedTask = {
    planTaskId: "mock-form-task-1",

    projectName: "Mock Form Project",

    accountId,

    accountName: "Mock Account",

    twitterHandle: "@mock_account",

    walletAddress: "0x1234567890abcdef",

    taskType: "FORM",

    targetUrl: "http://mock-form.local/whitelist",

    description: "Fill mock whitelist form",

    dependsOn: [],

    outputKey: null,

    inputFrom: null,

    form: {
      formType: "WEBSITE",

      targetUrl: "http://mock-form.local/whitelist",

      fields: [
        {
          type: "TWITTER_HANDLE",
          label: "Twitter",
          value: "@mock_account",
          required: true,
        },
        {
          type: "WALLET_ADDRESS",
          label: "Wallet",
          value: "0x1234567890abcdef",
          required: true,
        },
      ],

      checkboxes: [
        {
          type: "X_FOLLOW",
          label: "I agree to the whitelist terms",
          checked: true,
        },
      ],
    },
  };

  console.log("");
  console.log("▶️ Executing FORM task...");

  const report = await taskExecutor.executePlan([task]);

  console.log("");
  console.log("📊 Execution report:");

  console.log(JSON.stringify(report, null, 2));

  const result = report.results[0];

  if (!result) {
    throw new Error("Execution report tidak memiliki result.");
  }

  if (result.status !== "DONE") {
    throw new Error(`Expected task status DONE, got ${result.status}`);
  }

  if (result.taskId === null) {
    throw new Error("TaskExecutor tidak menghasilkan database task ID.");
  }

  if (report.totalTasks !== 1) {
    throw new Error(`Expected totalTasks = 1, got ${report.totalTasks}`);
  }

  if (report.completedTasks !== 1) {
    throw new Error(
      `Expected completedTasks = 1, got ${report.completedTasks}`,
    );
  }

  if (report.failedTasks !== 0) {
    throw new Error(`Expected failedTasks = 0, got ${report.failedTasks}`);
  }

  const databaseTask = db
    .prepare(
      `
      SELECT
        id,
        project_id,
        account_id,
        task_type,
        target_url,
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
        project_id: number;
        account_id: number;
        task_type: string;
        target_url: string | null;
        status: string;
        proof: string | null;
        error: string | null;
      }
    | undefined;

  if (!databaseTask) {
    throw new Error(`Database task #${result.taskId} tidak ditemukan.`);
  }

  console.log("");
  console.log("🗄️ Database task:");

  console.log(JSON.stringify(databaseTask, null, 2));

  if (databaseTask.status !== "DONE") {
    throw new Error(
      `Expected database task status DONE, got ${databaseTask.status}`,
    );
  }

  if (databaseTask.error !== null) {
    throw new Error(`Database task memiliki error: ${databaseTask.error}`);
  }

  if (databaseTask.task_type !== "FORM") {
    throw new Error(`Expected task_type FORM, got ${databaseTask.task_type}`);
  }

  if (databaseTask.target_url !== "http://mock-form.local/whitelist") {
    throw new Error(`Target URL salah: ${databaseTask.target_url}`);
  }

  const filledValues = mockBrowser.getFilledValues();

  const twitterValue = filledValues.get('input[aria-label="Twitter"]');

  const walletValue = filledValues.get('input[aria-label="Wallet"]');

  if (twitterValue !== "@mock_account") {
    throw new Error(`Twitter value salah: ${twitterValue}`);
  }

  if (walletValue !== "0x1234567890abcdef") {
    throw new Error(`Wallet value salah: ${walletValue}`);
  }

  const clickedSelectors = mockBrowser.getClickedSelectors();

  if (clickedSelectors.length !== 1) {
    throw new Error(
      `Expected 1 checkbox click, got ${clickedSelectors.length}`,
    );
  }

  if (!clickedSelectors[0].includes("I agree to the whitelist terms")) {
    throw new Error(`Checkbox selector salah: ${clickedSelectors[0]}`);
  }

  if (mockBrowser.getOpenedUrls().length < 1) {
    throw new Error("Form tidak pernah dibuka.");
  }

  console.log("");
  console.log("✅ TaskExecutor → FormExecutor integration test passed.");

  console.log("✅ FORM task routed correctly.");

  console.log("✅ Mock form opened correctly.");

  console.log("✅ Twitter field filled correctly.");

  console.log("✅ Wallet field filled correctly.");

  console.log("✅ Required checkbox clicked.");

  console.log("✅ Database task status = DONE.");

  console.log("✅ Execution report = DONE.");
}

main().catch((error) => {
  console.error("");

  console.error("❌ TaskExecutor → FormExecutor integration test failed.");

  console.error(error);

  process.exit(1);
});
