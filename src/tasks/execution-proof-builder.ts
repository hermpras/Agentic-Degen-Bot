import { FormExecutionPlan } from "./form-execution-planner.js";
import { FormExecutionResult } from "./form-executor.js";

export interface ExecutionProofField {
  index: number;
  type: string;
  label: string | null;
  valueProvided: boolean;
  status: "FILLED" | "SKIPPED";
}

export interface ExecutionProof {
  version: 1;
  createdAt: string;
  url: string;
  formType: FormExecutionPlan["formType"];
  executionStatus: "READY_TO_SUBMIT" | "FAILED";
  submitAttempted: boolean;
  fieldsFilled: number;
  checkboxesChecked: number;
  fields: ExecutionProofField[];
  summary: string;
}

export class ExecutionProofBuilder {
  build(plan: FormExecutionPlan, result: FormExecutionResult): ExecutionProof {
    const fields: ExecutionProofField[] = plan.fields.map((field) => ({
      index: field.index,
      type: field.type,
      label: field.label,
      valueProvided: field.value !== null && field.value.trim().length > 0,
      status:
        field.value !== null && field.value.trim().length > 0
          ? "FILLED"
          : "SKIPPED",
    }));

    const executionStatus = result.submitAttempted
      ? "FAILED"
      : "READY_TO_SUBMIT";

    const summary =
      executionStatus === "READY_TO_SUBMIT"
        ? [
            "Form berhasil diisi.",
            `${result.fieldsFilled} field terisi.`,
            `${result.checkboxesChecked} checkbox dicentang.`,
            "Submit belum dilakukan.",
          ].join(" ")
        : [
            "Form execution memiliki indikasi kegagalan.",
            `${result.fieldsFilled} field terisi.`,
            `${result.checkboxesChecked} checkbox dicentang.`,
            "Submit attempt tercatat.",
          ].join(" ");

    return {
      version: 1,
      createdAt: new Date().toISOString(),
      url: result.url,
      formType: result.formType,
      executionStatus,
      submitAttempted: result.submitAttempted,
      fieldsFilled: result.fieldsFilled,
      checkboxesChecked: result.checkboxesChecked,
      fields,
      summary,
    };
  }

  buildBlocked(plan: FormExecutionPlan, reason: string): ExecutionProof {
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      url: plan.targetUrl,
      formType: plan.formType,
      executionStatus: "FAILED",
      submitAttempted: false,
      fieldsFilled: 0,
      checkboxesChecked: 0,
      fields: plan.fields.map((field) => ({
        index: field.index,
        type: field.type,
        label: field.label,
        valueProvided: field.value !== null && field.value.trim().length > 0,
        status: "SKIPPED",
      })),
      summary: reason,
    };
  }

  toJson(proof: ExecutionProof): string {
    return JSON.stringify(proof, null, 2);
  }
}
