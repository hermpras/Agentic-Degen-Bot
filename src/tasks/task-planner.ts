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
  | "CONNECT_WALLET"
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
  successSelector?: string;
  successText?: string;
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
  proof: string | null;
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
  successSelector: string | null;
  successText: string | null;
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

        const previousTaskId =
          accountTaskIds.length > 0
            ? accountTaskIds[accountTaskIds.length - 1]
            : null;

        const dependsOn: string[] = [];

        if (previousTaskId) {
          dependsOn.push(previousTaskId);
        }

        /**
         * Wallet connection is an execution capability.
         *
         * The project analyzer does not need to know about Rabby.
         * When a task requires wallet data/interaction, the planner
         * inserts CONNECT_WALLET immediately before that task.
         */
        if (this.requiresWalletConnection(requirement)) {
          const connectTaskId = `account-${account.id}-wallet-${requirementIndex + 1}`;

          const connectDependsOn = previousTaskId ? [previousTaskId] : [];

          const connectTask: PlannedTask = {
            planTaskId: connectTaskId,
            projectName,
            accountId: account.id,
            accountName: account.name,
            twitterHandle: account.twitter_handle,
            walletAddress: account.wallet_address,
            proof: null,
            taskType: "CONNECT_WALLET",
            targetUrl:
              requirement.targetUrl?.trim() ||
              requirement.form?.targetUrl?.trim() ||
              sourceUrl,
            description:
              `Connect and verify wallet for account "${account.name}" ` +
              `before executing: ${requirement.description.trim()}`,
            dependsOn: connectDependsOn,
            outputKey: null,
            inputFrom: null,
            form: null,
          };

          tasks.push(connectTask);
          accountTaskIds.push(connectTaskId);

          dependsOn.length = 0;
          dependsOn.push(connectTaskId);
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

        const plannedTaskId = `account-${account.id}-task-${requirementIndex + 1}`;

        /**
         * Untuk task yang tidak punya targetUrl eksplisit,
         * gunakan sourceUrl sebagai fallback hanya untuk OPEN_PAGE.
         *
         * Contoh:
         *
         * sourceUrl:
         *   https://www.arcape.wtf
         *
         * requirement:
         *   {
         *     type: "OPEN_PAGE",
         *     targetUrl: null
         *   }
         *
         * hasil:
         *   targetUrl: "https://www.arcape.wtf"
         *
         * Ini memastikan OPEN_PAGE selalu punya URL yang bisa
         * dieksekusi oleh TaskExecutor.
         */
        const targetUrl =
          requirement.targetUrl?.trim() ||
          (requirement.type === "OPEN_PAGE" ? sourceUrl : null);

        const plannedTask: PlannedTask = {
          planTaskId: plannedTaskId,
          projectName,
          accountId: account.id,
          accountName: account.name,
          twitterHandle: account.twitter_handle,
          walletAddress: account.wallet_address,

          /**
           * Proof inheritance:
           *
           * Task tertentu seperti comment/reply/quote dapat membutuhkan
           * URL proof. Jika account mempunyai defaultProofUrl, planner
           * membawa nilai tersebut ke PlannedTask.
           *
           * Task yang tidak membutuhkan proof tidak mendapatkannya.
           */
          proof: this.requiresProof(requirement)
            ? account.default_proof_url
            : null,

          taskType: requirement.type,
          targetUrl,
          description: requirement.description.trim(),
          dependsOn,
          outputKey,
          inputFrom,
          form: requirement.form
            ? this.buildPlannedForm(requirement.form, account)
            : null,
        };

        tasks.push(plannedTask);
        accountTaskIds.push(plannedTaskId);
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

  private requiresProof(requirement: TaskRequirement): boolean {
    return (
      requirement.type === "X_COMMENT" ||
      requirement.type === "X_REPLY" ||
      requirement.type === "X_QUOTE"
    );
  }

  private requiresWalletConnection(requirement: TaskRequirement): boolean {
    if (requirement.type === "FORM_WALLET") {
      return true;
    }

    if (requirement.type === "FORM_SUBMIT") {
      return this.formContainsWalletField(requirement.form);
    }

    if (requirement.form && this.formContainsWalletField(requirement.form)) {
      return true;
    }

    return false;
  }

  private formContainsWalletField(form: FormRequirement | undefined): boolean {
    if (!form?.fields) {
      return false;
    }

    return form.fields.some((field) => field.type === "WALLET_ADDRESS");
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
    const successSelector = submit.successSelector?.trim() || null;
    const successText = submit.successText?.trim() || null;

    if (!selector && !label) {
      throw new Error(
        "Konfigurasi submit form harus memiliki selector atau label.",
      );
    }

    return {
      selector,
      label,
      successSelector,
      successText,
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
        wallet_address,
        default_proof_url
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
  default_proof_url: string | null;
}
