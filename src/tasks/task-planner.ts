import { AgentDatabase } from "../database/agent-database.js";

export type PlannedTaskType =
  | "X_FOLLOW"
  | "X_LIKE"
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

export interface TaskRequirement {
  type: PlannedTaskType;
  description: string;

  /**
   * URL yang menjadi target/source task.
   *
   * Contoh:
   * https://x.com/project/status/123
   */
  targetUrl?: string | null;

  /**
   * Kalau true, task ini menghasilkan URL milik account
   * yang menjalankannya.
   *
   * Contoh:
   * X_QUOTE menghasilkan:
   * https://x.com/Tuyul1/status/123
   */
  producesOwnTweetUrl?: boolean;

  /**
   * Kalau true, task membutuhkan hasil URL dari task
   * sebelumnya.
   *
   * Contoh:
   * FORM_SUBMIT membutuhkan ownTweetUrl dari X_QUOTE.
   */
  requiresOwnTweetUrl?: boolean;
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

        /*
         * Requirement normal akan mengikuti urutan requirement.
         *
         * Contoh:
         * FOLLOW → LIKE → QUOTE
         *
         * sehingga executor punya urutan yang eksplisit.
         */
        if (previousTaskId) {
          dependsOn.push(previousTaskId);
        }

        /*
         * Kalau task membutuhkan ownTweetUrl,
         * cari task sebelumnya yang menghasilkan URL tersebut.
         */
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
