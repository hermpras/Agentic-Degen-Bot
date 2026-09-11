import { FormExecutor } from "../src/tasks/form-executor.js";
import { FormInspector } from "../src/tasks/form-inspector.js";
import type { PlannedForm } from "../src/tasks/task-planner.js";

class MockBrowser {
  private readonly filled: Array<{
    selector: string;
    value: string;
  }> = [];

  private readonly clicked: string[] = [];

  private readonly openedUrls: string[] = [];

  async open(url: string) {
    console.log(`🌐 [MockBrowser] Open: ${url}`);

    this.openedUrls.push(url);

    return {
      url,
      title: "Mock Structured Form",
      text: "Mock structured form",
    };
  }

  async getPageResult() {
    return {
      url: this.openedUrls.at(-1) ?? "http://mock-form.local/whitelist",
      title: "Mock Structured Form",
      text: "Mock structured form",
    };
  }

  async evaluate<T>(script: string): Promise<T> {
    console.log(`🧪 [MockBrowser] evaluate() called (${script.length} chars)`);

    if (
      script.includes(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])',
      )
    ) {
      return [
        {
          index: 0,
          kind: "INPUT",
          type: "text",
          name: "twitter",
          id: "twitter-input",
          label: "Twitter Username",
          placeholder: "@username",
          ariaLabel: null,
          required: true,
        },
        {
          index: 1,
          kind: "INPUT",
          type: "text",
          name: "wallet",
          id: "wallet-input",
          label: "Wallet Address",
          placeholder: "0x...",
          ariaLabel: null,
          required: true,
        },
      ] as T;
    }

    if (script.includes('input[type="checkbox"]')) {
      return [
        {
          index: 0,
          name: "terms",
          id: "terms-checkbox",
          label: "I agree to the whitelist terms",
          ariaLabel: null,
          checked: false,
        },
      ] as T;
    }

    throw new Error("MockBrowser menerima script evaluate yang tidak dikenal.");
  }

  async elementExists(selector: string): Promise<boolean> {
    console.log(`🔎 [MockBrowser] elementExists: ${selector}`);

    return false;
  }

  async fill(selector: string, value: string): Promise<void> {
    console.log(`✍️ [MockBrowser] Fill: ${selector} = ${value}`);

    this.filled.push({
      selector,
      value,
    });
  }

  async click(selector: string): Promise<void> {
    console.log(`🖱️ [MockBrowser] Click: ${selector}`);

    this.clicked.push(selector);
  }

  getFilled(): Array<{
    selector: string;
    value: string;
  }> {
    return this.filled;
  }

  getClicked(): string[] {
    return this.clicked;
  }

  getOpenedUrls(): string[] {
    return this.openedUrls;
  }
}

async function main(): Promise<void> {
  console.log("🧪 FormExecutor → FormInspector integration mock test");

  console.log("");

  const browser = new MockBrowser();

  const inspector = new FormInspector(browser as any);

  const executor = new FormExecutor(browser as any, inspector);

  const form: PlannedForm = {
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
  };

  console.log("");
  console.log("▶️ Executing form...");

  const result = await executor.fillForm(form);

  console.log("");
  console.log("📊 Execution result:");

  console.log(JSON.stringify(result, null, 2));

  if (result.fieldsFilled !== 2) {
    throw new Error(`Expected fieldsFilled = 2, got ${result.fieldsFilled}`);
  }

  if (result.checkboxesChecked !== 1) {
    throw new Error(
      `Expected checkboxesChecked = 1, got ${result.checkboxesChecked}`,
    );
  }

  const filled = browser.getFilled();

  console.log("");
  console.log("✍️ Filled fields:");

  console.log(JSON.stringify(filled, null, 2));

  if (filled.length !== 2) {
    throw new Error(`Expected 2 fill operations, got ${filled.length}`);
  }

  const twitter = filled.find((entry) => entry.value === "@mock_account");

  if (!twitter) {
    throw new Error("Twitter field tidak berhasil diisi.");
  }

  if (twitter.selector !== "#twitter-input") {
    throw new Error(
      `Twitter menggunakan selector yang salah: ${twitter.selector}`,
    );
  }

  const wallet = filled.find((entry) => entry.value === "0x1234567890abcdef");

  if (!wallet) {
    throw new Error("Wallet field tidak berhasil diisi.");
  }

  if (wallet.selector !== "#wallet-input") {
    throw new Error(
      `Wallet menggunakan selector yang salah: ${wallet.selector}`,
    );
  }

  if (filled.some((entry) => entry.selector.includes('name*="twitter"'))) {
    throw new Error("Twitter masih menggunakan fallback heuristic selector.");
  }

  if (filled.some((entry) => entry.selector.includes('name*="wallet"'))) {
    throw new Error("Wallet masih menggunakan fallback heuristic selector.");
  }

  const clicked = browser.getClicked();

  console.log("");
  console.log("☑️ Clicked selectors:");

  console.log(JSON.stringify(clicked, null, 2));

  if (clicked.length !== 1) {
    throw new Error(`Expected 1 checkbox click, got ${clicked.length}`);
  }

  if (clicked[0] !== "#terms-checkbox") {
    throw new Error(`Checkbox menggunakan selector yang salah: ${clicked[0]}`);
  }

  if (browser.getOpenedUrls().length < 1) {
    throw new Error("Form tidak pernah dibuka.");
  }

  console.log("");
  console.log("✅ FormExecutor → FormInspector integration test passed.");

  console.log("✅ Structured inspection digunakan.");

  console.log("✅ Twitter diisi menggunakan selector hasil inspection.");

  console.log("✅ Wallet diisi menggunakan selector hasil inspection.");

  console.log("✅ Checkbox diisi menggunakan selector hasil inspection.");

  console.log("✅ Fallback heuristic tidak digunakan.");
}

main().catch((error) => {
  console.error("");
  console.error("❌ FormExecutor → FormInspector integration test failed.");

  console.error(error);

  process.exit(1);
});
