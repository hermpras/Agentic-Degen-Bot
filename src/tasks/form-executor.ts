import { BrowserExecutor } from "../browser/browser-executor.js";
import {
  FormInspector,
  InspectedCheckbox,
  InspectedField,
} from "./form-inspector.js";
import {
  FormFieldType,
  PlannedForm,
  PlannedFormCheckbox,
  PlannedFormSubmit,
} from "./task-planner.js";
import { FieldMapper } from "./field-mapper.js";
import {
  FieldMappingResolver,
  FieldMappingResolution,
} from "./field-mapping-resolver.js";
import {
  FormExecutionPlanner,
  FormExecutionPlan,
} from "./form-execution-planner.js";
import {
  ExecutionProof,
  ExecutionProofBuilder,
} from "./execution-proof-builder.js";

export interface FormExecutionResult {
  formType: PlannedForm["formType"];
  url: string;
  fieldsFilled: number;
  checkboxesChecked: number;
  submitAttempted: boolean;
  submitSucceeded: boolean;
  message: string;
  proof: ExecutionProof;
}

export class FormExecutor {
  private readonly inspector?: FormInspector;
  private readonly mapper?: FieldMapper;
  private readonly resolver?: FieldMappingResolver;
  private readonly executionPlanner: FormExecutionPlanner;
  private readonly proofBuilder: ExecutionProofBuilder;

  constructor(
    private readonly browser: BrowserExecutor,
    inspector?: FormInspector,
    mapper?: FieldMapper,
    resolver?: FieldMappingResolver,
    executionPlanner?: FormExecutionPlanner,
    proofBuilder?: ExecutionProofBuilder,
  ) {
    this.inspector = inspector;
    this.mapper = mapper;

    this.resolver =
      resolver ?? (mapper ? new FieldMappingResolver(mapper) : undefined);

    this.executionPlanner = executionPlanner ?? new FormExecutionPlanner();

    this.proofBuilder = proofBuilder ?? new ExecutionProofBuilder();
  }

  async openForm(form: PlannedForm): Promise<string> {
    if (!form.targetUrl.trim()) {
      throw new Error("Target URL form tidak boleh kosong.");
    }

    const result = await this.browser.open(form.targetUrl);

    console.log(`📝 [FormExecutor] Form opened: ${result.url}`);
    console.log(`📝 [FormExecutor] Form title: ${result.title}`);

    return result.text;
  }

  async inspectForm(form: PlannedForm): Promise<string> {
    await this.openForm(form);

    if (this.inspector) {
      const inspection = await this.inspector.inspect();

      return inspection.summary;
    }

    const pageText = await this.browser.getPageResult();

    return pageText.text.slice(0, 5000);
  }

