import { BrowserExecutor } from "../browser/browser-executor.js";
import {
  FormFieldType,
  PlannedForm,
  PlannedFormCheckbox,
} from "./task-planner.js";

export interface FormExecutionResult {
  formType: PlannedForm["formType"];
  url: string;
  fieldsFilled: number;
  checkboxesChecked: number;
  submitAttempted: boolean;
  message: string;
}

export class FormExecutor {
  constructor(private readonly browser: BrowserExecutor) {}

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
    const pageText = await this.openForm(form);

    return pageText.slice(0, 5000);
  }

  async fillForm(form: PlannedForm): Promise<FormExecutionResult> {
    await this.openForm(form);

    let fieldsFilled = 0;
    let checkboxesChecked = 0;

    for (const field of form.fields) {
      if (field.value === null) {
        if (field.required) {
          throw new Error(
            `Field "${field.type}" membutuhkan value tetapi value belum tersedia.`,
          );
        }

        continue;
      }

      await this.fillField(field.type, field.label, field.value);

      fieldsFilled++;
    }

    for (const checkbox of form.checkboxes) {
      if (!checkbox.checked) {
        continue;
      }

      await this.checkCheckbox(checkbox);

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
