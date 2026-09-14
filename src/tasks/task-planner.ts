import { AgentDatabase } from "../database/agent-database.js";

export type PlannedTaskType =
  | "OPEN_PAGE"
  | "X_CONNECT"
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
  | "PROOF_URL"
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
    const projectName = this.normalizeRequiredString(
      input.projectName,
      "Nama project wajib diisi.",
    );

    const sourceUrl = this.normalizeRequiredString(
      input.sourceUrl,
      "Source URL wajib diisi.",
    );

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

    const normalizedRequirements = input.requirements.map(
      (requirement, index) =>
        this.normalizeRequirement(requirement, index, sourceUrl),
    );

    const tasks: PlannedTask[] = [];

    for (const account of accounts) {
      const accountTaskIds: string[] = [];

      for (
        let requirementIndex = 0;
        requirementIndex < normalizedRequirements.length;
        requirementIndex++
      ) {
        const requirement = normalizedRequirements[requirementIndex];

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
         * IMPORTANT:
         * WALLET_ADDRESS only means "fill this address into a field".
         * It does NOT automatically mean that a wallet UI must be connected.
         *
         * Actual wallet connection requirements use FORM_WALLET or an
         * explicit wallet-interaction task.
         */
        if (this.requiresWalletConnection(requirement)) {
          const connectTaskId = `account-${account.id}-wallet-${
            requirementIndex + 1
          }`;

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
              requirement.targetUrl || requirement.form?.targetUrl || sourceUrl,
            description:
              `Connect and verify wallet for account "${account.name}" ` +
              `before executing: ${requirement.description}`,
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

        /**
         * X_COMMENT / X_REPLY / X_QUOTE are proof-producing actions,
         * not consumers of another task's OWN_TWEET_URL.
         *
         * The account's defaultProofUrl is used later by PROOF_URL
         * form fields.
         *
         * requiresOwnTweetUrl remains meaningful for other task types,
         * especially forms that explicitly depend on an X_POST task.
         */
        const requiresPreviousOwnTweetUrl =
          requirement.requiresOwnTweetUrl === true &&
          requirement.type !== "X_COMMENT" &&
          requirement.type !== "X_REPLY" &&
          requirement.type !== "X_QUOTE";

        if (requiresPreviousOwnTweetUrl) {
          const producer = this.findOwnTweetProducer(tasks, account.id);

          if (!producer) {
            throw new Error(
              `Task "${requirement.type}" untuk account "${account.name}" ` +
                `membutuhkan ownTweetUrl, tetapi belum ada task yang menghasilkan ownTweetUrl.`,
            );
          }

          inputFrom = producer.planTaskId;

          if (!dependsOn.includes(producer.planTaskId)) {
            dependsOn.push(producer.planTaskId);
          }
        }

        /**
         * OWN_TWEET_URL is produced only by X_POST.
         *
         * X_COMMENT / X_REPLY / X_QUOTE produce proof/evidence,
         * not an OWN_TWEET_URL dependency.
         */
        const producesOwnTweetUrl =
          requirement.type === "X_POST" &&
          requirement.producesOwnTweetUrl === true;

        const outputKey = producesOwnTweetUrl
          ? `account_${account.id}_own_tweet_url`
          : null;

        const plannedTaskId = `account-${account.id}-task-${
          requirementIndex + 1
        }`;

        /**
         * Only OPEN_PAGE receives sourceUrl as an implicit target.
         *
         * Other task types keep targetUrl null when the analyzer
         * does not know the actual target.
         */
        const targetUrl =
          requirement.targetUrl ||
          (requirement.type === "OPEN_PAGE" ? sourceUrl : null);

        const plannedTask: PlannedTask = {
          planTaskId: plannedTaskId,
          projectName,
          accountId: account.id,
          accountName: account.name,
          twitterHandle: account.twitter_handle,
          walletAddress: account.wallet_address,

          /**
           * Proof for comment/reply/quote tasks comes from the
           * account profile configuration.
           */
          proof: this.requiresProof(requirement)
            ? account.default_proof_url
            : null,

          taskType: requirement.type,
          targetUrl,
          description: requirement.description,
          dependsOn,
          outputKey,
          inputFrom,
          form: requirement.form
            ? this.buildPlannedForm(requirement.form, account, sourceUrl)
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

  private normalizeRequirement(
    requirement: TaskRequirement,
    index: number,
    sourceUrl: string,
  ): TaskRequirement {
    if (!requirement || typeof requirement !== "object") {
      throw new Error(`Requirement #${index + 1} tidak valid.`);
    }

    const type = this.normalizeTaskType(requirement.type);

    if (!type) {
      throw new Error(
        `Requirement #${index + 1} memiliki task type yang tidak valid.`,
      );
    }

    const description = this.normalizeRequiredString(
      requirement.description,
      `Requirement #${index + 1} tidak memiliki description.`,
    );

    const targetUrl = this.normalizeOptionalString(requirement.targetUrl);

    /**
     * X_COMMENT / X_REPLY / X_QUOTE never consume an OWN_TWEET_URL
     * from a previous task.
     */
    const requiresOwnTweetUrl =
      requirement.requiresOwnTweetUrl === true &&
      type !== "X_COMMENT" &&
      type !== "X_REPLY" &&
      type !== "X_QUOTE";

    /**
     * Only X_POST can produce OWN_TWEET_URL.
     */
    const producesOwnTweetUrl =
      type === "X_POST" && requirement.producesOwnTweetUrl === true;

    let form: FormRequirement | undefined;

    if (requirement.form) {
      form = this.normalizeFormRequirement(
        requirement.form,
        index,
        targetUrl || sourceUrl,
      );
    }

    return {
      type,
      description,
      targetUrl,
      producesOwnTweetUrl,
      requiresOwnTweetUrl,
      form,
    };
  }

  private normalizeFormRequirement(
    form: FormRequirement,
    requirementIndex: number,
    fallbackUrl: string,
  ): FormRequirement {
    if (!form || typeof form !== "object") {
      throw new Error(
        `Form pada requirement #${requirementIndex + 1} tidak valid.`,
      );
    }

    const formType = this.normalizeFormType(form.formType);

    if (!formType) {
      throw new Error(
        `Form pada requirement #${requirementIndex + 1} memiliki formType yang tidak valid.`,
      );
    }

    /**
     * Some LLM responses may omit form.targetUrl even though the
     * requirement itself has a targetUrl.
     *
     * Never crash on undefined.trim().
     */
    const targetUrl =
      this.normalizeOptionalString(form.targetUrl) ||
      this.normalizeOptionalString(fallbackUrl);

    if (!targetUrl) {
      throw new Error(
        `Target URL form pada requirement #${
          requirementIndex + 1
        } tidak dapat ditentukan.`,
      );
    }

    const fields = Array.isArray(form.fields)
      ? form.fields
          .filter((field) => field && typeof field === "object")
          .map((field) => this.normalizeFormField(field))
      : [];

    const checkboxes = Array.isArray(form.checkboxes)
      ? form.checkboxes
          .filter((checkbox) => checkbox && typeof checkbox === "object")
          .map((checkbox) => this.normalizeFormCheckbox(checkbox))
      : [];

    const submit = this.normalizeFormSubmit(form.submit);

    return {
      formType,
      targetUrl,
      fields,
      checkboxes,
      submit,
    };
  }

  private normalizeFormField(
    field: FormFieldRequirement,
  ): FormFieldRequirement {
    const type = this.normalizeFormFieldType(field.type);

    if (!type) {
      /**
       * Unknown field types should not crash the entire plan.
       *
       * CUSTOM is the generic escape hatch for forms that introduce
       * a field concept we do not have a specialized mapper for yet.
       */
      return {
        type: "CUSTOM",
        label: this.normalizeOptionalString(field.label) ?? undefined,
        required: field.required ?? true,
        value: this.normalizeOptionalString(field.value),
      };
    }

    return {
      type,
      label: this.normalizeOptionalString(field.label) ?? undefined,
      required: field.required ?? true,
      value: this.normalizeOptionalString(field.value),
    };
  }

  private normalizeFormCheckbox(
    checkbox: FormCheckboxRequirement,
  ): FormCheckboxRequirement {
    const type = this.normalizeFormCheckboxType(checkbox.type);

    return {
      type: type || "CUSTOM",
      label: this.normalizeOptionalString(checkbox.label) ?? undefined,
      required: checkbox.required ?? false,
      checked: checkbox.checked ?? true,
    };
  }

  private normalizeFormSubmit(
    submit: FormSubmitRequirement | undefined,
  ): FormSubmitRequirement | undefined {
    if (!submit || typeof submit !== "object") {
      return undefined;
    }

    const selector = this.normalizeOptionalString(submit.selector);
    const label = this.normalizeOptionalString(submit.label);
    const successSelector = this.normalizeOptionalString(
      submit.successSelector,
    );
    const successText = this.normalizeOptionalString(submit.successText);

    /**
     * Submit configuration is optional.
     *
     * If Gemini gives an empty/incomplete submit object, let the generic
     * form executor determine the submit strategy later.
     */
    if (!selector && !label) {
      return {
        selector: undefined,
        label: undefined,
        successSelector: successSelector || undefined,
        successText: successText || undefined,
      };
    }

    return {
      selector: selector || undefined,
      label: label || undefined,
      successSelector: successSelector || undefined,
      successText: successText || undefined,
    };
  }

  private buildPlannedForm(
    form: FormRequirement,
    account: AccountRow,
    fallbackUrl: string,
  ): PlannedForm {
    const targetUrl =
      this.normalizeOptionalString(form.targetUrl) ||
      this.normalizeOptionalString(fallbackUrl);

    if (!targetUrl) {
      throw new Error(
        `Target URL form untuk account "${account.name}" tidak dapat ditentukan.`,
      );
    }

    const fields: PlannedFormField[] = (form.fields ?? []).map((field) => ({
      type: field.type,
      label: this.normalizeOptionalString(field.label),
      required: field.required ?? true,
      value: this.resolveFormFieldValue(field, account),
    }));

    const checkboxes: PlannedFormCheckbox[] = (form.checkboxes ?? []).map(
      (checkbox) => ({
        type: checkbox.type,
        label: this.normalizeOptionalString(checkbox.label),
        required: checkbox.required ?? false,
        checked: checkbox.checked ?? true,
      }),
    );

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

    const selector = this.normalizeOptionalString(submit.selector);
    const label = this.normalizeOptionalString(submit.label);
    const successSelector = this.normalizeOptionalString(
      submit.successSelector,
    );
    const successText = this.normalizeOptionalString(submit.successText);

    /**
     * Submit metadata is descriptive, not mandatory.
     *
     * The executor can use generic submit detection when no explicit
     * selector/label was provided.
     */
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
        return this.normalizeOptionalString(account.twitter_handle);

      case "WALLET_ADDRESS":
        return this.normalizeOptionalString(account.wallet_address);

      case "PROOF_URL":
        /**
         * PROOF_URL is a generic form field.
         *
         * The account's configured defaultProofUrl is the intended
         * proof source for the current task architecture.
         */
        return this.normalizeOptionalString(account.default_proof_url);

      case "OWN_TWEET_URL":
        /**
         * This value cannot be known during static planning.
         *
         * It must come from an X_POST task when that capability is
         * explicitly required.
         */
        return null;

      default:
        return this.normalizeOptionalString(field.value);
    }
  }

  private requiresProof(requirement: TaskRequirement): boolean {
    return (
      requirement.type === "X_COMMENT" ||
      requirement.type === "X_REPLY" ||
      requirement.type === "X_QUOTE"
    );
  }

  private requiresWalletConnection(requirement: TaskRequirement): boolean {
    /**
     * FORM_WALLET explicitly represents wallet interaction.
     */
    if (requirement.type === "FORM_WALLET") {
      return true;
    }

    /**
     * FORM_SUBMIT may explicitly represent a wallet-interaction form.
     * However, merely having a WALLET_ADDRESS field is NOT enough to
     * require a wallet connection.
     */
    if (requirement.type === "FORM_SUBMIT") {
      return false;
    }

    /**
     * Generic FORM with a wallet-address input only needs the stored
     * wallet address filled into the field.
     *
     * Do not insert CONNECT_WALLET automatically.
     */
    return false;
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
      .find(
        (task) =>
          task.accountId === accountId &&
          task.outputKey !== null &&
          task.taskType === "X_POST",
      );
  }

  private normalizeRequiredString(
    value: unknown,
    errorMessage: string,
  ): string {
    if (typeof value !== "string") {
      throw new Error(errorMessage);
    }

    const normalized = value.trim();

    if (!normalized) {
      throw new Error(errorMessage);
    }

    return normalized;
  }

  private normalizeOptionalString(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim();

    return normalized || null;
  }

  private normalizeTaskType(value: unknown): PlannedTaskType | null {
    const allowed: PlannedTaskType[] = [
      "OPEN_PAGE",
      "X_CONNECT",
      "X_FOLLOW",
      "X_LIKE",
      "X_REPOST",
      "X_COMMENT",
      "X_REPLY",
      "X_QUOTE",
      "X_POST",
      "FORM",
      "FORM_TWITTER",
      "FORM_WALLET",
      "FORM_SUBMIT",
      "CONNECT_WALLET",
      "WHITELIST",
      "CUSTOM",
    ];

    return typeof value === "string" &&
      allowed.includes(value as PlannedTaskType)
      ? (value as PlannedTaskType)
      : null;
  }

  private normalizeFormType(value: unknown): FormType | null {
    if (value === "WEBSITE" || value === "GOOGLE_FORM") {
      return value;
    }

    return null;
  }

  private normalizeFormFieldType(value: unknown): FormFieldType | null {
    const allowed: FormFieldType[] = [
      "TWITTER_HANDLE",
      "WALLET_ADDRESS",
      "OWN_TWEET_URL",
      "PROOF_URL",
      "TEXT",
      "EMAIL",
      "DISCORD",
      "TELEGRAM",
      "CUSTOM",
    ];

    return typeof value === "string" && allowed.includes(value as FormFieldType)
      ? (value as FormFieldType)
      : null;
  }

  private normalizeFormCheckboxType(value: unknown): FormCheckboxType | null {
    const allowed: FormCheckboxType[] = [
      "X_FOLLOW",
      "X_LIKE",
      "X_REPOST",
      "X_COMMENT",
      "X_REPLY",
      "X_QUOTE",
      "CUSTOM",
    ];

    return typeof value === "string" &&
      allowed.includes(value as FormCheckboxType)
      ? (value as FormCheckboxType)
      : null;
  }
}

interface AccountRow {
  id: number;
  name: string;
  twitter_handle: string | null;
  wallet_address: string | null;
  default_proof_url: string | null;
}
