import { ExecutionProofBuilder } from "../src/tasks/execution-proof-builder.js";
import type { FormExecutionPlan } from "../src/tasks/form-execution-planner.js";

function createPlan(): FormExecutionPlan {
  return {
    decision: "READY",
    formType: "WEBSITE",
    targetUrl: "https://example.com/whitelist",
    fields: [
      {
        index: 0,
        type: "TWITTER_HANDLE",
        label: "Twitter Username",
        required: true,
        value: "@testuser",
        ready: true,
        reason: "Value tersedia dan field siap dieksekusi.",
      },
      {
        index: 1,
        type: "WALLET_ADDRESS",
        label: "Wallet Address",
        required: true,
        value: "0x1234567890abcdef",
        ready: true,
        reason: "Value tersedia dan field siap dieksekusi.",
      },
      {
        index: 2,
        type: "EMAIL",
        label: "Email",
        required: false,
        value: null,
        ready: true,
        reason: "Optional field tidak memiliki value dan akan dilewati.",
      },
    ],
    requiredFields: 2,
    readyFields: 3,
    missingRequiredFields: 0,
    message: "Semua required field memiliki value. Form siap dieksekusi.",
  };
}

function main(): void {
  const builder = new ExecutionProofBuilder();
  const plan = createPlan();

  /*
   * Case 1:
   * Form sudah diisi tetapi belum submit.
   */
  const readyProof = builder.build(plan, {
    formType: "WEBSITE",
    url: "https://example.com/whitelist",
    fieldsFilled: 2,
    checkboxesChecked: 1,
    submitAttempted: false,
    submitSucceeded: false,
    message: "Form berhasil diisi tetapi belum disubmit.",
  });

  if (readyProof.executionStatus !== "READY_TO_SUBMIT") {
    throw new Error(
      `Expected READY_TO_SUBMIT, got ${readyProof.executionStatus}`,
    );
  }

  if (readyProof.submitAttempted !== false) {
    throw new Error("Expected submitAttempted=false.");
  }

  if (readyProof.submitSucceeded !== false) {
    throw new Error("Expected submitSucceeded=false.");
  }

  console.log("✅ Case 1 READY_TO_SUBMIT passed.");

  /*
   * Case 2:
   * Submit dilakukan dan berhasil.
   */
  const submittedProof = builder.build(plan, {
    formType: "WEBSITE",
    url: "https://example.com/whitelist/success",
    fieldsFilled: 2,
    checkboxesChecked: 1,
    submitAttempted: true,
    submitSucceeded: true,
    message: "Form berhasil disubmit.",
  });

  if (submittedProof.executionStatus !== "SUBMITTED") {
    throw new Error(
      `Expected SUBMITTED, got ${submittedProof.executionStatus}`,
    );
  }

  if (submittedProof.submitAttempted !== true) {
    throw new Error("Expected submitAttempted=true.");
  }

  if (submittedProof.submitSucceeded !== true) {
    throw new Error("Expected submitSucceeded=true.");
  }

  console.log("✅ Case 2 SUBMITTED passed.");

  /*
   * Case 3:
   * Submit dicoba tetapi hasilnya belum terverifikasi.
   */
  const failedProof = builder.build(plan, {
    formType: "WEBSITE",
    url: "https://example.com/whitelist",
    fieldsFilled: 2,
    checkboxesChecked: 1,
    submitAttempted: true,
    submitSucceeded: false,
    message: "Submit attempt belum berhasil diverifikasi.",
  });

  if (failedProof.executionStatus !== "FAILED") {
    throw new Error(`Expected FAILED, got ${failedProof.executionStatus}`);
  }

  if (failedProof.submitAttempted !== true) {
    throw new Error("Expected submitAttempted=true.");
  }

  if (failedProof.submitSucceeded !== false) {
    throw new Error("Expected submitSucceeded=false.");
  }

  console.log("✅ Case 3 FAILED passed.");

  /*
   * Case 4:
   * Pastikan field proof tetap benar.
   */
  if (submittedProof.fieldsFilled !== 2) {
    throw new Error("Expected fieldsFilled=2.");
  }

  if (submittedProof.checkboxesChecked !== 1) {
    throw new Error("Expected checkboxesChecked=1.");
  }

  if (submittedProof.fields.length !== 3) {
    throw new Error("Expected 3 proof fields.");
  }

  if (submittedProof.fields[0].status !== "FILLED") {
    throw new Error("Expected Twitter field to be FILLED.");
  }

  if (submittedProof.fields[1].status !== "FILLED") {
    throw new Error("Expected wallet field to be FILLED.");
  }

  if (submittedProof.fields[2].status !== "SKIPPED") {
    throw new Error("Expected optional email field to be SKIPPED.");
  }

  console.log("✅ Case 4 field proof persistence passed.");

  console.log("\n🎉 ExecutionProofBuilder test passed.");
}

main();
