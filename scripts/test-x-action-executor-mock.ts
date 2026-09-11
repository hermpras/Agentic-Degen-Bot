import {
  XActionExecutor,
  XBrowser,
  XBrowserProvider,
} from "../src/tasks/x-action-executor.js";

import { PlannedTask } from "../src/tasks/task-planner.js";

type MockFollowState = "FOLLOW" | "FOLLOWING" | "UNKNOWN";

class MockBrowser implements XBrowser {
  private clickedSelectors: string[] = [];

  constructor(private readonly state: MockFollowState) {}

  async open(url: string) {
    console.log(`🌐 [MockBrowser] Open: ${url}`);

    return {
      url,
      title: "Mock X Page",

      text: this.state === "FOLLOWING" ? "Following" : "Mock X page",
    };
  }

  async elementExists(selector: string): Promise<boolean> {
    console.log(`🔎 [MockBrowser] elementExists: ${selector}`);

    if (
      this.state === "FOLLOW" &&
      selector === 'button[data-testid="followButton"]'
    ) {
      return true;
    }

    if (
      this.state === "FOLLOWING" &&
      selector === 'button[data-testid="unfollowButton"]'
    ) {
      return true;
    }

    return false;
  }

  async click(selector: string): Promise<void> {
    this.clickedSelectors.push(selector);

    console.log(`🖱️ [MockBrowser] Click: ${selector}`);
  }

  async getText(selector: string): Promise<string> {
    console.log(`📄 [MockBrowser] getText: ${selector}`);

    if (selector === "body" && this.state === "FOLLOWING") {
      return "Following";
    }

    return "";
  }

  getCurrentUrl(): string {
    return "http://mock-x.local/profile";
  }

  getClickedSelectors(): string[] {
    return [...this.clickedSelectors];
  }
}

class MockBrowserProvider implements XBrowserProvider {
  readonly browser: MockBrowser;

  constructor(state: MockFollowState) {
    this.browser = new MockBrowser(state);
  }

  async openForAccount(accountId: number): Promise<XBrowser> {
    console.log(`👤 [MockBrowserProvider] Open account ${accountId}`);

    return this.browser;
  }

  async close(): Promise<void> {
    console.log("🌐 [MockBrowserProvider] Close");
  }
}

function createTask(): PlannedTask {
  return {
    planTaskId: "mock-account-1-task-1",

    projectName: "MockProject",

    accountId: 1,

    accountName: "firstAccount",

    twitterHandle: "@mockaccount",

    walletAddress: "0x0000000000000000000000000000000000000000",

    taskType: "X_FOLLOW",

    targetUrl: "http://mock-x.local/profile",

    description: "Follow mock X account.",

    dependsOn: [],

    outputKey: null,

    inputFrom: null,

    form: null,
  };
}

async function testFollow(): Promise<void> {
  console.log("");
  console.log("════════════════════════════════════");
  console.log("1️⃣ Testing FOLLOW");
  console.log("════════════════════════════════════");

  const provider = new MockBrowserProvider("FOLLOW");

  const executor = new XActionExecutor(provider);

  const result = await executor.execute(createTask());

  if (!result.success) {
    throw new Error("FOLLOW seharusnya berhasil.");
  }

  const clickedSelectors = provider.browser.getClickedSelectors();

  if (clickedSelectors.length !== 1) {
    throw new Error(
      `FOLLOW seharusnya melakukan tepat satu click, tetapi mendapat ${clickedSelectors.length}.`,
    );
  }

  const output = JSON.parse(result.output ?? "{}");

  if (output.actionPerformed !== true) {
    throw new Error("FOLLOW seharusnya menghasilkan actionPerformed=true.");
  }

  if (output.alreadyFollowing === true) {
    throw new Error("FOLLOW tidak boleh dianggap sudah following.");
  }

  console.log("✅ FOLLOW test passed.");
}

async function testFollowing(): Promise<void> {
  console.log("");
  console.log("════════════════════════════════════");
  console.log("2️⃣ Testing FOLLOWING");
  console.log("════════════════════════════════════");

  const provider = new MockBrowserProvider("FOLLOWING");

  const executor = new XActionExecutor(provider);

  const result = await executor.execute(createTask());

  if (!result.success) {
    throw new Error("FOLLOWING seharusnya dianggap sukses.");
  }

  const clickedSelectors = provider.browser.getClickedSelectors();

  if (clickedSelectors.length !== 0) {
    throw new Error("FOLLOWING tidak boleh melakukan click.");
  }

  const output = JSON.parse(result.output ?? "{}");

  if (output.actionPerformed !== false) {
    throw new Error("FOLLOWING seharusnya menghasilkan actionPerformed=false.");
  }

  if (output.alreadyFollowing !== true) {
    throw new Error("FOLLOWING seharusnya menghasilkan alreadyFollowing=true.");
  }

  console.log("✅ FOLLOWING test passed.");
}

async function testUnknown(): Promise<void> {
  console.log("");
  console.log("════════════════════════════════════");
  console.log("3️⃣ Testing UNKNOWN");
  console.log("════════════════════════════════════");

  const provider = new MockBrowserProvider("UNKNOWN");

  const executor = new XActionExecutor(provider);

  let failed = false;

  try {
    await executor.execute(createTask());
  } catch (error) {
    failed = true;

    console.log(
      `Expected error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!failed) {
    throw new Error("UNKNOWN seharusnya membatalkan action.");
  }

  const clickedSelectors = provider.browser.getClickedSelectors();

  if (clickedSelectors.length !== 0) {
    throw new Error("UNKNOWN tidak boleh melakukan click.");
  }

  console.log("✅ UNKNOWN test passed.");
}

async function main(): Promise<void> {
  console.log("🧪 XActionExecutor mock integration test");

  await testFollow();

  await testFollowing();

  await testUnknown();

  console.log("");
  console.log("🎉 Semua XActionExecutor mock tests berhasil.");
}

main().catch((error) => {
  console.error("❌ Test gagal:", error);

  process.exit(1);
});
