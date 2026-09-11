import assert from "node:assert/strict";
import { FormExecutor } from "../src/tasks/form-executor.js";
import { BrowserExecutor } from "../src/browser/browser-executor.js";
import { TaskPlanner } from "../src/tasks/task-planner.js";
import { AgentDatabase } from "../src/database/agent-database.js";

interface MockPageResult {
  url: string;
  title: string;
  text: string;
}

class MockBrowserExecutor {
  private currentUrl = "https://example.com/form";

  private readonly fields = [
    {
      index: 0,
      kind: "INPUT",
      type: "text",
      name: "twitter",
      id: "twitter-input",
      label: "Twitter",
      placeholder: "Twitter",
      ariaLabel: "Twitter",
      required: true,
      selector: 'input[aria-label="Twitter"]',
    },
  ];

  constructor(
    private readonly pageText: string,
    private readonly successSelectorExists: boolean,
  ) {}

  async start(): Promise<void> {}

  async open(_url: string): Promise<MockPageResult> {
    return this.getPageResult();
  }

  async getPageResult(): Promise<MockPageResult> {
    return {
      url: this.currentUrl,
      title: "Mock Form",
      text: this.pageText,
    };
  }

  async elementExists(selector: string): Promise<boolean> {
    if (selector === ".success-message") {
      return this.successSelectorExists;
    }

    if (selector === "#submit-button") {
      return true;
    }

    return this.fields.some((field) => field.selector === selector);
  }

  async click(_selector: string): Promise<void> {}

  async fill(_selector: string, _value: string): Promise<void> {}

  async press(_selector: string, _key: string): Promise<void> {}

  async getText(_selector: string): Promise<string> {
    return "";
  }

  async getAttribute(
    _selector: string,
    _attribute: string,
  ): Promise<string | null> {
    return null;
  }

  async evaluate<T>(script: string): Promise<T> {
    const normalizedScript = script.trim();

    if (normalizedScript.includes("document.querySelectorAll")) {
      return this.fields as T;
    }

    return undefined as T;
  }

  async getCurrentUrl(): Promise<string> {
    return this.currentUrl;
  }

  async saveStorageState(_path: string): Promise<void> {}

  async screenshot(_path: string): Promise<void> {}

  async close(): Promise<void> {}
}

function createPlanner(): TaskPlanner {
  const database = new AgentDatabase("data/test-form-submit-verification.db");

  const db = database.getDb();

  db.exec(`
    DELETE FROM tasks;
    DELETE FROM eligibility_checks;
    DELETE FROM watchlist;
    DELETE FROM projects;
    DELETE FROM accounts;
  `);

  db.prepare(
    `
    INSERT INTO accounts (
      name,
      twitter_handle,
      wallet_address,
      status
    )
    VALUES (?, ?, ?, 'ACTIVE')
  `,
  ).run("Verification Test Account", "@verification_test", "0xVERIFICATION");

  db.prepare(
    `
    INSERT INTO projects (
      name,
      website_url,
      whitelist_status
    )
    VALUES (?, ?, 'UNKNOWN')
  `,
  ).run("Verification Test Project", "https://example.com");

  return new TaskPlanner(database);
}

function createForm(submit: {
  selector?: string;
  label?: string;
  successSelector?: string;
  successText?: string;
}) {
  const planner = createPlanner();

  const plan = planner.createPlan({
    projectName: "Verification Test Project",
    sourceUrl: "https://example.com",
    requirements: [
      {
        type: "FORM_SUBMIT",
        description: "Submit verification test form",
        form: {
          formType: "WEBSITE",
          targetUrl: "https://example.com/form",
          fields: [
            {
              type: "TWITTER_HANDLE",
              label: "Twitter",
              required: true,
            },
          ],
          submit,
        },
      },
    ],
  });

  const task = plan.tasks[0];

  assert.ok(task.form);

  return task.form;
}

async function runCase(
  name: string,
  browser: MockBrowserExecutor,
  form: ReturnType<typeof createForm>,
  expectedSucceeded: boolean,
  expectedStatus: "SUBMITTED" | "FAILED",
): Promise<void> {
  const executor = new FormExecutor(browser as unknown as BrowserExecutor);

  const result = await executor.fillForm(form);

  assert.equal(
    result.submitAttempted,
    true,
    `${name}: submitAttempted harus true`,
  );

  assert.equal(
    result.submitSucceeded,
    expectedSucceeded,
    `${name}: submitSucceeded tidak sesuai`,
  );

  assert.equal(
    result.proof?.executionStatus,
    expectedStatus,
    `${name}: executionStatus tidak sesuai`,
  );

  console.log(`✅ ${name} passed.`);
}

async function main(): Promise<void> {
  console.log("🧪 FormExecutor submit verification mock test");

  // Case 1:
  // successSelector ditemukan → SUBMITTED
  {
    const form = createForm({
      selector: "#submit-button",
      successSelector: ".success-message",
    });

    const browser = new MockBrowserExecutor(
      "Form submitted successfully.",
      true,
    );

    await runCase(
      "Case 1 successSelector ditemukan → SUBMITTED",
      browser,
      form,
      true,
      "SUBMITTED",
    );
  }

  // Case 2:
  // successText ditemukan → SUBMITTED
  {
    const form = createForm({
      selector: "#submit-button",
      successText: "Thank you for participating",
    });

    const browser = new MockBrowserExecutor(
      "Thank you for participating! Your submission has been received.",
      false,
    );

    await runCase(
      "Case 2 successText ditemukan → SUBMITTED",
      browser,
      form,
      true,
      "SUBMITTED",
    );
  }

  // Case 3:
  // Tidak ada selector/text verification yang cocok → FAILED
  {
    const form = createForm({
      selector: "#submit-button",
      successSelector: ".success-message",
      successText: "Submission successful",
    });

    const browser = new MockBrowserExecutor(
      "Something went wrong. Please try again.",
      false,
    );

    await runCase(
      "Case 3 verification gagal → FAILED",
      browser,
      form,
      false,
      "FAILED",
    );
  }

  console.log("🎉 FormExecutor submit verification test passed.");
}

main().catch((error) => {
  console.error("❌ Test failed.");
  console.error(error);
  process.exit(1);
});
