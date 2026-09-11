import { FormFieldType, PlannedForm } from "./task-planner.js";

export type FormExecutionDecision =
  | "READY"
  | "BLOCKED_MISSING_VALUE"
  | "BLOCKED_AMBIGUOUS"
  | "BLOCKED_INVALID";

export interface FormExecutionPlanField {
  index: number;
  type: FormFieldType;
  label: string | null;
  required: boolean;
  value: string | null;
  ready: boolean;
  reason: string;
}

export interface FormExecutionPlan {
  decision: FormExecutionDecision;
  formType: PlannedForm["formType"];
  targetUrl: string;
  fields: FormExecutionPlanField[];
  requiredFields: number;
  readyFields: number;
  missingRequiredFields: number;
  message: string;
}

export class FormExecutionPlanner {
  plan(form: PlannedForm): FormExecutionPlan {
    const targetUrl = form.targetUrl.trim();

    if (!targetUrl) {
      return {
        decision: "BLOCKED_INVALID",
        formType: form.formType,
        targetUrl: form.targetUrl,
        fields: [],
        requiredFields: 0,
        readyFields: 0,
        missingRequiredFields: 0,
        message: "Form tidak valid karena target URL kosong.",
      };
    }

    const fields = form.fields.map((field, index): FormExecutionPlanField => {
      const hasValue = field.value !== null && field.value.trim().length > 0;

      if (field.required && !hasValue) {
        return {
          index,
          type: field.type,
          label: field.label,
          required: true,
          value: field.value,
          ready: false,
          reason: "Required field belum memiliki value.",
        };
      }

      if (!field.required && !hasValue) {
        return {
          index,
          type: field.type,
          label: field.label,
          required: false,
          value: field.value,
          ready: true,
          reason: "Optional field tidak memiliki value dan akan dilewati.",
        };
      }

      return {
        index,
        type: field.type,
        label: field.label,
        required: field.required,
        value: field.value,
        ready: true,
        reason: "Value tersedia dan field siap dieksekusi.",
      };
    });

    const requiredFields = fields.filter((field) => field.required).length;

    const readyFields = fields.filter((field) => field.ready).length;

    const missingRequiredFields = fields.filter(
      (field) => field.required && !field.ready,
    ).length;

    if (missingRequiredFields > 0) {
      const missing = fields
        .filter((field) => field.required && !field.ready)
        .map((field) => `"${field.label ?? field.type}"`)
        .join(", ");

      return {
        decision: "BLOCKED_MISSING_VALUE",
        formType: form.formType,
        targetUrl,
        fields,
        requiredFields,
        readyFields,
        missingRequiredFields,
        message: `Form belum boleh dieksekusi karena required field belum memiliki value: ${missing}.`,
      };
    }

    return {
      decision: "READY",
      formType: form.formType,
      targetUrl,
      fields,
      requiredFields,
      readyFields,
      missingRequiredFields,
      message: "Semua required field memiliki value. Form siap dieksekusi.",
    };
  }
}
