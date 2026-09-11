import { AgentDatabase } from "../database/agent-database.js";

export type PlannedTaskType =
  | "OPEN_PAGE"
  | "X_FOLLOW"
  | "X_LIKE"
  | "X_REPOST"
  | "X_COMMENT"
  | "X_REPLY"
  | "X_QUOTE"
  | "X_POST"
  | "FORM"
  | "FORM_TWITTER"
  | "FORM_WALLET"
  | "FORM_SUBMIT"
  | "WHITELIST"
  | "CUSTOM";

export type FormType = "WEBSITE" | "GOOGLE_FORM";

export type FormFieldType =
  | "TWITTER_HANDLE"
  | "WALLET_ADDRESS"
  | "OWN_TWEET_URL"
  | "TEXT"
  | "EMAIL"
  | "DISCORD"
  | "TELEGRAM"
  | "CUSTOM";

export type FormCheckboxType =
  | "X_FOLLOW"
  | "X_LIKE"
  | "X_REPOST"
  | "X_COMMENT"
  | "X_REPLY"
  | "X_QUOTE"
  | "CUSTOM";

export interface FormFieldRequirement {
  type: FormFieldType;
  label?: string;
  required?: boolean;
  value?: string | null;
}

export interface FormCheckboxRequirement {
  type: FormCheckboxType;
  label?: string;
  required?: boolean;
  checked?: boolean;
}

export interface FormSubmitRequirement {
  selector?: string;
  label?: string;
}

export interface FormRequirement {
  formType: FormType;
  targetUrl: string;
  fields?: FormFieldRequirement[];
  checkboxes?: FormCheckboxRequirement[];
  submit?: FormSubmitRequirement;
}

export interface TaskRequirement {
  type: PlannedTaskType;
  description: string;
  targetUrl?: string | null;
  producesOwnTweetUrl?: boolean;
  requiresOwnTweetUrl?: boolean;
  form?: FormRequirement;
}

export interface TaskPlannerInput {
  projectName: string;
  sourceUrl: string;
  requirements: TaskRequirement[];
}

export interface PlannedTask {
  planTaskId: string;
  projectName: string;
  accountId: number;
  accountName: string;
  twitterHandle: string | null;
  walletAddress: string | null;
  taskType: PlannedTaskType;
  targetUrl: string | null;
  description: string;
  dependsOn: string[];
  outputKey: string | null;
  inputFrom: string | null;
  form: PlannedForm | null;
}

export interface PlannedForm {
  formType: FormType;
  targetUrl: string;
  fields: PlannedFormField[];
  checkboxes: PlannedFormCheckbox[];
  submit: PlannedFormSubmit | null;
}

export interface PlannedFormField {
  type: FormFieldType;
  label: string | null;
  required: boolean;
  value: string | null;
}

export interface PlannedFormCheckbox {
  type: FormCheckboxType;
  label: string | null;
  required: boolean;
  checked: boolean;
}

export interface PlannedFormSubmit {
  selector: string | null;
  label: string | null;
}

export interface TaskPlan {
  projectName: string;
  sourceUrl: string;
  accountCount: number;
  taskCount: number;
  tasks: PlannedTask[];
}

export class TaskPlanner {
  constructor(private readonly database: AgentDatabase) {}

