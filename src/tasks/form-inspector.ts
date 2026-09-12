import type { BrowserExecutor } from "../browser/browser-executor.js";

export type InspectedFieldKind = "INPUT" | "TEXTAREA" | "SELECT";

export interface InspectedField {
  index: number;
  kind: InspectedFieldKind;
  type: string | null;
  name: string | null;
  id: string | null;
  label: string | null;
  placeholder: string | null;
  ariaLabel: string | null;
  required: boolean;
  selector: string;
}

export interface InspectedCheckbox {
  index: number;
  name: string | null;
  id: string | null;
  label: string | null;
  ariaLabel: string | null;
  checked: boolean;
  selector: string;
}

export interface InspectedInteractive {
  index: number;
  kind: "BUTTON" | "LINK" | "ROLE_BUTTON";
  text: string | null;
  ariaLabel: string | null;
  title: string | null;
  selector: string;
}

export interface InspectedForm {
  url: string;
  title: string;
  fields: InspectedField[];
  checkboxes: InspectedCheckbox[];
  interactives: InspectedInteractive[];
  summary: string;
}

export class FormInspector {
  constructor(private readonly browser: BrowserExecutor) {}

  async inspect(): Promise<InspectedForm> {
    const page = await this.browser.getPageResult();

    const fields = await this.inspectFields();
    const checkboxes = await this.inspectCheckboxes();
    const interactives = await this.inspectInteractives();

    const summary = this.buildSummary(
      page.title,
      page.url,
      fields,
      checkboxes,
      interactives,
    );

    console.log(
      `🔎 [FormInspector] Inspected ${fields.length} fields, ${checkboxes.length} checkboxes, ${interactives.length} interactive elements.`,
    );

    return {
      url: page.url,
      title: page.title,
      fields,
      checkboxes,
      interactives,
      summary,
    };
  }

  private async inspectFields(): Promise<InspectedField[]> {
    const script = `
      (() => {
        const elements = Array.from(
          document.querySelectorAll(
            'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select'
          )
        );

        return elements.map((element, index) => {
          const htmlElement = element;

          const tagName =
            htmlElement.tagName.toLowerCase();

          let kind = "INPUT";

          if (tagName === "textarea") {
            kind = "TEXTAREA";
          } else if (tagName === "select") {
            kind = "SELECT";
          }

          const inputType =
            htmlElement.getAttribute("type");

          const name =
            htmlElement.getAttribute("name");

          const id =
            htmlElement.getAttribute("id");

          const placeholder =
            htmlElement.getAttribute("placeholder");

          const ariaLabel =
            htmlElement.getAttribute("aria-label");

          const required =
            htmlElement.hasAttribute("required") ||
            htmlElement.getAttribute("aria-required") === "true";

          let label = null;

          if (id) {
            const labelElement =
              document.querySelector(
                'label[for="' +
                  CSS.escape(id) +
                  '"]'
              );

            if (labelElement) {
              label =
                labelElement.textContent?.trim() ||
                null;
            }
          }

          if (!label) {
            const parentLabel =
              htmlElement.closest("label");

            if (parentLabel) {
              label =
                parentLabel.textContent?.trim() ||
                null;
            }
          }

          return {
            index,
            kind,
            type: inputType,
            name,
            id,
            label,
            placeholder,
            ariaLabel,
            required,
          };
        });
      })()
    `;

    const rawFields = await this.browser.evaluate(script);

    if (!Array.isArray(rawFields)) {
      throw new Error("FormInspector gagal membaca fields.");
    }

    return rawFields.map((field) => ({
      index: field.index,
      kind: field.kind,
      type: field.type,
      name: field.name,
      id: field.id,
      label: field.label,
      placeholder: field.placeholder,
      ariaLabel: field.ariaLabel,
      required: field.required,
      selector: this.buildSelector(field, "field"),
    }));
  }

  private async inspectCheckboxes(): Promise<InspectedCheckbox[]> {
    const script = `
      (() => {
        const elements = Array.from(
          document.querySelectorAll(
            'input[type="checkbox"]'
          )
        );

        return elements.map((element, index) => {
          const htmlElement = element;

          const name =
            htmlElement.getAttribute("name");

          const id =
            htmlElement.getAttribute("id");

          const ariaLabel =
            htmlElement.getAttribute("aria-label");

          let label = null;

          if (id) {
            const labelElement =
              document.querySelector(
                'label[for="' +
                  CSS.escape(id) +
                  '"]'
              );

            if (labelElement) {
              label =
                labelElement.textContent?.trim() ||
                null;
            }
          }

          if (!label) {
            const parentLabel =
              htmlElement.closest("label");

            if (parentLabel) {
              label =
                parentLabel.textContent?.trim() ||
                null;
            }
          }

          return {
            index,
            name,
            id,
            label,
            ariaLabel,
            checked:
              htmlElement.checked,
          };
        });
      })()
    `;

    const rawCheckboxes = await this.browser.evaluate(script);

    if (!Array.isArray(rawCheckboxes)) {
      throw new Error("FormInspector gagal membaca checkboxes.");
    }

    return rawCheckboxes.map((checkbox) => ({
      index: checkbox.index,
      name: checkbox.name,
      id: checkbox.id,
      label: checkbox.label,
      ariaLabel: checkbox.ariaLabel,
      checked: checkbox.checked,
      selector: this.buildSelector(checkbox, "checkbox"),
    }));
  }