  async fillForm(form: PlannedForm): Promise<FormExecutionResult> {
    const executionPlan = this.executionPlanner.plan(form);

    this.logExecutionPlan(executionPlan);

    if (executionPlan.decision !== "READY") {
      throw new Error(executionPlan.message);
    }

    await this.openForm(form);

    let fieldsFilled = 0;
    let checkboxesChecked = 0;

    let inspectedFields: InspectedField[] = [];
    let inspectedCheckboxes: InspectedCheckbox[] = [];

    if (this.inspector) {
      const inspection = await this.inspector.inspect();

      inspectedFields = inspection.fields;
      inspectedCheckboxes = inspection.checkboxes;

      console.log(
        `🔎 [FormExecutor] Using structured inspection: ${inspectedFields.length} fields, ${inspectedCheckboxes.length} checkboxes.`,
      );
    }

    const usedFieldIndexes = new Set<number>();

    for (const field of form.fields) {
      if (field.value === null) {
        if (field.required) {
          throw new Error(
            `Field "${field.type}" membutuhkan value tetapi value belum tersedia.`,
          );
        }

        continue;
      }

      const inspectedField = await this.resolveField(
        field.type,
        field.label,
        inspectedFields,
        usedFieldIndexes,
      );

      if (inspectedField) {
        await this.fillInspectedField(inspectedField, field.value);

        usedFieldIndexes.add(inspectedField.index);
      } else {
        await this.fillField(field.type, field.label, field.value);
      }

      fieldsFilled++;
    }

    for (const checkbox of form.checkboxes) {
      if (!checkbox.checked) {
        continue;
      }

      const inspectedCheckbox = this.findMatchingCheckbox(
        checkbox,
        inspectedCheckboxes,
      );

      if (inspectedCheckbox) {
        await this.browser.click(inspectedCheckbox.selector);

        console.log(
          `☑️ [FormExecutor] Checked ${checkbox.type} using inspected selector ${inspectedCheckbox.selector}`,
        );
      } else {
        await this.checkCheckbox(checkbox);
      }

      checkboxesChecked++;
    }

    console.log(
      `📝 [FormExecutor] Form filled: ${fieldsFilled} fields, ${checkboxesChecked} checkboxes.`,
    );

    /*
     * Tidak ada konfigurasi submit.
     * Form berhenti di READY_TO_SUBMIT.
     */
    if (!form.submit) {
      const resultWithoutProof = {
        formType: form.formType,
        url: form.targetUrl,
        fieldsFilled,
        checkboxesChecked,
        submitAttempted: false,
        submitSucceeded: false,
        message: "Form berhasil diisi tetapi submit belum dikonfigurasi.",
      };

      const proof = this.proofBuilder.build(executionPlan, resultWithoutProof);

      console.log(
        `🧾 [FormExecutor] Execution proof created: ${proof.summary}`,
      );

      return {
        ...resultWithoutProof,
        proof,
      };
    }

    /*
     * Submit dikonfigurasi secara eksplisit.
     */
    const submitResult = await this.submitForm(form.submit);

    const resultWithoutProof = {
      formType: form.formType,
      url: submitResult.url,
      fieldsFilled,
      checkboxesChecked,
      submitAttempted: true,
      submitSucceeded: submitResult.succeeded,
      message: submitResult.message,
    };

    const proof = this.proofBuilder.build(executionPlan, resultWithoutProof);

    console.log(`🧾 [FormExecutor] Execution proof created: ${proof.summary}`);

    return {
      ...resultWithoutProof,
      proof,
    };
  }

  private async submitForm(submit: PlannedFormSubmit): Promise<{
    url: string;
    succeeded: boolean;
    message: string;
  }> {
    const selector = submit.selector?.trim() || null;
    const label = submit.label?.trim() || null;

    if (!selector && !label) {
      throw new Error(
        "Submit form tidak valid: selector atau label wajib tersedia.",
      );
    }

    /*
     * Mode A: explicit selector.
     *
     * Selector diberikan langsung oleh planner.
     * Kita tidak melakukan auto-detection.
     */
    if (selector) {
      const exists = await this.browser.elementExists(selector);

      if (!exists) {
        throw new Error(`Submit selector tidak ditemukan: ${selector}`);
      }

      console.log(
        `🚀 [FormExecutor] Submitting using explicit selector: ${selector}`,
      );

      await this.browser.click(selector);

      const pageResult = await this.browser.getPageResult();

      return {
        url: pageResult.url,
        succeeded: true,
        message:
          "Submit berhasil diklik menggunakan explicit selector. Hasil halaman tercatat untuk verifikasi.",
      };
    }

    /*
     * Mode B: explicit label.
     *
     * Kita hanya menerima tombol dengan label yang
     * benar-benar sama setelah normalisasi.
     */
    const normalizedLabel = this.normalizeText(label);

    if (!normalizedLabel) {
      throw new Error("Submit label tidak boleh kosong.");
    }

    const submitSelector =
      await this.findUniqueSubmitButtonByLabel(normalizedLabel);

    console.log(
      `🚀 [FormExecutor] Submitting using explicit label: "${label}"`,
    );

    await this.browser.click(submitSelector);

    const pageResult = await this.browser.getPageResult();

    return {
      url: pageResult.url,
      succeeded: true,
      message:
        "Submit berhasil diklik menggunakan explicit label. Hasil halaman tercatat untuk verifikasi.",
    };
  }