  createPlan(input: TaskPlannerInput): TaskPlan {
    const projectName = input.projectName.trim();

    const sourceUrl = input.sourceUrl.trim();

    if (!projectName) {
      throw new Error("Nama project wajib diisi.");
    }

    if (!sourceUrl) {
      throw new Error("Source URL wajib diisi.");
    }

    if (!Array.isArray(input.requirements)) {
      throw new Error("Requirements task wajib berupa array.");
    }

    if (input.requirements.length === 0) {
      throw new Error("Minimal harus ada satu requirement task.");
    }

    const accounts = this.getActiveAccounts();

    if (accounts.length === 0) {
      throw new Error(
        "Tidak ada account ACTIVE yang tersedia untuk dibuatkan task.",
      );
    }

    const tasks: PlannedTask[] = [];

    for (const account of accounts) {
      const accountTaskIds: string[] = [];

      for (
        let requirementIndex = 0;
        requirementIndex < input.requirements.length;
        requirementIndex++
      ) {
        const requirement = input.requirements[requirementIndex];

        const planTaskId = `account-${account.id}-task-${requirementIndex + 1}`;

        const previousTaskId =
          accountTaskIds.length > 0
            ? accountTaskIds[accountTaskIds.length - 1]
            : null;

        const dependsOn: string[] = [];

        if (previousTaskId) {
          dependsOn.push(previousTaskId);
        }

        let inputFrom: string | null = null;

        if (requirement.requiresOwnTweetUrl) {
          const producer = this.findOwnTweetProducer(tasks, account.id);

          if (!producer) {
            throw new Error(
              `Task "${requirement.type}" untuk account "${account.name}" membutuhkan ownTweetUrl, tetapi belum ada task yang menghasilkan ownTweetUrl.`,
            );
          }

          inputFrom = producer.planTaskId;

          if (!dependsOn.includes(producer.planTaskId)) {
            dependsOn.push(producer.planTaskId);
          }
        }

        const outputKey = requirement.producesOwnTweetUrl
          ? `account_${account.id}_own_tweet_url`
          : null;

        const plannedTask: PlannedTask = {
          planTaskId,
          projectName,
          accountId: account.id,
          accountName: account.name,
          twitterHandle: account.twitter_handle,
          walletAddress: account.wallet_address,
          taskType: requirement.type,
          targetUrl: requirement.targetUrl?.trim() || null,
          description: requirement.description.trim(),
          dependsOn,
          outputKey,
          inputFrom,
          form: requirement.form
            ? this.buildPlannedForm(requirement.form, account)
            : null,
        };

        tasks.push(plannedTask);
        accountTaskIds.push(planTaskId);
      }
    }

    return {
      projectName,
      sourceUrl,
      accountCount: accounts.length,
      taskCount: tasks.length,
      tasks,
    };
  }

  private buildPlannedForm(
    form: FormRequirement,
    account: AccountRow,
  ): PlannedForm {
    const targetUrl = form.targetUrl.trim();

    if (!targetUrl) {
      throw new Error(
        `Target URL form untuk account "${account.name}" tidak boleh kosong.`,
      );
    }

    const fields = (form.fields ?? []).map((field) => ({
      type: field.type,
      label: field.label?.trim() || null,
      required: field.required ?? true,
      value: this.resolveFormFieldValue(field, account),
    }));

    const checkboxes = (form.checkboxes ?? []).map((checkbox) => ({
      type: checkbox.type,
      label: checkbox.label?.trim() || null,
      required: checkbox.required ?? false,
      checked: checkbox.checked ?? true,
    }));

    const submit = this.buildPlannedFormSubmit(form.submit);

    return {
      formType: form.formType,
      targetUrl,
      fields,
      checkboxes,
      submit,
    };
  }

  private buildPlannedFormSubmit(
    submit: FormSubmitRequirement | undefined,
  ): PlannedFormSubmit | null {
    if (!submit) {
      return null;
    }

    const selector = submit.selector?.trim() || null;
    const label = submit.label?.trim() || null;

    if (!selector && !label) {
      throw new Error(
        "Konfigurasi submit form harus memiliki selector atau label.",
      );
    }

    return {
      selector,
      label,
    };
  }

  private resolveFormFieldValue(
    field: FormFieldRequirement,
    account: AccountRow,
  ): string | null {
    switch (field.type) {
      case "TWITTER_HANDLE":
        return account.twitter_handle ?? null;

      case "WALLET_ADDRESS":
        return account.wallet_address ?? null;

      case "OWN_TWEET_URL":
        return null;

      default:
        return field.value?.trim() || null;
    }
  }

  private getActiveAccounts(): AccountRow[] {
    const stmt = this.database.getDb().prepare(`
      SELECT
        id,
        name,
        twitter_handle,
        wallet_address
      FROM accounts
      WHERE status = 'ACTIVE'
      ORDER BY id ASC
    `);

    return stmt.all() as AccountRow[];
  }

  private findOwnTweetProducer(
    tasks: PlannedTask[],
    accountId: number,
  ): PlannedTask | undefined {
    return [...tasks]
      .reverse()
      .find((task) => task.accountId === accountId && task.outputKey !== null);
  }
}

interface AccountRow {
  id: number;
  name: string;
  twitter_handle: string | null;
  wallet_address: string | null;
}
