import { BrowserExecutor } from "../src/browser/browser-executor.js";
import { FormExecutor } from "../src/tasks/form-executor.js";
import { FormExecutionPlanner } from "../src/tasks/form-execution-planner.js";
import { ExecutionProofBuilder } from "../src/tasks/execution-proof-builder.js";
import { PlannedForm } from "../src/tasks/task-planner.js";

class MockBrowserExecutor extends BrowserExecutor {
  public clickedSelectors: string[] = [];
  public evaluatedScripts: string[] = [];

  private mockUrl = "https://example.com/whitelist";

  constructor() {
    super({
      headless: true,
    });
  }

  override async open(url: string): Promise<{
    url: string;
    title: string;
    text: string;
  }> {
    this.mockUrl = url;

    return {
      url,
      title: "Mock Whitelist Form",
      text: "Mock whitelist form",
    };
  }

  override async elementExists(selector: string): Promise<boolean> {
    return selector === "#submit";
  }

  override async click(selector: string): Promise<void> {
    this.clickedSelectors.push(selector);
  }

  override async fill(_selector: string, _value: string): Promise<void> {
    // Mock only.
  }

  override async getPageResult(): Promise<{
    url: string;
    title: string;
    text: string;
  }> {
    return {
      url: this.mockUrl,
      title: "Mock Whitelist Form",
      text: "Mock whitelist form",
    };
  }

  override async evaluate<T>(script: string): Promise<T> {
    this.evaluatedScripts.push(script);

    const expectedLabel = "submit application";

    if (script.includes(expectedLabel)) {
      return [
        {
          index: 0,
          text: "Submit Application",
          ariaLabel: "",
        },
      ] as T;
    }

    return [] as T;
  }
}

function createBaseForm(): PlannedForm {
  return {
    formType: "WEBSITE",
    targetUrl: "https://example.com/whitelist",
    fields: [],
    checkboxes: [],
    submit: null,
  };
}

async function main(): Promise<void> {
  /*
   * CASE 1
   *
   * submit = null
   * Harus berhenti READY_TO_SUBMIT.
   * Tidak boleh ada click.
   */
  {
    const browser = new MockBrowserExecutor();

    const executor = new FormExecutor(
      browser,
      undefined,
      undefined,
      undefined,
      new FormExecutionPlanner(),
      new ExecutionProofBuilder(),
    );

    const form = createBaseForm();

    const result = await executor.fillForm(form);

    if (result.submitAttempted) {
      throw new Error("Case 1 gagal: submitAttempted seharusnya false.");
    }

    if (result.submitSucceeded) {
      throw new Error("Case 1 gagal: submitSucceeded seharusnya false.");
    }

    if (browser.clickedSelectors.length !== 0) {
      throw new Error("Case 1 gagal: tidak boleh ada click.");
    }

    if (result.proof.executionStatus !== "READY_TO_SUBMIT") {
      throw new Error("Case 1 gagal: proof seharusnya READY_TO_SUBMIT.");
    }

    console.log("✅ Case 1 submit=null passed.");
  }

  /*
   * CASE 2
   *
   * Explicit selector.
   */
  {
    const browser = new MockBrowserExecutor();

    const executor = new FormExecutor(
      browser,
      undefined,
      undefined,
      undefined,
      new FormExecutionPlanner(),
      new ExecutionProofBuilder(),
    );

    const form = createBaseForm();

    form.submit = {
      selector: "#submit",
      label: null,
    };

    const result = await executor.fillForm(form);

    if (!result.submitAttempted) {
      throw new Error("Case 2 gagal: submitAttempted seharusnya true.");
    }

    if (!result.submitSucceeded) {
      throw new Error("Case 2 gagal: submitSucceeded seharusnya true.");
    }

    if (
      browser.clickedSelectors.length !== 1 ||
      browser.clickedSelectors[0] !== "#submit"
    ) {
      throw new Error(
        `Case 2 gagal: click tidak sesuai. Actual=${JSON.stringify(
          browser.clickedSelectors,
        )}`,
      );
    }

    if (result.proof.executionStatus !== "SUBMITTED") {
      throw new Error("Case 2 gagal: proof seharusnya SUBMITTED.");
    }

    console.log("✅ Case 2 explicit selector passed.");
  }

  /*
   * CASE 3
   *
   * Explicit label dengan satu kandidat.
   */
  {
    const browser = new MockBrowserExecutor();

    const executor = new FormExecutor(
      browser,
      undefined,
      undefined,
      undefined,
      new FormExecutionPlanner(),
      new ExecutionProofBuilder(),
    );

    const form = createBaseForm();

    form.submit = {
      selector: null,
      label: "Submit Application",
    };

    const result = await executor.fillForm(form);

    if (!result.submitAttempted) {
      throw new Error("Case 3 gagal: submitAttempted seharusnya true.");
    }

    if (!result.submitSucceeded) {
      throw new Error("Case 3 gagal: submitSucceeded seharusnya true.");
    }

    if (browser.clickedSelectors.length !== 1) {
      throw new Error("Case 3 gagal: seharusnya tepat satu click.");
    }

    if (!browser.clickedSelectors[0].includes("nth=0")) {
      throw new Error(
        `Case 3 gagal: selector hasil label tidak sesuai: ${browser.clickedSelectors[0]}`,
      );
    }

    if (result.proof.executionStatus !== "SUBMITTED") {
      throw new Error("Case 3 gagal: proof seharusnya SUBMITTED.");
    }

    console.log("✅ Case 3 unique label passed.");
  }

  /*
   * CASE 4
   *
   * Label ambigu.
   *
   * Mock mengembalikan dua kandidat.
   * Tidak boleh ada click.
   */
  {
    const browser = new MockBrowserExecutor();

    browser.evaluate = async <T>(_script: string): Promise<T> => {
      return [
        {
          index: 0,
          text: "Submit Application",
          ariaLabel: "",
        },
        {
          index: 1,
          text: "Submit Application",
          ariaLabel: "",
        },
      ] as T;
    };

    const executor = new FormExecutor(
      browser,
      undefined,
      undefined,
      undefined,
      new FormExecutionPlanner(),
      new ExecutionProofBuilder(),
    );

    const form = createBaseForm();

    form.submit = {
      selector: null,
      label: "Submit Application",
    };

    let errorMessage = "";

    try {
      await executor.fillForm(form);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    if (!errorMessage) {
      throw new Error("Case 4 gagal: ambiguity seharusnya throw error.");
    }

    if (!errorMessage.includes("ambigu")) {
      throw new Error(`Case 4 gagal: error bukan ambiguity: ${errorMessage}`);
    }

    if (browser.clickedSelectors.length !== 0) {
      throw new Error("Case 4 gagal: tombol ambigu tidak boleh diklik.");
    }

    console.log("✅ Case 4 ambiguous label safety passed.");
  }

  console.log("\n🎉 FormExecutor submit mock test passed.");
}

main().catch((error) => {
  console.error("\n❌ FormExecutor submit mock test failed.");
  console.error(error);
  process.exit(1);
});