  private async findUniqueSubmitButtonByLabel(
    normalizedLabel: string,
  ): Promise<string> {
    const candidates = await this.browser.evaluate<
      Array<{
        index: number;
        text: string;
        ariaLabel: string;
      }>
    >(
      `
          (() => {
            const normalize = (value) =>
              (value ?? "")
                .trim()
                .toLowerCase()
                .replace(/\\s+/g, " ");

            const elements = Array.from(
              document.querySelectorAll(
                'button, input[type="submit"], input[type="button"]'
              )
            );

            return elements
              .map((element, index) => ({
                index,
                text:
                  element.tagName.toLowerCase() === "input"
                    ? element.getAttribute("value") ?? ""
                    : element.textContent ?? "",
                ariaLabel:
                  element.getAttribute("aria-label") ?? "",
              }))
              .filter((candidate) => {
                const text =
                  normalize(candidate.text);

                const ariaLabel =
                  normalize(candidate.ariaLabel);

                return (
                  text === ${JSON.stringify(normalizedLabel)} ||
                  ariaLabel === ${JSON.stringify(normalizedLabel)}
                );
              });
          })()
        `,
    );

    if (candidates.length === 0) {
      throw new Error(
        `Submit button dengan label "${normalizedLabel}" tidak ditemukan.`,
      );
    }

    if (candidates.length > 1) {
      const candidateText = candidates
        .map(
          (candidate) =>
            `"${candidate.text}" (aria-label="${candidate.ariaLabel}", index=${candidate.index})`,
        )
        .join(", ");

      throw new Error(
        [
          `Submit button dengan label "${normalizedLabel}" ambigu.`,
          `Candidates: ${candidateText}.`,
          "Tidak ada tombol yang diklik.",
          "Diperlukan selector eksplisit.",
        ].join(" "),
      );
    }

    return `button, input[type="submit"], input[type="button"] >> nth=${candidates[0].index}`;
  }

  private logExecutionPlan(plan: FormExecutionPlan): void {
    console.log(`🧭 [FormExecutor] Execution plan: ${plan.decision}`);

    console.log(`🧭 [FormExecutor] Required fields: ${plan.requiredFields}`);

    console.log(`🧭 [FormExecutor] Ready fields: ${plan.readyFields}`);

    console.log(
      `🧭 [FormExecutor] Missing required fields: ${plan.missingRequiredFields}`,
    );

    console.log(`🧭 [FormExecutor] ${plan.message}`);
  }

  private async resolveField(
    type: FormFieldType,
    label: string | null,
    fields: InspectedField[],
    usedFieldIndexes: Set<number>,
  ): Promise<InspectedField | undefined> {
    const availableFields = fields.filter(
      (field) => !usedFieldIndexes.has(field.index),
    );

    if (availableFields.length === 0) {
      return undefined;
    }

    const normalizedLabel = this.normalizeText(label);

    if (normalizedLabel) {
      const exactLabel = availableFields.filter(
        (field) => this.normalizeText(field.label) === normalizedLabel,
      );

      if (exactLabel.length === 1) {
        return exactLabel[0];
      }

      if (exactLabel.length > 1) {
        throw new Error(
          this.buildDirectLabelAmbiguousError(type, exactLabel, "exact"),
        );
      }

      const partialLabel = availableFields.filter((field) => {
        const fieldLabel = this.normalizeText(field.label);

        if (!fieldLabel) {
          return false;
        }

        return (
          fieldLabel.includes(normalizedLabel) ||
          normalizedLabel.includes(fieldLabel)
        );
      });

      if (partialLabel.length === 1) {
        console.log(
          `🔎 [FormExecutor] Unique partial label match selected: ${this.getFieldDisplayName(
            partialLabel[0],
          )}`,
        );

        return partialLabel[0];
      }

      if (partialLabel.length > 1) {
        throw new Error(
          this.buildDirectLabelAmbiguousError(type, partialLabel, "partial"),
        );
      }
    }

    if (this.resolver) {
      const resolution = this.resolver.resolve(
        type,
        availableFields,
        usedFieldIndexes,
      );

      if (resolution.status === "MATCH") {
        console.log(
          `🧠 [FormExecutor] Automatic mapping selected: ${this.getFieldDisplayName(
            resolution.mapping.field,
          )} → ${type} (confidence=${resolution.mapping.confidence})`,
        );

        return resolution.mapping.field;
      }

      if (resolution.status === "AMBIGUOUS") {
        throw new Error(this.buildAmbiguousFieldError(type, resolution));
      }

      if (resolution.status === "LOW_CONFIDENCE") {
        throw new Error(this.buildLowConfidenceFieldError(type, resolution));
      }
    }

    const keywords = this.getFieldKeywords(type);

    const keywordMatches = availableFields.filter((field) =>
      this.fieldContainsKeyword(field, keywords),
    );

    if (keywordMatches.length === 1) {
      console.log(
        `🔎 [FormExecutor] Fallback heuristic selected: ${this.getFieldDisplayName(
          keywordMatches[0],
        )} → ${type}`,
      );

      return keywordMatches[0];
    }

    if (keywordMatches.length > 1) {
      throw new Error(this.buildHeuristicAmbiguousError(type, keywordMatches));
    }

    return undefined;
  }

