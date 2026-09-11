import { ExecutionProofBuilder } from "../src/tasks/execution-proof-builder.js";
import { FormExecutionPlanner } from "../src/tasks/form-execution-planner.js";

const planner = new FormExecutionPlanner();
const proofBuilder = new ExecutionProofBuilder();

const plan = planner.plan({
  formType: "WEBSITE",
  targetUrl: "https://example.com/whitelist",
  fields: [
    {
      type: "TWITTER_HANDLE",
      label: "Twitter Username",
      required: true,
      value: "@testuser",
    },
    {
      type: "WALLET_ADDRESS",
      label: "Wallet Address",
      required: true,
      value: "0x1234567890abcdef",
    },
    {
      type: "EMAIL",
      label: "Email",
      required: false,
      value: null,
    },
  ],
});

if (plan.decision !== "READY") {
  throw new Error(`Expected READY plan, got ${plan.decision}`);
}

const result = {
  formType: "WEBSITE" as const,
  url: "https://example.com/whitelist",
  fieldsFilled: 2,
  checkboxesChecked: 1,
  submitAttempted: false,
  message: "Form berhasil diisi tetapi belum disubmit.",
};

const proof = proofBuilder.build(plan, result);

console.log("📋 Execution proof:");
console.log(proofBuilder.toJson(proof));

if (proof.version !== 1) {
  throw new Error("Proof version harus 1.");
}

if (proof.executionStatus !== "READY_TO_SUBMIT") {
  throw new Error(`Expected READY_TO_SUBMIT, got ${proof.executionStatus}`);
}

if (proof.fieldsFilled !== 2) {
  throw new Error(`Expected 2 filled fields, got ${proof.fieldsFilled}`);
}

if (proof.checkboxesChecked !== 1) {
  throw new Error(
    `Expected 1 checked checkbox, got ${proof.checkboxesChecked}`,
  );
}

if (proof.submitAttempted !== false) {
  throw new Error("Submit seharusnya belum dilakukan.");
}

if (proof.fields.length !== 3) {
  throw new Error(`Expected 3 proof fields, got ${proof.fields.length}`);
}

const twitterField = proof.fields.find(
  (field) => field.type === "TWITTER_HANDLE",
);

const walletField = proof.fields.find(
  (field) => field.type === "WALLET_ADDRESS",
);

const emailField = proof.fields.find((field) => field.type === "EMAIL");

if (!twitterField || twitterField.status !== "FILLED") {
  throw new Error("Twitter field seharusnya berstatus FILLED.");
}

if (!walletField || walletField.status !== "FILLED") {
  throw new Error("Wallet field seharusnya berstatus FILLED.");
}

if (!emailField || emailField.status !== "SKIPPED") {
  throw new Error("Optional email field seharusnya berstatus SKIPPED.");
}

console.log("🎉 ExecutionProof mock test passed.");
