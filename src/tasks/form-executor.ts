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
} from "./task-planner.js";
import { FieldMapper } from "./field-mapper.js";
import {
  FieldMappingResolver,
  FieldMappingResolution,
} from "./field-mapping-resolver.js";

export interface FormExecutionResult {
  formType: PlannedForm["formType"];
  url: string;
  fieldsFilled: number;
  checkboxesChecked: number;
  submitAttempted: boolean;
  message: string;
}

export class FormExecutor {
  private readonly inspector?: FormInspector;
  private readonly mapper?: FieldMapper;
  private readonly resolver?: FieldMappingResolver;

  constructor(
    private readonly browser: BrowserExecutor,
    inspector?: FormInspector,
    mapper?: FieldMapper,
    resolver?: FieldMappingResolver,
  ) {
    this.inspector = inspector;
    this.mapper = mapper;
    this.resolver =
      resolver ?? (mapper ? new FieldMappingResolver(mapper) : undefined);
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

    return {
      formType: form.formType,
      url: form.targetUrl,
      fieldsFilled,
      checkboxesChecked,
      submitAttempted: false,
      message: "Form berhasil diisi tetapi belum disubmit.",
    };
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

    /*
     * Priority 1:
     * Exact label match.
     *
     * Exact match dianggap deterministic.
     */
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

      /*
       * Priority 2:
       * Partial label match.
       *
       * Partial match TIDAK boleh langsung memilih
       * candidate pertama. Kalau ada lebih dari satu,
       * harus dianggap ambiguous.
       */
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

    /*
     * Priority 3:
     * FieldMappingResolver.
     *
     * Resolver menentukan apakah automatic mapping
     * berdasarkan semantic field type aman digunakan.
     */
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

      /*
       * NOT_FOUND:
       * lanjut ke fallback heuristic.
       */
    }

    /*
     * Priority 4:
     * Existing heuristic fallback.
     */
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

      return keywords.some((keyword) => normalized.includes(keyword));
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