  private buildDirectLabelAmbiguousError(
    type: FormFieldType,
    candidates: InspectedField[],
    matchType: "exact" | "partial",
  ): string {
    const candidateText = candidates
      .map(
        (candidate) =>
          `"${this.getFieldDisplayName(
            candidate,
          )}" (selector=${candidate.selector})`,
      )
      .join(", ");

    return [
      `Direct ${matchType} label mapping untuk "${type}" dihentikan karena ambigu.`,
      `Candidates: ${candidateText}.`,
      "Form tidak diisi untuk field ini.",
      "Diperlukan keputusan eksplisit sebelum melanjutkan.",
    ].join(" ");
  }

  private buildHeuristicAmbiguousError(
    type: FormFieldType,
    candidates: InspectedField[],
  ): string {
    const candidateText = candidates
      .map(
        (candidate) =>
          `"${this.getFieldDisplayName(
            candidate,
          )}" (selector=${candidate.selector})`,
      )
      .join(", ");

    return [
      `Fallback heuristic untuk "${type}" dihentikan karena ambigu.`,
      `Candidates: ${candidateText}.`,
      "Form tidak diisi untuk field ini.",
      "Diperlukan keputusan eksplisit sebelum melanjutkan.",
    ].join(" ");
  }

  private buildAmbiguousFieldError(
    type: FormFieldType,
    resolution: Extract<FieldMappingResolution, { status: "AMBIGUOUS" }>,
  ): string {
    const candidates = resolution.candidates
      .map(
        (candidate) =>
          `"${this.getFieldDisplayName(
            candidate.field,
          )}" (confidence=${candidate.confidence}, selector=${candidate.field.selector})`,
      )
      .join(", ");

    return [
      `Automatic mapping untuk "${type}" dihentikan karena ambigu.`,
      `Candidates: ${candidates}.`,
      "Form tidak diisi untuk field ini.",
      "Diperlukan keputusan eksplisit sebelum melanjutkan.",
    ].join(" ");
  }

  private buildLowConfidenceFieldError(
    type: FormFieldType,
    resolution: Extract<FieldMappingResolution, { status: "LOW_CONFIDENCE" }>,
  ): string {
    const candidates = resolution.candidates
      .map(
        (candidate) =>
          `"${this.getFieldDisplayName(
            candidate.field,
          )}" (confidence=${candidate.confidence})`,
      )
      .join(", ");

    return [
      `Automatic mapping untuk "${type}" dihentikan karena confidence terlalu rendah.`,
      `Candidates: ${candidates}.`,
      "Form tidak diisi untuk field ini.",
      "Diperlukan keputusan eksplisit sebelum melanjutkan.",
    ].join(" ");
  }

