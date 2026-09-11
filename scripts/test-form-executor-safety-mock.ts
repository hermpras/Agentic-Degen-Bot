import { FormExecutor } from "../src/tasks/form-executor.js";
import { FormInspector } from "../src/tasks/form-inspector.js";
import { FieldMapper } from "../src/tasks/field-mapper.js";
import type { PlannedForm } from "../src/tasks/task-planner.js";

class MockBrowser {
  private readonly filled: Array<{
    selector: string;
    value: string;
  }> = [];

  private readonly openedUrls: string[] = [];

  async open(url: string) {
    console.log(`🌐 [MockBrowser] Open: ${url}`);

    this.openedUrls.push(url);

    return {
      url,
      title: "Mock Safety Form",
      text: "Mock safety form",
    };
  }

  async getPageResult() {
    return {
      url: this.openedUrls.at(-1) ?? "http://mock-form.local/safety",
      title: "Mock Safety Form",
      text: "Mock safety form",
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
          name: "primary_wallet",
          id: "primary-wallet",
          label: "Primary Wallet Address",
          placeholder: "0x...",
          ariaLabel: null,
          required: true,
        },
        {
          index: 1,
          kind: "INPUT",
          type: "text",
          name: "backup_wallet",
          id: "backup-wallet",
          label: "Backup Wallet Address",
          placeholder: "0x...",
          ariaLabel: null,
          required: false,
        },
      ] as T;
    }

    if (script.includes('input[type="checkbox"]')) {
      return [] as T;
    }

    throw new Error("MockBrowser menerima script evaluate yang tidak dikenal.");
  }

  async elementExists(selector: string): Promise<boolean> {
    console.log(`🔎 [MockBrowser] elementExists: ${selector}`);

    return false;
  }

  async fill(selector: string, value: string): Promise<void> {
    console.log(`🚨 [MockBrowser] UNEXPECTED FILL: ${selector} = ${value}`);

    this.filled.push({
      selector,
      value,
    });
  }

  async click(selector: string): Promise<void> {
    console.log(`🖱️ [MockBrowser] Click: ${selector}`);
  }

  getFilled(): Array<{
    selector: string;
    value: string;
  }> {
    return this.filled;
  }
}

async function main(): Promise<void> {
  console.log("🧪 FormExecutor safety / ambiguity mock test");

  const browser = new MockBrowser();

  const inspector = new FormInspector(browser as any);

  const mapper = new FieldMapper();

  const executor = new FormExecutor(browser as any, inspector, mapper);

  const form: PlannedForm = {
    formType: "WEBSITE",
    targetUrl: "http://mock-form.local/safety",

    fields: [
      {
        type: "WALLET_ADDRESS",
        label: "Wallet",
        value: "0xSHOULD_NOT_BE_FILLED",
        required: true,
      },
    ],

    checkboxes: [],
  };

  console.log("");
  console.log("▶️ Attempting to execute ambiguous form...");

  let failedAsExpected = false;

  try {
    await executor.fillForm(form);
  } catch (error) {
    failedAsExpected = true;

    const message = error instanceof Error ? error.message : String(error);

    console.log("");
    console.log("🛑 Execution stopped as expected:");

    console.log(message);

    if (!message.includes("ambigu")) {
      throw new Error(`Expected ambiguity error, got: ${message}`);
    }
  }

  if (!failedAsExpected) {
    throw new Error("Expected FormExecutor untuk STOP karena field ambigu.");
  }

  const filled = browser.getFilled();

  console.log("");
  console.log("✍️ Fill operations:");

  console.log(JSON.stringify(filled, null, 2));

  if (filled.length !== 0) {
    throw new Error(
      `Safety failure: expected 0 fill operations, got ${filled.length}`,
    );
  }

  console.log("");
  console.log("✅ Ambiguous wallet mapping terdeteksi.");

  console.log("✅ FormExecutor menghentikan eksekusi.");

  console.log("✅ Tidak ada field yang di-fill.");

  console.log("✅ Tidak ada fallback heuristic yang dijalankan.");

  console.log("");
  console.log("🎉 FormExecutor safety / ambiguity test passed.");
}

main().catch((error) => {
  console.error("");
  console.error("❌ FormExecutor safety / ambiguity test failed.");
  console.error(error);
  process.exit(1);
});
