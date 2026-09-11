import { FormExecutor } from "../src/tasks/form-executor.js";
import type { PlannedForm } from "../src/tasks/task-planner.js";

class MockBrowser {
  private readonly values = new Map<string, string>();
  private readonly clickedSelectors: string[] = [];

  async open(url: string) {
    console.log(`🌐 [MockBrowser] Open: ${url}`);

    return {
      url,
      title: "Mock Form",
      text: "Mock whitelist form",
    };
  }

  async getText(selector?: string): Promise<string> {
    console.log(`📄 [MockBrowser] getText: ${selector ?? "<body>"}`);

    return "Mock whitelist form";
  }

  async fill(selector: string, value: string): Promise<void> {
    console.log(`✍️ [MockBrowser] Fill: ${selector} = ${value}`);

    this.values.set(selector, value);
  }

  async click(selector: string): Promise<void> {
    console.log(`🖱️ [MockBrowser] Click: ${selector}`);

    this.clickedSelectors.push(selector);
  }

  async elementExists(selector: string): Promise<boolean> {
    console.log(`🔎 [MockBrowser] elementExists: ${selector}`);

    return true;
  }

  getFilledValues(): Map<string, string> {
    return this.values;
  }

  getClickedSelectors(): string[] {
    return this.clickedSelectors;
  }
}

async function main(): Promise<void> {
  console.log("🧪 FormExecutor mock integration test");
  console.log("");

  const browser = new MockBrowser();

  const formExecutor = new FormExecutor(browser as any);

  const form: PlannedForm = {
    formType: "WEBSITE",
    targetUrl: "http://mock-form.local/whitelist",

    fields: [
      {
        fieldType: "TWITTER_HANDLE",
        label: "Twitter",
        value: "@mock_account",
        required: true,
      },
      {
        fieldType: "WALLET_ADDRESS",
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
  };

  console.log("▶️ Opening form...");

  await formExecutor.openForm(form);

  console.log("");
  console.log("▶️ Filling form...");

  const result = await formExecutor.fillForm(form);

  console.log("");
  console.log("📊 Form execution result:");

  console.log(JSON.stringify(result, null, 2));

  console.log("");
  console.log("📋 Browser state:");

  console.log("Filled values:", Object.fromEntries(browser.getFilledValues()));

  console.log("Clicked selectors:", browser.getClickedSelectors());

  if (result.fieldsFilled !== 2) {
    throw new Error(`Expected 2 fields filled, got ${result.fieldsFilled}`);
  }

  if (result.checkboxesChecked !== 1) {
    throw new Error(
      `Expected 1 checkbox checked, got ${result.checkboxesChecked}`,
    );
  }

  if (result.submitAttempted) {
    throw new Error("FormExecutor seharusnya belum mencoba submit.");
  }

  const filledValues = browser.getFilledValues();

  const twitterValue = [...filledValues.entries()].find(
    ([selector]) =>
      selector.includes("twitter") || selector.includes("Twitter"),
  );

  const walletValue = [...filledValues.entries()].find(
    ([selector]) => selector.includes("wallet") || selector.includes("Wallet"),
  );

  if (!twitterValue) {
    throw new Error("Twitter field tidak ditemukan di browser state.");
  }

  if (twitterValue[1] !== "@mock_account") {
    throw new Error(`Twitter value salah: ${twitterValue[1]}`);
  }

  if (!walletValue) {
    throw new Error("Wallet field tidak ditemukan di browser state.");
  }

  if (walletValue[1] !== "0x1234567890abcdef") {
    throw new Error(`Wallet value salah: ${walletValue[1]}`);
  }

  if (browser.getClickedSelectors().length !== 1) {
    throw new Error(
      `Expected 1 checkbox click, got ${browser.getClickedSelectors().length}`,
    );
  }

  console.log("");
  console.log("✅ FormExecutor mock integration test passed.");
  console.log("✅ Twitter field filled correctly.");
  console.log("✅ Wallet field filled correctly.");
  console.log("✅ Required checkbox clicked.");
  console.log("✅ Submit was not attempted.");
}

main().catch((error) => {
  console.error("");
  console.error("❌ FormExecutor mock integration test failed.");
  console.error(error);

  process.exit(1);
});