  private getFieldDisplayName(field: InspectedField): string {
    return field.label ?? field.name ?? field.id ?? `field-${field.index}`;
  }

  private findMatchingCheckbox(
    plannedCheckbox: PlannedFormCheckbox,
    checkboxes: InspectedCheckbox[],
  ): InspectedCheckbox | undefined {
    if (checkboxes.length === 0) {
      return undefined;
    }

    const normalizedLabel = this.normalizeText(plannedCheckbox.label);

    if (normalizedLabel) {
      const exactLabel = checkboxes.find(
        (checkbox) => this.normalizeText(checkbox.label) === normalizedLabel,
      );

      if (exactLabel) {
        return exactLabel;
      }

      const partialLabel = checkboxes.find((checkbox) => {
        const checkboxLabel = this.normalizeText(checkbox.label);

        if (!checkboxLabel) {
          return false;
        }

        return (
          checkboxLabel.includes(normalizedLabel) ||
          normalizedLabel.includes(checkboxLabel)
        );
      });

      if (partialLabel) {
        return partialLabel;
      }
    }

    const keywords = this.getCheckboxKeywords(plannedCheckbox.type);

    return checkboxes.find((checkbox) => {
      const text = [checkbox.label, checkbox.name, checkbox.ariaLabel]
        .filter(Boolean)
        .join(" ");

      const normalized = this.normalizeText(text);

      return keywords.some((keyword) =>
        normalized.includes(this.normalizeText(keyword)),
      );
    });
  }

  private async fillInspectedField(
    field: InspectedField,
    value: string,
  ): Promise<void> {
    console.log(
      `✏️ [FormExecutor] Filling inspected ${field.kind} "${this.getFieldDisplayName(
        field,
      )}" using ${field.selector}`,
    );

    await this.browser.fill(field.selector, value);
  }

  private async fillField(
    type: FormFieldType,
    label: string | null,
    value: string,
  ): Promise<void> {
    const selectors = this.buildFieldSelectors(type, label);

    for (const selector of selectors) {
      try {
        const exists = await this.browser.elementExists(selector);

        if (!exists) {
          continue;
        }

        await this.browser.fill(selector, value);

        console.log(`✏️ [FormExecutor] Filled ${type} using ${selector}`);

        return;
      } catch {
        // Try the next selector.
      }
    }

    throw new Error(`Field "${type}" tidak berhasil ditemukan.`);
  }

  private async checkCheckbox(checkbox: PlannedFormCheckbox): Promise<void> {
    const selectors = this.buildCheckboxSelectors(checkbox);

    for (const selector of selectors) {
      try {
        const exists = await this.browser.elementExists(selector);

        if (!exists) {
          continue;
        }

        await this.browser.click(selector);

        console.log(
          `☑️ [FormExecutor] Checked ${checkbox.type} using ${selector}`,
        );

        return;
      } catch {
        // Try the next selector.
      }
    }

    throw new Error(`Checkbox "${checkbox.type}" tidak berhasil ditemukan.`);
  }

  private getFieldKeywords(type: FormFieldType): string[] {
    switch (type) {
      case "TWITTER_HANDLE":
        return [
          "twitter",
          "twitter username",
          "twitter handle",
          "x username",
          "x handle",
          "x account",
        ];

      case "WALLET_ADDRESS":
        return [
          "wallet",
          "wallet address",
          "ethereum address",
          "evm address",
          "address",
        ];

      case "OWN_TWEET_URL":
        return [
          "tweet",
          "tweet url",
          "tweet link",
          "post",
          "post url",
          "post link",
          "quote",
        ];

      case "EMAIL":
        return ["email", "email address", "e-mail"];

      case "DISCORD":
        return ["discord", "discord username", "discord id"];

      case "TELEGRAM":
        return ["telegram", "telegram username", "telegram id"];

      case "TEXT":
        return [];

      case "CUSTOM":
        return [];

      default:
        return [];
    }
  }

