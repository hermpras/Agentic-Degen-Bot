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
      title: "Mock Auto Mapping Form",
      text: "Mock auto mapping form",
    };
  }

  async getPageResult() {
    return {
      url: this.openedUrls.at(-1) ?? "http://mock-form.local/auto-mapping",
      title: "Mock Auto Mapping Form",
      text: "Mock auto mapping form",
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
          name: "x_username",
          id: "x-username",
          label: "X Username",
          placeholder: "@username",
          ariaLabel: null,
          required: true,
        },
        {
          index: 1,
          kind: "INPUT",
          type: "text",
          name: "evm_address",
          id: "evm-address",
          label: "EVM Address",
          placeholder: "0x...",
          ariaLabel: null,
          required: true,
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
    console.log(`✍️ [MockBrowser] Fill: ${selector} = ${value}`);

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

  getOpenedUrls(): string[] {
    return this.openedUrls;
  }
}

async function main(): Promise<void> {
  console.log("🧪 FormExecutor → FieldMapper integration mock test");

  console.log("");

  const browser = new MockBrowser();

  const inspector = new FormInspector(browser as any);

  const mapper = new FieldMapper();

  const executor = new FormExecutor(browser as any, inspector, mapper);

  /*
   * Sengaja menggunakan label planner yang TIDAK sama
   * dengan label website.
   *
   * Planner:
   *   Twitter
   *   Wallet
   *
   * Website:
   *   X Username
   *   EVM Address
   *
   * Jadi integration test ini benar-benar memaksa
   * FormExecutor menggunakan FieldMapper.
   */
  const form: PlannedForm = {
    formType: "WEBSITE",
    targetUrl: "http://mock-form.local/auto-mapping",

    fields: [
      {
        type: "TWITTER_HANDLE",
        label: "Twitter",
        value: "@auto_account",
        required: true,
      },
      {
        type: "WALLET_ADDRESS",
        label: "Wallet",
        value: "0xabcdef1234567890",
        required: true,
      },
    ],

    checkboxes: [],
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

  const filled = browser.getFilled();

  console.log("");
  console.log("✍️ Filled fields:");

  console.log(JSON.stringify(filled, null, 2));

  if (filled.length !== 2) {
    throw new Error(`Expected 2 fill operations, got ${filled.length}`);
  }

  const twitter = filled.find((entry) => entry.value === "@auto_account");

  if (!twitter) {
    throw new Error("Twitter field tidak berhasil diisi.");
  }

  if (twitter.selector !== "#x-username") {
    throw new Error(
      `Twitter menggunakan selector yang salah: ${twitter.selector}`,
    );
  }

  const wallet = filled.find((entry) => entry.value === "0xabcdef1234567890");

  if (!wallet) {
    throw new Error("Wallet field tidak berhasil diisi.");
  }

  if (wallet.selector !== "#evm-address") {
    throw new Error(
      `Wallet menggunakan selector yang salah: ${wallet.selector}`,
    );
  }

  /*
   * Pastikan fallback heuristic tidak digunakan.
   */
  if (filled.some((entry) => entry.selector.includes('name*="twitter"'))) {
    throw new Error("Twitter masih menggunakan fallback heuristic.");
  }

  if (filled.some((entry) => entry.selector.includes('name*="wallet"'))) {
    throw new Error("Wallet masih menggunakan fallback heuristic.");
  }

  if (browser.getOpenedUrls().length !== 1) {
    throw new Error("Form tidak dibuka tepat satu kali.");
  }

  console.log("");

  console.log("✅ Planner label berbeda dari website label.");

  console.log("✅ X Username berhasil dikenali sebagai TWITTER_HANDLE.");

  console.log("✅ EVM Address berhasil dikenali sebagai WALLET_ADDRESS.");

  console.log("✅ FormExecutor menggunakan selector hasil inspection.");

  console.log("✅ Fallback heuristic tidak digunakan.");

  console.log("");

  console.log("🎉 FormExecutor → FieldMapper integration test passed.");
}

main().catch((error) => {
  console.error("");

  console.error("❌ FormExecutor → FieldMapper integration test failed.");

  console.error(error);

  process.exit(1);
});
