import { BrowserExecutor } from "../browser/browser-executor.js";
import { LLMProvider, LLMGenerateResult } from "../providers/llm.interface.js";
import { TaskPlannerInput, TaskRequirement } from "../tasks/task-planner.js";

export interface ProjectTaskAnalyzerOptions {
  browser: BrowserExecutor;
  llm: LLMProvider;
}

interface AnalyzeProjectArgs {
  projectName: string;
  sourceUrl: string;
  requirements: TaskRequirement[];
}

export class ProjectTaskAnalyzer {
  constructor(private readonly options: ProjectTaskAnalyzerOptions) {}

  async analyze(sourceUrl: string): Promise<TaskPlannerInput> {
    const normalizedUrl = sourceUrl.trim();

    if (!normalizedUrl) {
      throw new Error("Source URL project wajib diisi.");
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      throw new Error(`Source URL project tidak valid: "${normalizedUrl}".`);
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error(
        "ProjectTaskAnalyzer hanya menerima URL http:// atau https://.",
      );
    }

    console.log(
      `🔎 [ProjectTaskAnalyzer] Inspecting project: ${parsedUrl.toString()}`,
    );

    const page = await this.options.browser.open(parsedUrl.toString());

    const context = this.buildPageContext(page.text);

    const result = await this.options.llm.generate({
      systemInstruction: this.buildSystemInstruction(),
      messages: [
        {
          role: "user",
          content: this.buildUserPrompt(
            parsedUrl.toString(),
            page.title,
            context,
          ),
        },
      ],
      tools: [this.createAnalyzeTool()],
    });

    const args = this.extractToolArguments(result);

    return this.validateAndNormalizeResult(args, parsedUrl.toString());
  }

  private buildPageContext(text: string): string {
    const normalized = text
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();

    const maxLength = 30_000;

    if (normalized.length <= maxLength) {
      return normalized;
    }

    console.warn(
      `⚠️ [ProjectTaskAnalyzer] Page text terlalu panjang. Dipotong ke ${maxLength} karakter.`,
    );

    return normalized.slice(0, maxLength);
  }

  private buildSystemInstruction(): string {
    return `
You are a project task requirement analyzer for an agentic automation system.

Your job is ONLY to inspect a project/quest/whitelist webpage and convert
the visible requirements into a structured task plan.

Do NOT execute any task.
Do NOT click anything.
Do NOT invent requirements that are not supported by the page.

The user will eventually want the agent to execute the requirements for
multiple accounts.

Supported task types:

OPEN_PAGE
X_FOLLOW
X_LIKE
X_REPOST
X_COMMENT
X_REPLY
X_QUOTE
X_POST
FORM
FORM_TWITTER
FORM_WALLET
FORM_SUBMIT
WHITELIST
CUSTOM

Rules:

1. Identify the project name from the page when possible.
2. Identify every actionable requirement that is clearly visible.
3. For X tasks, provide the actual target URL when it is available.
4. For website/form tasks, provide the relevant target URL.
5. Do not create one generic "complete everything" task if the page exposes
   multiple distinct requirements.
6. Preserve task order when the page implies an order.
7. If a requirement needs a wallet, classify it appropriately as
   FORM_WALLET or another supported wallet-related task.
8. If a requirement is ambiguous, use CUSTOM instead of inventing details.
9. Do not create project-specific executor logic.
10. Do not create CSS selectors unless they are explicitly needed later.
11. Do not assume wallet connection timing. The executor will determine
    whether wallet connection is needed before or during a later action.
12. targetUrl should point to the actual page relevant to the task whenever
    that URL is known.
13. Return only requirements that are actually supported by the inspected page.

The result will be passed into an existing TaskPlanner which creates
one task set per active account.
`.trim();
  }

  private buildUserPrompt(
    sourceUrl: string,
    title: string,
    pageText: string,
  ): string {
    return `
Analyze this project page.

SOURCE URL:
${sourceUrl}

PAGE TITLE:
${title}

VISIBLE PAGE CONTENT:
${pageText}

Create the structured project task plan.

Focus on WHAT the user needs to accomplish, not HOW the browser should
click or interact with the page.
`.trim();
  }

