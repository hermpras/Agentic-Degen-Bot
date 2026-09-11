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
import { FieldMapper, FieldMapping } from "./field-mapper.js";

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

  constructor(
    private readonly browser: BrowserExecutor,
    inspector?: FormInspector,
    mapper?: FieldMapper,
  ) {
    this.inspector = inspector;
    this.mapper = mapper;
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
    let fieldMappings: FieldMapping[] = [];

    if (this.inspector) {
      const inspection = await this.inspector.inspect();

      inspectedFields = inspection.fields;
      inspectedCheckboxes = inspection.checkboxes;

      console.log(
        `🔎 [FormExecutor] Using structured inspection: ${inspectedFields.length} fields, ${inspectedCheckboxes.length} checkboxes.`,
      );

      if (this.mapper) {
        fieldMappings = this.mapper.mapFields(inspectedFields);

        console.log(
          `🧠 [FormExecutor] Automatic field mapping: ${fieldMappings.length} fields mapped.`,
        );

        for (const mapping of fieldMappings) {
          console.log(
            `🧠 [FormExecutor] ${mapping.field.label ?? mapping.field.name ?? mapping.field.id ?? `field-${mapping.field.index}`} → ${mapping.mappedType} (confidence=${mapping.confidence})`,
          );
        }
      }
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

      const inspectedField = this.findMatchingField(
        field.type,
        field.label,
        inspectedFields,
        fieldMappings,
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

  private findMatchingField(
    type: FormFieldType,
    label: string | null,
    fields: InspectedField[],
    mappings: FieldMapping[],
    usedFieldIndexes: Set<number>,
  ): InspectedField | undefined {
    if (fields.length === 0) {
      return undefined;
    }

    const availableFields = fields.filter(
      (field) => !usedFieldIndexes.has(field.index),
    );

    const normalizedLabel = this.normalizeText(label);

    /*
     * Priority 1:
     * Exact label match.
     *
     * Kalau planner sudah memberikan label yang sangat spesifik,
     * kita percaya label tersebut terlebih dahulu.
     */
    if (normalizedLabel) {
      const exactLabel = availableFields.find(
        (field) => this.normalizeText(field.label) === normalizedLabel,
      );

      if (exactLabel) {
        return exactLabel;
      }

      /*
       * Priority 2:
       * Partial label match.
       */
      const partialLabel = availableFields.find((field) => {
        const fieldLabel = this.normalizeText(field.label);

        if (!fieldLabel) {
          return false;
        }

        return (
          fieldLabel.includes(normalizedLabel) ||
          normalizedLabel.includes(fieldLabel)
        );
      });

      if (partialLabel) {
        return partialLabel;
      }
    }

    /*
     * Priority 3:
     * Automatic FieldMapper.
     *
     * Hanya mapping dengan confidence >= 80
     * yang boleh digunakan otomatis.
     */
    if (this.mapper) {
      const mappedCandidate = mappings
        .filter(
          (mapping) =>
            mapping.mappedType === type &&
            mapping.confidence >= 80 &&
            !usedFieldIndexes.has(mapping.field.index),
        )
        .sort((a, b) => b.confidence - a.confidence)[0];

      if (mappedCandidate) {
        console.log(
          `🧠 [FormExecutor] Automatic mapping selected: ${mappedCandidate.field.label ?? mappedCandidate.field.name ?? mappedCandidate.field.id ?? `field-${mappedCandidate.field.index}`} → ${type} (confidence=${mappedCandidate.confidence})`,
        );

        return mappedCandidate.field;
      }
    }

    /*
     * Priority 4:
     * Existing keyword heuristic.
     *
     * Ini tetap dipertahankan sebagai fallback.
     */
    const keywords = this.getFieldKeywords(type);

    const keywordMatch = availableFields.find((field) =>
      this.fieldContainsKeyword(field, keywords),
    );

    if (keywordMatch) {
      return keywordMatch;
    }

    return undefined;
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
      `✏️ [FormExecutor] Filling inspected ${field.kind} "${field.label ?? field.name ?? field.id ?? field.index}" using ${field.selector}`,
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
