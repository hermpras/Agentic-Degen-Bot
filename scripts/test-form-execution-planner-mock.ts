import { FormExecutionPlanner } from "../src/tasks/form-execution-planner.js";
import type { PlannedForm } from "../src/tasks/task-planner.js";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createForm(fields: PlannedForm["fields"]): PlannedForm {
  return {
    formType: "WEBSITE",
    targetUrl: "https://example.com/whitelist",
    fields,
    checkboxes: [],
  };
}

function testReadyForm(): void {
  console.log("");
  console.log("▶️ Test 1: READY form");

  const planner = new FormExecutionPlanner();

  const form = createForm([
    {
      type: "TWITTER_HANDLE",
      label: "Twitter",
      value: "@hermpras",
      required: true,
    },
    {
      type: "WALLET_ADDRESS",
      label: "Wallet",
      value: "0x123456789",
      required: true,
    },
  ]);

  const plan = planner.plan(form);

  console.log(JSON.stringify(plan, null, 2));

  assert(plan.decision === "READY", `Expected READY, got ${plan.decision}`);

  assert(
    plan.requiredFields === 2,
    `Expected 2 required fields, got ${plan.requiredFields}`,
  );

  assert(
    plan.readyFields === 2,
    `Expected 2 ready fields, got ${plan.readyFields}`,
  );

  assert(
    plan.missingRequiredFields === 0,
    `Expected 0 missing fields, got ${plan.missingRequiredFields}`,
  );

  console.log("✅ READY decision benar.");
}

function testMissingRequiredValue(): void {
  console.log("");
  console.log("▶️ Test 2: Missing required value");

  const planner = new FormExecutionPlanner();

  const form = createForm([
    {
      type: "TWITTER_HANDLE",
      label: "Twitter",
      value: "@hermpras",
      required: true,
    },
    {
      type: "WALLET_ADDRESS",
      label: "Wallet",
      value: null,
      required: true,
    },
  ]);

  const plan = planner.plan(form);

  console.log(JSON.stringify(plan, null, 2));

  assert(
    plan.decision === "BLOCKED_MISSING_VALUE",
    `Expected BLOCKED_MISSING_VALUE, got ${plan.decision}`,
  );

  assert(
    plan.missingRequiredFields === 1,
    `Expected 1 missing field, got ${plan.missingRequiredFields}`,
  );

  assert(
    plan.readyFields === 1,
    `Expected 1 ready field, got ${plan.readyFields}`,
  );

  assert(
    plan.message.includes("Wallet"),
    "Expected error message to mention Wallet.",
  );

  console.log("✅ Missing required value berhasil di-block.");
}

function testOptionalMissingValue(): void {
  console.log("");
  console.log("▶️ Test 3: Missing optional value");

  const planner = new FormExecutionPlanner();

  const form = createForm([
    {
      type: "TWITTER_HANDLE",
      label: "Twitter",
      value: "@hermpras",
      required: true,
    },
    {
      type: "EMAIL",
      label: "Email",
      value: null,
      required: false,
    },
  ]);

  const plan = planner.plan(form);

  console.log(JSON.stringify(plan, null, 2));

  assert(plan.decision === "READY", `Expected READY, got ${plan.decision}`);

  assert(
    plan.requiredFields === 1,
    `Expected 1 required field, got ${plan.requiredFields}`,
  );

  assert(
    plan.readyFields === 2,
    `Expected 2 ready fields, got ${plan.readyFields}`,
  );

  assert(
    plan.missingRequiredFields === 0,
    `Expected 0 missing required fields, got ${plan.missingRequiredFields}`,
  );

  console.log("✅ Optional missing value tidak mem-block form.");
}

function testInvalidUrl(): void {
  console.log("");
  console.log("▶️ Test 4: Invalid URL");

  const planner = new FormExecutionPlanner();

  const form: PlannedForm = {
    formType: "WEBSITE",
    targetUrl: "   ",
    fields: [],
    checkboxes: [],
  };

  const plan = planner.plan(form);

  console.log(JSON.stringify(plan, null, 2));

  assert(
    plan.decision === "BLOCKED_INVALID",
    `Expected BLOCKED_INVALID, got ${plan.decision}`,
  );

  console.log("✅ Invalid URL berhasil di-block.");
}

function main(): void {
  console.log("🧪 FormExecutionPlanner mock test");

  testReadyForm();
  testMissingRequiredValue();
  testOptionalMissingValue();
  testInvalidUrl();

  console.log("");
  console.log("🎉 FormExecutionPlanner mock test passed.");
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("❌ FormExecutionPlanner mock test failed.");
  console.error(error);
  process.exit(1);
}
