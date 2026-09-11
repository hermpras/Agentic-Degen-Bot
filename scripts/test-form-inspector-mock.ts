import { FormInspector } from "../src/tasks/form-inspector.js";

class MockBrowser {
  async getPageResult() {
    return {
      url: "http://mock-form.local/whitelist",
      title: "Mock Whitelist Form",
      text: "Mock whitelist form",
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
        {
          index: 2,
          kind: "TEXTAREA",
          type: null,
          name: "reason",
          id: "reason-input",
          label: "Why do you want to join?",
          placeholder: "Tell us why...",
          ariaLabel: null,
          required: false,
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
        {
          index: 1,
          name: "newsletter",
          id: "newsletter-checkbox",
          label: "Subscribe to newsletter",
          ariaLabel: null,
          checked: true,
        },
      ] as T;
    }

    throw new Error("MockBrowser menerima script evaluate yang tidak dikenal.");
  }
}

async function main(): Promise<void> {
  console.log("🧪 FormInspector mock test");
  console.log("");

  const browser = new MockBrowser();

  const inspector = new FormInspector(browser as any);

  const result = await inspector.inspect();

  console.log("");
  console.log("📋 Inspection result:");
  console.log(JSON.stringify(result, null, 2));

  if (result.url !== "http://mock-form.local/whitelist") {
    throw new Error(`URL salah: ${result.url}`);
  }

  if (result.title !== "Mock Whitelist Form") {
    throw new Error(`Title salah: ${result.title}`);
  }

  if (result.fields.length !== 3) {
    throw new Error(`Expected 3 fields, got ${result.fields.length}`);
  }

  if (result.fields[0]?.label !== "Twitter Username") {
    throw new Error("Twitter field tidak terdeteksi dengan benar.");
  }

  if (result.fields[0]?.required !== true) {
    throw new Error("Twitter field seharusnya required.");
  }

  if (result.fields[1]?.name !== "wallet") {
    throw new Error("Wallet field tidak terdeteksi dengan benar.");
  }

  if (result.fields[2]?.kind !== "TEXTAREA") {
    throw new Error("Textarea tidak terdeteksi dengan benar.");
  }

  if (result.checkboxes.length !== 2) {
    throw new Error(`Expected 2 checkboxes, got ${result.checkboxes.length}`);
  }

  if (result.checkboxes[0]?.label !== "I agree to the whitelist terms") {
    throw new Error("Terms checkbox tidak terdeteksi dengan benar.");
  }

  if (result.checkboxes[0]?.checked !== false) {
    throw new Error("Terms checkbox seharusnya unchecked.");
  }

  if (result.checkboxes[1]?.checked !== true) {
    throw new Error("Newsletter checkbox seharusnya checked.");
  }

  if (!result.fields[0]?.selector.includes("#twitter-input")) {
    throw new Error(`Selector Twitter salah: ${result.fields[0]?.selector}`);
  }

  if (!result.fields[1]?.selector.includes("#wallet-input")) {
    throw new Error(`Selector Wallet salah: ${result.fields[1]?.selector}`);
  }

  if (!result.checkboxes[0]?.selector.includes("#terms-checkbox")) {
    throw new Error(
      `Selector checkbox salah: ${result.checkboxes[0]?.selector}`,
    );
  }

  if (!result.summary.includes("Fields: 3")) {
    throw new Error("Summary tidak mencantumkan jumlah fields.");
  }

  if (!result.summary.includes("Checkboxes: 2")) {
    throw new Error("Summary tidak mencantumkan jumlah checkboxes.");
  }

  console.log("");
  console.log("✅ FormInspector mock test passed.");
  console.log("✅ Fields detected correctly.");
  console.log("✅ Required state detected correctly.");
  console.log("✅ Textarea detected correctly.");
  console.log("✅ Checkboxes detected correctly.");
  console.log("✅ Selectors generated correctly.");
  console.log("✅ Summary generated correctly.");
}

main().catch((error) => {
  console.error("");
  console.error("❌ FormInspector mock test failed.");
  console.error(error);
  process.exit(1);
});