  private createAnalyzeTool() {
    return {
      name: "create_project_task_plan",
      description:
        "Create a structured task plan from the inspected project page.",
      riskLevel: "SAFE" as const,
      parameters: {
        type: "object" as const,
        properties: {
          projectName: {
            type: "string" as const,
            description: "Project name.",
          },
          sourceUrl: {
            type: "string" as const,
            description: "Original project URL.",
          },
          requirements: {
            type: "array" as const,
            description: "Actionable project requirements in execution order.",
            items: {
              type: "object" as const,
              properties: {
                type: {
                  type: "string" as const,
                  description: "Supported task type.",
                  enum: [
                    "OPEN_PAGE",
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
                    "WHITELIST",
                    "CUSTOM",
                  ],
                },
                description: {
                  type: "string" as const,
                  description: "Human-readable description of the requirement.",
                },
                targetUrl: {
                  type: "string" as const,
                  description:
                    "URL relevant to this specific requirement, if known.",
                },
                producesOwnTweetUrl: {
                  type: "boolean" as const,
                  description:
                    "Whether this task produces a URL of a tweet created by the account.",
                },
                requiresOwnTweetUrl: {
                  type: "boolean" as const,
                  description:
                    "Whether this task requires a previously created own tweet URL.",
                },
                form: {
                  type: "object" as const,
                  description:
                    "Optional form information when the requirement is a form task.",
                  properties: {
                    formType: {
                      type: "string" as const,
                      enum: ["WEBSITE", "GOOGLE_FORM"],
                    },
                    targetUrl: {
                      type: "string" as const,
                    },
                    fields: {
                      type: "array" as const,
                      items: {
                        type: "object" as const,
                        properties: {
                          type: {
                            type: "string" as const,
                            enum: [
                              "TWITTER_HANDLE",
                              "WALLET_ADDRESS",
                              "OWN_TWEET_URL",
                              "TEXT",
                              "EMAIL",
                              "DISCORD",
                              "TELEGRAM",
                              "CUSTOM",
                            ],
                          },
                          label: {
                            type: "string" as const,
                          },
                          required: {
                            type: "boolean" as const,
                          },
                          value: {
                            type: "string" as const,
                          },
                        },
                        required: ["type"],
                      },
                    },
                    checkboxes: {
                      type: "array" as const,
                      items: {
                        type: "object" as const,
                        properties: {
                          type: {
                            type: "string" as const,
                            enum: [
                              "X_FOLLOW",
                              "X_LIKE",
                              "X_REPOST",
                              "X_COMMENT",
                              "X_REPLY",
                              "X_QUOTE",
                              "CUSTOM",
                            ],
                          },
                          label: {
                            type: "string" as const,
                          },
                          required: {
                            type: "boolean" as const,
                          },
                          checked: {
                            type: "boolean" as const,
                          },
                        },
                        required: ["type"],
                      },
                    },
                  },
                  required: ["formType", "targetUrl"],
                },
              },
              required: ["type", "description"],
            },
          },
        },
        required: ["projectName", "sourceUrl", "requirements"],
      },
      async execute() {
        throw new Error(
          "create_project_task_plan hanya boleh dipanggil sebagai structured analyzer output.",
        );
      },
    };
  }

  private extractToolArguments(result: LLMGenerateResult): AnalyzeProjectArgs {
    const toolCall = result.toolCalls?.find(
      (call) => call.name === "create_project_task_plan",
    );

    if (!toolCall) {
      throw new Error(
        "Gemini tidak menghasilkan project task plan yang terstruktur.",
      );
    }

    return toolCall.args as AnalyzeProjectArgs;
  }

  private validateAndNormalizeResult(
    args: AnalyzeProjectArgs,
    sourceUrl: string,
  ): TaskPlannerInput {
    const projectName = String(args.projectName ?? "").trim();

    if (!projectName) {
      throw new Error("Project analyzer menghasilkan projectName kosong.");
    }

    if (!Array.isArray(args.requirements) || args.requirements.length === 0) {
      throw new Error(
        "Project analyzer tidak menemukan requirement task yang valid.",
      );
    }

    const requirements: TaskRequirement[] = args.requirements.map(
      (requirement, index) => {
        if (!requirement || typeof requirement !== "object") {
          throw new Error(`Requirement #${index + 1} tidak valid.`);
        }

        const type = String(requirement.type ?? "").trim();

        if (!type) {
          throw new Error(
            `Requirement #${index + 1} tidak memiliki task type.`,
          );
        }

        const description = String(requirement.description ?? "").trim();

        if (!description) {
          throw new Error(
            `Requirement #${index + 1} tidak memiliki description.`,
          );
        }

        return {
          type: type as TaskRequirement["type"],
          description,
          targetUrl:
            typeof requirement.targetUrl === "string"
              ? requirement.targetUrl.trim() || null
              : null,
          producesOwnTweetUrl: requirement.producesOwnTweetUrl ?? false,
          requiresOwnTweetUrl: requirement.requiresOwnTweetUrl ?? false,
          form: requirement.form
            ? {
                formType: requirement.form.formType,
                targetUrl: String(requirement.form.targetUrl ?? "").trim(),
                fields: (requirement.form.fields ?? []).map((field) => ({
                  type: field.type,
                  label: field.label?.trim(),
                  required: field.required ?? true,
                  value:
                    typeof field.value === "string" ? field.value.trim() : null,
                })),
                checkboxes: (requirement.form.checkboxes ?? []).map(
                  (checkbox) => ({
                    type: checkbox.type,
                    label: checkbox.label?.trim(),
                    required: checkbox.required ?? false,
                    checked: checkbox.checked ?? true,
                  }),
                ),
                submit: undefined,
              }
            : undefined,
        };
      },
    );

    return {
      projectName,
      sourceUrl,
      requirements,
    };
  }
}