  private fieldContainsKeyword(
    field: InspectedField,
    keywords: string[],
  ): boolean {
    if (keywords.length === 0) {
      return false;
    }

    const searchableText = [
      field.label,
      field.name,
      field.id,
      field.placeholder,
      field.ariaLabel,
      field.type,
    ]
      .filter(Boolean)
      .join(" ");

    const normalized = this.normalizeText(searchableText);

    return keywords.some((keyword) =>
      normalized.includes(this.normalizeText(keyword)),
    );
  }

  private getCheckboxKeywords(type: PlannedFormCheckbox["type"]): string[] {
    switch (type) {
      case "X_FOLLOW":
        return ["follow"];

      case "X_LIKE":
        return ["like"];

      case "X_REPOST":
        return ["repost", "retweet"];

      case "X_REPLY":
        return ["reply"];

      case "X_QUOTE":
        return ["quote"];

      default:
        return [];
    }
  }

  private normalizeText(value: string | null | undefined): string {
    return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
  }

  private buildFieldSelectors(
    type: FormFieldType,
    label: string | null,
  ): string[] {
    const selectors: string[] = [];

    if (label) {
      const escapedLabel = this.escapeSelectorText(label);

      selectors.push(
        `input[aria-label="${escapedLabel}"]`,
        `textarea[aria-label="${escapedLabel}"]`,
        `input[placeholder="${escapedLabel}"]`,
        `textarea[placeholder="${escapedLabel}"]`,
        `input[name="${escapedLabel}"]`,
        `textarea[name="${escapedLabel}"]`,
      );
    }

    switch (type) {
      case "TWITTER_HANDLE":
        selectors.push(
          'input[name*="twitter" i]',
          'input[name*="x" i]',
          'input[placeholder*="twitter" i]',
          'input[placeholder*="x handle" i]',
          'input[aria-label*="twitter" i]',
          'input[aria-label*="x handle" i]',
        );
        break;

      case "WALLET_ADDRESS":
        selectors.push(
          'input[name*="wallet" i]',
          'input[placeholder*="wallet" i]',
          'input[aria-label*="wallet" i]',
        );
        break;

      case "OWN_TWEET_URL":
        selectors.push(
          'input[name*="tweet" i]',
          'input[name*="post" i]',
          'input[name*="quote" i]',
          'input[placeholder*="tweet" i]',
          'input[placeholder*="post" i]',
          'input[placeholder*="quote" i]',
          'input[aria-label*="tweet" i]',
          'input[aria-label*="post" i]',
          'input[aria-label*="quote" i]',
        );
        break;

      default:
        break;
    }

    return selectors;
  }

  private buildCheckboxSelectors(checkbox: PlannedFormCheckbox): string[] {
    const selectors: string[] = [];

    if (checkbox.label) {
      const escapedLabel = this.escapeSelectorText(checkbox.label);

      selectors.push(
        `label:has-text("${escapedLabel}")`,
        `[aria-label="${escapedLabel}"]`,
      );
    }

    switch (checkbox.type) {
      case "X_FOLLOW":
        selectors.push(
          'label:has-text("Follow")',
          'label:has-text("follow")',
          'input[type="checkbox"][name*="follow" i]',
        );
        break;

      case "X_LIKE":
        selectors.push(
          'label:has-text("Like")',
          'label:has-text("like")',
          'input[type="checkbox"][name*="like" i]',
        );
        break;

      case "X_REPOST":
        selectors.push(
          'label:has-text("Repost")',
          'label:has-text("Retweet")',
          'label:has-text("repost")',
          'input[type="checkbox"][name*="repost" i]',
          'input[type="checkbox"][name*="retweet" i]',
        );
        break;

      case "X_REPLY":
        selectors.push(
          'label:has-text("Reply")',
          'label:has-text("reply")',
          'input[type="checkbox"][name*="reply" i]',
        );
        break;

      case "X_QUOTE":
        selectors.push(
          'label:has-text("Quote")',
          'label:has-text("quote")',
          'input[type="checkbox"][name*="quote" i]',
        );
        break;

      default:
        break;
    }

    return selectors;
  }

  private escapeSelectorText(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }
}