  private async inspectInteractives(): Promise<InspectedInteractive[]> {
    const script = `
      (() => {
        const elements = Array.from(
          document.querySelectorAll(
            'button, a, [role="button"]'
          )
        );

        return elements.map((element, index) => {
          const htmlElement = element;

          const tagName =
            htmlElement.tagName.toLowerCase();

          let kind = "BUTTON";

          if (tagName === "a") {
            kind = "LINK";
          } else if (
            htmlElement.getAttribute("role") === "button"
          ) {
            kind = "ROLE_BUTTON";
          }

          const text =
            htmlElement.textContent?.trim() || null;

          const ariaLabel =
            htmlElement.getAttribute("aria-label");

          const title =
            htmlElement.getAttribute("title");

          return {
            index,
            kind,
            text,
            ariaLabel,
            title,
          };
        });
      })()
    `;

    const rawInteractives = await this.browser.evaluate(script);

    if (!Array.isArray(rawInteractives)) {
      throw new Error("FormInspector gagal membaca interactive elements.");
    }

    return rawInteractives.map((element) => ({
      index: element.index,
      kind: element.kind,
      text: element.text,
      ariaLabel: element.ariaLabel,
      title: element.title,
      selector: this.buildInteractiveSelector(element),
    }));
  }

  private buildSelector(
    element: {
      id: string | null;
      name?: string | null;
      ariaLabel?: string | null;
      placeholder?: string | null;
      index: number;
    },
    kind: "field" | "checkbox",
  ): string {
    if (element.id) {
      return `#${this.escapeCssSelector(element.id)}`;
    }

    if (element.name) {
      const tag =
        kind === "checkbox"
          ? 'input[type="checkbox"]'
          : "input, textarea, select";

      return `${tag}[name="${this.escapeAttribute(element.name)}"]`;
    }

    if (element.ariaLabel) {
      const tag =
        kind === "checkbox"
          ? 'input[type="checkbox"]'
          : "input, textarea, select";

      return `${tag}[aria-label="${this.escapeAttribute(element.ariaLabel)}"]`;
    }

    if (element.placeholder) {
      return `input[placeholder="${this.escapeAttribute(
        element.placeholder,
      )}"]`;
    }

    if (kind === "checkbox") {
      return `input[type="checkbox"]:nth-of-type(${element.index + 1})`;
    }

    return `input, textarea, select:nth-of-type(${element.index + 1})`;
  }

  private buildInteractiveSelector(element: {
    text: string | null;
    ariaLabel: string | null;
    title: string | null;
    index: number;
  }): string {
    if (element.ariaLabel) {
      return `[aria-label="${this.escapeAttribute(element.ariaLabel)}"]`;
    }

    if (element.title) {
      return `[title="${this.escapeAttribute(element.title)}"]`;
    }

    return `button, a, [role="button"]:nth-of-type(${element.index + 1})`;
  }

  private buildSummary(
    title: string,
    url: string,
    fields: InspectedField[],
    checkboxes: InspectedCheckbox[],
    interactives: InspectedInteractive[],
  ): string {
    const lines: string[] = [];

    lines.push(`Title: ${title}`);
    lines.push(`URL: ${url}`);
    lines.push("");

    lines.push(`Fields: ${fields.length}`);

    for (const field of fields) {
      lines.push(
        [
          `#${field.index}`,
          field.kind,
          field.type ? `type=${field.type}` : null,
          field.label ? `label="${field.label}"` : null,
          field.name ? `name="${field.name}"` : null,
          field.required ? "required" : null,
        ]
          .filter(Boolean)
          .join(" | "),
      );
    }

    lines.push("");

    lines.push(`Checkboxes: ${checkboxes.length}`);

    for (const checkbox of checkboxes) {
      lines.push(
        [
          `#${checkbox.index}`,
          checkbox.label ? `label="${checkbox.label}"` : null,
          checkbox.name ? `name="${checkbox.name}"` : null,
          checkbox.checked ? "checked" : "unchecked",
        ]
          .filter(Boolean)
          .join(" | "),
      );
    }

    lines.push("");

    lines.push(`Interactive elements: ${interactives.length}`);

    for (const interactive of interactives) {
      lines.push(
        [
          `#${interactive.index}`,
          interactive.kind,
          interactive.text ? `text="${interactive.text}"` : null,
          interactive.ariaLabel
            ? `aria-label="${interactive.ariaLabel}"`
            : null,
          interactive.title ? `title="${interactive.title}"` : null,
        ]
          .filter(Boolean)
          .join(" | "),
      );
    }

    return lines.join("\n");
  }

  private escapeAttribute(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  private escapeCssSelector(value: string): string {
    return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
  }
}
