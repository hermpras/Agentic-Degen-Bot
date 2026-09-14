import { BrowserExecutor } from "../browser/browser-executor.js";
import { LLMProvider, LLMGenerateResult } from "../providers/llm.interface.js";
import { TaskPlannerInput, TaskRequirement } from "../tasks/task-planner.js";

export interface ProjectTaskAnalyzerOptions {
  browser: BrowserExecutor;
  llm: LLMProvider;
}

interface TaskEvidence {
  kind: "ACTION" | "FORM" | "CONTEXT";

  description: string;

  sourceQuote: string;

  actionType?: string;

  targetUrl?: string | null;

  targetKind?:
    | "X_PROFILE"
    | "X_STATUS"
    | "X_INTENT"
    | "WEBSITE"
    | "GOOGLE_FORM"
    | "UNKNOWN";

  producesOwnTweetUrl?: boolean;

  requiresOwnTweetUrl?: boolean;

  walletInteraction?: "NONE" | "CONNECT" | "SIGN" | "APPROVE" | "UNKNOWN";

  form?: {
    formType?: "WEBSITE" | "GOOGLE_FORM";

    targetUrl?: string;

    fields?: Array<{
      type?: string;
      label?: string;
      required?: boolean;
      value?: string | null;
    }>;

    checkboxes?: Array<{
      type?: string;
      label?: string;
      required?: boolean;
      checked?: boolean;
    }>;
  };
}

interface AnalyzeProjectArgs {
  projectName: string;
  sourceUrl: string;
  evidence: TaskEvidence[];
}

const X_TASK_TYPES = new Set([
  "X_FOLLOW",
  "X_LIKE",
  "X_REPOST",
  "X_COMMENT",
  "X_REPLY",
  "X_QUOTE",
  "X_POST",
]);

const X_POST_ACTION_TYPES = new Set([
  "X_LIKE",
  "X_REPOST",
  "X_COMMENT",
  "X_REPLY",
  "X_QUOTE",
]);

const SUPPORTED_TASK_TYPES = new Set([
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
]);

const SUPPORTED_FORM_FIELD_TYPES = new Set([
  "TWITTER_HANDLE",
  "WALLET_ADDRESS",
  "OWN_TWEET_URL",
  "PROOF_URL",
  "TEXT",
  "EMAIL",
  "DISCORD",
  "TELEGRAM",
  "CUSTOM",
]);

const SUPPORTED_CHECKBOX_TYPES = new Set([
  "X_FOLLOW",
  "X_LIKE",
  "X_REPOST",
  "X_COMMENT",
  "X_REPLY",
  "X_QUOTE",
  "CUSTOM",
]);

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

    const context = this.buildPageContext(page.text, page.links, page.url);

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

    /*
     * LLM evidence tetap menjadi sumber utama interpretasi.
     *
     * Tetapi action X yang benar-benar terlihat di halaman juga kita
     * ekstrak secara deterministic dari page text + discovered links.
     *
     * Tujuannya supaya satu missed action dari LLM tidak membuat
     * requirement hilang seluruhnya.
     */
    const deterministicEvidence = this.extractDeterministicXEvidence(
      page.text,
      page.links,
    );

    if (deterministicEvidence.length > 0) {
      console.log(
        `🧭 [ProjectTaskAnalyzer] Deterministic X evidence ditemukan: ${deterministicEvidence.length}`,
      );

      for (const evidence of deterministicEvidence) {
        console.log(`   • ${evidence.actionType}: ${evidence.description}`);
      }
    }

    const mergedEvidence = this.mergeEvidence(
      args.evidence,
      deterministicEvidence,
    );

    return this.validateAndNormalizeResult(
      {
        ...args,
        evidence: mergedEvidence,
      },
      parsedUrl.toString(),
    );
  }

  private buildPageContext(
    text: string,
    links: Array<{
      text: string;
      href: string;
    }>,
    currentUrl: string,
  ): string {
    const normalizedText = text
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();

    const maxTextLength = 30_000;

    const pageText =
      normalizedText.length <= maxTextLength
        ? normalizedText
        : normalizedText.slice(0, maxTextLength);

    if (normalizedText.length > maxTextLength) {
      console.warn(
        `⚠️ [ProjectTaskAnalyzer] Page text terlalu panjang. Dipotong ke ${maxTextLength} karakter.`,
      );
    }

    const normalizedLinks = links
      .map((link) => ({
        text: String(link.text ?? "")
          .replace(/\s+/g, " ")
          .trim(),
        href: String(link.href ?? "").trim(),
      }))
      .filter((link) => link.href);

    const uniqueLinks = Array.from(
      new Map(
        normalizedLinks.map((link) => [`${link.text}\n${link.href}`, link]),
      ).values(),
    );

    const maxLinks = 500;

    const linksForContext = uniqueLinks.slice(0, maxLinks);

    const linkLines = linksForContext.map((link, index) => {
      const label = link.text || "(no visible link text)";
      return `${index + 1}. [${label}] ${link.href}`;
    });

    return [
      `CURRENT PAGE URL:\n${currentUrl}`,
      "",
      "VISIBLE PAGE CONTENT:",
      pageText,
      "",
      "DISCOVERED PAGE LINKS:",
      linkLines.length > 0
        ? linkLines.join("\n")
        : "(No anchor links discovered.)",
    ].join("\n");
  }

  private buildSystemInstruction(): string {
    return `
You are the evidence analyzer for an agentic project-task automation system.

Your job is to inspect a project/quest/whitelist webpage and collect
grounded evidence about what the user actually needs to accomplish.

IMPORTANT ARCHITECTURE:

You do NOT directly produce final TaskRequirement semantics.

You produce intermediate TaskEvidence.

A deterministic normalization layer will convert your evidence into
final TaskRequirement objects.

Therefore:

- Be flexible when interpreting natural language.
- Be conservative when evidence is missing.
- Never invent URLs.
- Never invent requirements.
- Never turn general/background information into an actionable task.
- Never assume that mentioning a wallet means the user must connect a wallet.
- Never assume that mentioning X means an X task exists.
- Never collapse multiple distinct actions into one action.
- When evidence is insufficient, mark the relevant target or interpretation
  as unresolved instead of guessing.

EVIDENCE TYPES:

ACTION

A concrete action the user is instructed to perform.

FORM

A concrete form/application submission requirement.

CONTEXT

Background information that helps explain the project but is NOT itself
an actionable task.

Only ACTION and FORM evidence will normally become executable tasks.

SUPPORTED ACTION TYPES:

OPEN_PAGE
X_FOLLOW
X_LIKE
X_REPOST
X_COMMENT
X_REPLY
X_QUOTE
X_POST
WHITELIST
CUSTOM

SUPPORTED FORM TYPES:

FORM
FORM_TWITTER
FORM_WALLET
FORM_SUBMIT

SUPPORTED FORM FIELD TYPES:

TWITTER_HANDLE
WALLET_ADDRESS
OWN_TWEET_URL
PROOF_URL
TEXT
EMAIL
DISCORD
TELEGRAM
CUSTOM

X SEMANTICS:

- "follow @name" => X_FOLLOW
- "like this post" => X_LIKE
- "retweet this post" => X_REPOST
- "repost this post" => X_REPOST
- "comment on this post" => X_COMMENT
- "reply to this post" => X_REPLY
- "quote this post" => X_QUOTE
- "make/create/post a standalone post" => X_POST

IMPORTANT:

If one sentence contains multiple distinct actions, create separate
ACTION evidence entries.

Example:

"Like, Retweet and comment on the pinned post"

must become:

1. X_LIKE
2. X_REPOST
3. X_COMMENT

Do NOT turn the whole sentence into X_REPLY.

Another example:

"Like & Repost pinned post"

must become:

1. X_LIKE
2. X_REPOST

Do not collapse them.

COMMENT VS REPLY:

If the project explicitly says "comment", use X_COMMENT.

If it explicitly says "reply", use X_REPLY.

Do not reinterpret "comment" as X_REPLY merely because the X UI technically
implements comments using replies.

OWN TWEET URL:

X_COMMENT, X_REPLY and X_QUOTE do NOT automatically require an own tweet URL.

Only mark requiresOwnTweetUrl when the page explicitly requires a URL of
a previously-created standalone post owned by the account.

Only X_POST can normally produce an own tweet URL.

producesOwnTweetUrl must NOT be used for:

- X_FOLLOW
- X_LIKE
- X_REPOST
- X_COMMENT
- X_REPLY
- X_QUOTE

X TARGETS:

For X_FOLLOW:

- Prefer an actual X profile URL.

For post-level actions:

- Prefer an exact discovered X status URL.
- A normal status URL generally contains /status/.
- Do not invent a status ID.
- Do not convert a project homepage/application URL into an X target.
- Do not use an X profile URL as the target of a post-level action.
- An X intent URL may be recorded as evidence when it is explicitly
  discovered, but do not manufacture one.

If the page says "repost the pinned post" but no exact post URL is exposed:

- Keep the ACTION evidence.
- Do not invent a status URL.
- Leave target unresolved.

WALLET SEMANTICS:

These are DIFFERENT:

"submit your wallet address"
"enter wallet address"
"provide wallet address"

=> wallet address form field only.

These are actual wallet interactions:

"connect wallet"
"connect your wallet"
"sign a message"
"sign transaction"
"approve transaction"
"approve in wallet"

Only classify wallet interaction when the page explicitly requires it.

Background/context such as:

"Connect your wallet to prepare for mint"

does NOT automatically mean the whitelist application itself requires
wallet connection.

Always prioritize the actual actionable application instructions.

FORM SEMANTICS:

If the form asks for:

- X username
- wallet address
- comment link
- reply link
- quote link
- proof URL
- evidence URL

represent them as separate fields.

Use PROOF_URL when the field is evidence proving completion of an action.

Use OWN_TWEET_URL only for a standalone post created by the account.

A WALLET_ADDRESS field alone does NOT imply FORM_WALLET.

FORM_WALLET should only be used when there is explicit evidence of an
actual wallet interaction.

If the form only asks for a wallet address, use FORM or FORM_SUBMIT.

EVIDENCE GROUNDING:

Every ACTION or FORM evidence item must contain:

- description
- sourceQuote

sourceQuote should be a short quote or faithful excerpt from the inspected
page supporting the requirement.

Do not create an evidence item merely because something seems common for
NFT whitelist projects.

For every target URL, use only URLs actually present in the inspected
page context or the current page URL when it is genuinely the target.

Do not invent URLs.

CONTEXT:

Use CONTEXT evidence for statements such as:

- collection information
- mint information
- blockchain information
- general explanations
- background wallet information
- announcements that do not instruct the user to perform an action

Do not convert CONTEXT into executable tasks.

ORDER:

Preserve the order in which actionable requirements appear on the page
when that order is reasonably clear.

FLEXIBILITY:

Different projects may express the same action differently.

Examples:

"Repost the pinned announcement"
"RT the pinned tweet"
"Retweet our latest post"

These may all represent X_REPOST.

Likewise:

"Drop a comment"
"Comment below"
"Leave a comment on the pinned post"

may represent X_COMMENT.

Interpret language semantically, but only when supported by the page evidence.

Do not write project-specific rules.

Return evidence, not browser selectors and not executor logic.
`.trim();
  }

  private buildUserPrompt(
    sourceUrl: string,
    title: string,
    pageContext: string,
  ): string {
    return `
Analyze this project page and produce grounded intermediate TaskEvidence.

SOURCE URL:

${sourceUrl}

PAGE TITLE:

${title}

PAGE INSPECTION CONTEXT:

${pageContext}

IMPORTANT:

Do NOT directly think in terms of the final TaskPlanner implementation.

First identify the actual user-facing requirements from the page.

For every actionable requirement:

- create ACTION or FORM evidence
- provide a short sourceQuote
- provide the most specific verified target URL available
- do not invent missing URLs

For X actions:

- Follow => X_FOLLOW
- Like => X_LIKE
- Retweet/Repost => X_REPOST
- Comment => X_COMMENT
- Reply => X_REPLY
- Quote => X_QUOTE
- Create standalone post => X_POST

If one sentence contains multiple actions, split them.

Example:

"Like, Retweet and comment on the pinned post"

must become three separate evidence items:

X_LIKE
X_REPOST
X_COMMENT

Example:

"Like & Repost pinned post"

must become:

X_LIKE
X_REPOST

For post-level X actions, inspect DISCOVERED PAGE LINKS and prefer an exact
/status/ URL when one exists.

If no exact X post URL exists, DO NOT invent one.

For X_FOLLOW, an X profile URL is valid.

Do not use an X profile URL as the target for
X_LIKE/X_REPOST/X_COMMENT/X_REPLY/X_QUOTE.

WALLET:

If the page says:

"submit wallet address"

that means WALLET_ADDRESS form field.

It does NOT automatically mean wallet connection.

Only mark actual wallet interaction when the page explicitly says:

- connect wallet
- connect your wallet
- sign
- approve

Background explanations about wallets should be treated as CONTEXT.

FORMS:

Separate each field.

Examples:

X username => TWITTER_HANDLE
wallet address => WALLET_ADDRESS
comment/reply/quote proof => PROOF_URL
standalone own post URL => OWN_TWEET_URL

Do not invent proof values.

Return only evidence supported by the inspected page.
`.trim();
  }

  private createAnalyzeTool() {
    return {
      name: "create_project_task_evidence",
      description:
        "Create grounded intermediate task evidence from the inspected project page.",
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

          evidence: {
            type: "array" as const,
            description:
              "Intermediate evidence describing actionable requirements and relevant context.",

            items: {
              type: "object" as const,

              properties: {
                kind: {
                  type: "string" as const,
                  enum: ["ACTION", "FORM", "CONTEXT"],
                },

                description: {
                  type: "string" as const,
                  description: "Human-readable description of the evidence.",
                },

                sourceQuote: {
                  type: "string" as const,
                  description:
                    "Short quote or faithful excerpt from the page supporting this evidence.",
                },

                actionType: {
                  type: "string" as const,
                  enum: [
                    "OPEN_PAGE",
                    "X_FOLLOW",
                    "X_LIKE",
                    "X_REPOST",
                    "X_COMMENT",
                    "X_REPLY",
                    "X_QUOTE",
                    "X_POST",
                    "WHITELIST",
                    "CUSTOM",
                  ],
                },

                targetUrl: {
                  type: "string" as const,
                  description:
                    "Verified target URL discovered from the page, if available.",
                },

                targetKind: {
                  type: "string" as const,
                  enum: [
                    "X_PROFILE",
                    "X_STATUS",
                    "X_INTENT",
                    "WEBSITE",
                    "GOOGLE_FORM",
                    "UNKNOWN",
                  ],
                },

                producesOwnTweetUrl: {
                  type: "boolean" as const,
                  description:
                    "True only when this action creates a standalone X post.",
                },

                requiresOwnTweetUrl: {
                  type: "boolean" as const,
                  description:
                    "True only when this requirement explicitly needs a previously created standalone X post URL.",
                },

                walletInteraction: {
                  type: "string" as const,
                  enum: ["NONE", "CONNECT", "SIGN", "APPROVE", "UNKNOWN"],
                },

                form: {
                  type: "object" as const,

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
                              "PROOF_URL",
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

              required: ["kind", "description", "sourceQuote"],
            },
          },
        },

        required: ["projectName", "sourceUrl", "evidence"],
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
      (call) => call.name === "create_project_task_evidence",
    );

    if (!toolCall) {
      throw new Error(
        "Gemini tidak menghasilkan project task evidence yang terstruktur.",
      );
    }

    return toolCall.args as AnalyzeProjectArgs;
  }

  /**
   * Public static entry point.
   *
   * Dipakai oleh create-project-task-plan.tool.ts
   * ketika LLM sudah menghasilkan evidence.
   *
   * Tidak membuka browser dan tidak memanggil LLM lagi.
   */
  static normalizeEvidenceToTaskPlannerInput(
    args: AnalyzeProjectArgs,
  ): TaskPlannerInput {
    const projectName = String(args.projectName ?? "").trim();

    const sourceUrl = String(args.sourceUrl ?? "").trim();

    if (!projectName) {
      throw new Error("Project analyzer menghasilkan projectName kosong.");
    }

    if (!sourceUrl) {
      throw new Error("Project analyzer menghasilkan sourceUrl kosong.");
    }

    if (!Array.isArray(args.evidence) || args.evidence.length === 0) {
      throw new Error(
        "Project analyzer tidak menghasilkan evidence yang valid.",
      );
    }

    const requirements: TaskRequirement[] = [];

    /**
     * Kita pakai helper instance-less.
     *
     * Semua method normalisasi di bawah ini
     * tidak bergantung pada browser atau LLM.
     */
    const normalizer = Object.create(
      ProjectTaskAnalyzer.prototype,
    ) as ProjectTaskAnalyzer;

    for (let index = 0; index < args.evidence.length; index += 1) {
      const evidence = args.evidence[index];

      if (!evidence || typeof evidence !== "object") {
        throw new Error(`Evidence #${index + 1} tidak valid.`);
      }

      const kind = String(evidence.kind ?? "")
        .trim()
        .toUpperCase();

      if (!["ACTION", "FORM", "CONTEXT"].includes(kind)) {
        throw new Error(
          `Evidence #${index + 1} memiliki kind yang tidak valid: "${kind}".`,
        );
      }

      const description = String(evidence.description ?? "").trim();

      const sourceQuote = String(evidence.sourceQuote ?? "").trim();

      if (!description) {
        throw new Error(`Evidence #${index + 1} tidak memiliki description.`);
      }

      if (!sourceQuote) {
        throw new Error(`Evidence #${index + 1} tidak memiliki sourceQuote.`);
      }

      if (kind === "CONTEXT") {
        continue;
      }

      if (kind === "FORM") {
        const requirement = normalizer.normalizeFormEvidence(
          evidence,
          sourceUrl,
        );

        if (requirement) {
          requirements.push(requirement);
        }

        continue;
      }

      const normalizedActions = normalizer.normalizeActionEvidence(
        evidence,
        sourceUrl,
      );

      requirements.push(...normalizedActions);
    }

    if (requirements.length === 0) {
      throw new Error(
        "Project analyzer tidak menemukan actionable task yang cukup jelas.",
      );
    }

    return {
      projectName,
      sourceUrl,
      requirements,
    };
  }

  private validateAndNormalizeResult(
    args: AnalyzeProjectArgs,
    sourceUrl: string,
  ): TaskPlannerInput {
    return ProjectTaskAnalyzer.normalizeEvidenceToTaskPlannerInput({
      ...args,
      sourceUrl,
    });
  }

  /**
   * Extract X actions deterministically dari halaman yang benar-benar
   * sudah dibaca browser.
   *
   * Prinsip:
   * - hanya mencari action verb yang nyata di page text
   * - hanya menggunakan URL X yang benar-benar ditemukan
   * - tidak membuat tweet/status ID
   * - tidak menganggap setiap mention "X/Twitter" sebagai task
   */
  private extractDeterministicXEvidence(
    text: string,
    links: Array<{
      text: string;
      href: string;
    }>,
  ): TaskEvidence[] {
    const normalizedText = text
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();

    if (!normalizedText) {
      return [];
    }

    const normalizedLinks = links
      .map((link) => ({
        text: String(link.text ?? "")
          .replace(/\s+/g, " ")
          .trim(),

        href: String(link.href ?? "").trim(),
      }))
      .filter((link) => link.href);

    const xProfileUrls = normalizedLinks
      .map((link) => link.href)
      .filter((href) => this.isValidXProfileHref(href));

    const xStatusUrls = normalizedLinks
      .map((link) => link.href)
      .filter((href) => this.isValidXStatusHref(href));

    const xIntentUrls = normalizedLinks
      .map((link) => link.href)
      .filter((href) => this.isValidXIntentHref(href));

    const targetStatusUrl = xStatusUrls.length > 0 ? xStatusUrls[0] : null;

    const targetProfileUrl = xProfileUrls.length > 0 ? xProfileUrls[0] : null;

    const evidence: TaskEvidence[] = [];

    /*
     * Pecah page text menjadi unit yang lebih kecil.
     *
     * Ini penting supaya kata "like" yang muncul jauh di bagian
     * background project tidak otomatis dianggap task.
     */
    const textUnits = normalizedText
      .split(/\n+|(?<=[.!?])\s+/)
      .map((unit) => unit.trim())
      .filter(Boolean);

    const actionDetectors: Array<{
      type:
        | "X_FOLLOW"
        | "X_LIKE"
        | "X_REPOST"
        | "X_COMMENT"
        | "X_REPLY"
        | "X_QUOTE";

      regex: RegExp;

      labels: string[];
    }> = [
      {
        type: "X_FOLLOW",
        regex:
          /\b(?:follow|follow\s+us|follow\s+our|follow\s+on\s+x|follow\s+on\s+twitter)\b/i,
        labels: ["follow"],
      },

      {
        type: "X_LIKE",
        regex: /\b(?:like|like\s+this|like\s+the|like\s+our)\b/i,
        labels: ["like"],
      },

      {
        type: "X_REPOST",
        regex: /\b(?:repost|retweet|retweeting|rt)\b/i,
        labels: ["repost", "retweet", "rt"],
      },

      {
        type: "X_COMMENT",
        regex:
          /\b(?:comment|comment\s+on|leave\s+a\s+comment|drop\s+a\s+comment)\b/i,
        labels: ["comment"],
      },

      {
        type: "X_REPLY",
        regex: /\b(?:reply|reply\s+to|replying)\b/i,
        labels: ["reply"],
      },

      {
        type: "X_QUOTE",
        regex: /\b(?:quote|quote\s+tweet|quote\s+this|quote\s+the)\b/i,
        labels: ["quote"],
      },
    ];

    for (const unit of textUnits) {
      const hasXContext =
        /\b(?:x\.com|twitter\.com|twitter|tweet|tweeting|post|pinned post|pinned tweet|social)\b/i.test(
          unit,
        );

      if (!hasXContext) {
        continue;
      }

      for (const detector of actionDetectors) {
        if (!detector.regex.test(unit)) {
          continue;
        }

        const targetUrl =
          detector.type === "X_FOLLOW"
            ? targetProfileUrl
            : (targetStatusUrl ??
              this.findMatchingIntentUrl(detector.type, xIntentUrls));

        evidence.push({
          kind: "ACTION",
          description: this.buildDeterministicActionDescription(
            detector.type,
            unit,
          ),
          sourceQuote: unit,
          actionType: detector.type,
          targetUrl,
          targetKind: targetUrl ? this.detectXTargetKind(targetUrl) : "UNKNOWN",
          producesOwnTweetUrl: false,
          requiresOwnTweetUrl: false,
          walletInteraction: "NONE",
        });
      }
    }

    /*
     * Ada halaman yang menampilkan action sebagai link text,
     * sementara kalimat instruksi tidak menyebut "X/Twitter".
     *
     * Contoh:
     *   [Like] https://x.com/intent/like?tweet_id=...
     *
     * Link intent seperti ini adalah bukti langsung yang jauh lebih
     * kuat daripada sekadar kata "like" di halaman.
     */
    for (const link of normalizedLinks) {
      const intentType = this.detectXIntentAction(link.href);

      if (!intentType) {
        continue;
      }

      const visibleLabel = link.text || intentType;

      evidence.push({
        kind: "ACTION",
        description: `${this.humanizeXActionType(
          intentType,
        )} menggunakan link X yang ditemukan di halaman.`,
        sourceQuote: visibleLabel,
        actionType: intentType,
        targetUrl: link.href,
        targetKind: "X_INTENT",
        producesOwnTweetUrl: false,
        requiresOwnTweetUrl: false,
        walletInteraction: "NONE",
      });
    }

    /*
     * Dedupe berdasarkan action + target + sourceQuote.
     */
    const unique = new Map<string, TaskEvidence>();

    for (const item of evidence) {
      const key = [
        item.actionType ?? "",
        item.targetUrl ?? "",
        item.sourceQuote.toLowerCase(),
      ].join("|");

      if (!unique.has(key)) {
        unique.set(key, item);
      }
    }

    /*
     * Jangan hasilkan duplicate action yang sama hanya karena satu
     * halaman memiliki beberapa kalimat yang semuanya mengandung
     * kata "like".
     *
     * Jika sudah ada evidence dengan target status yang sama,
     * prioritaskan evidence tersebut.
     */
    const dedupedByActionAndTarget = new Map<string, TaskEvidence>();

    for (const item of unique.values()) {
      const key = `${item.actionType}|${item.targetUrl ?? ""}`;

      const existing = dedupedByActionAndTarget.get(key);

      if (!existing) {
        dedupedByActionAndTarget.set(key, item);
        continue;
      }

      const existingHasStatus = existing.targetKind === "X_STATUS";

      const currentHasStatus = item.targetKind === "X_STATUS";

      if (!existingHasStatus && currentHasStatus) {
        dedupedByActionAndTarget.set(key, item);
      }
    }

    return Array.from(dedupedByActionAndTarget.values());
  }

  private mergeEvidence(
    llmEvidence: TaskEvidence[],
    deterministicEvidence: TaskEvidence[],
  ): TaskEvidence[] {
    const merged: TaskEvidence[] = [];

    for (const evidence of llmEvidence ?? []) {
      if (!evidence || typeof evidence !== "object") {
        continue;
      }

      merged.push(evidence);
    }

    for (const evidence of deterministicEvidence) {
      const isDuplicate = merged.some((existing) => {
        const existingType = String(existing.actionType ?? "")
          .trim()
          .toUpperCase();

        const currentType = String(evidence.actionType ?? "")
          .trim()
          .toUpperCase();

        if (
          existing.kind === "ACTION" &&
          evidence.kind === "ACTION" &&
          existingType &&
          currentType &&
          existingType === currentType
        ) {
          const existingTarget = String(existing.targetUrl ?? "").trim();

          const currentTarget = String(evidence.targetUrl ?? "").trim();

          /*
           * Kalau keduanya menunjuk target yang sama,
           * anggap duplicate.
           */
          if (
            existingTarget &&
            currentTarget &&
            existingTarget === currentTarget
          ) {
            return true;
          }

          /*
           * Kalau LLM tidak memberikan target tetapi
           * deterministic evidence menemukan target verified,
           * kita JANGAN buang deterministic evidence.
           */
          if (!existingTarget && currentTarget) {
            return false;
          }
        }

        return false;
      });

      if (!isDuplicate) {
        merged.push(evidence);
      }
    }

    return merged;
  }

  private buildDeterministicActionDescription(
    type:
      | "X_FOLLOW"
      | "X_LIKE"
      | "X_REPOST"
      | "X_COMMENT"
      | "X_REPLY"
      | "X_QUOTE",
    sourceQuote: string,
  ): string {
    const action = this.humanizeXActionType(type);

    return `${action} sesuai instruksi halaman: "${sourceQuote}"`;
  }

  private humanizeXActionType(type: string): string {
    switch (type) {
      case "X_FOLLOW":
        return "Follow akun X";

      case "X_LIKE":
        return "Like postingan X";

      case "X_REPOST":
        return "Repost postingan X";

      case "X_COMMENT":
        return "Comment pada postingan X";

      case "X_REPLY":
        return "Reply pada postingan X";

      case "X_QUOTE":
        return "Quote postingan X";

      default:
        return type;
    }
  }

  private detectXTargetKind(
    targetUrl: string,
  ): "X_PROFILE" | "X_STATUS" | "X_INTENT" | "UNKNOWN" {
    if (this.isValidXStatusHref(targetUrl)) {
      return "X_STATUS";
    }

    if (this.isValidXIntentHref(targetUrl)) {
      return "X_INTENT";
    }

    if (this.isValidXProfileHref(targetUrl)) {
      return "X_PROFILE";
    }

    return "UNKNOWN";
  }

  private findMatchingIntentUrl(
    type:
      | "X_FOLLOW"
      | "X_LIKE"
      | "X_REPOST"
      | "X_COMMENT"
      | "X_REPLY"
      | "X_QUOTE",
    intentUrls: string[],
  ): string | null {
    for (const url of intentUrls) {
      const intentType = this.detectXIntentAction(url);

      if (intentType === type) {
        return url;
      }
    }

    return null;
  }

  private detectXIntentAction(
    href: string,
  ): "X_FOLLOW" | "X_LIKE" | "X_REPOST" | "X_REPLY" | null {
    let parsed: URL;

    try {
      parsed = new URL(href);
    } catch {
      return null;
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

    if (
      hostname !== "x.com" &&
      hostname !== "twitter.com" &&
      hostname !== "mobile.twitter.com"
    ) {
      return null;
    }

    if (
      parsed.pathname === "/intent/follow" &&
      parsed.searchParams.has("screen_name")
    ) {
      return "X_FOLLOW";
    }

    if (
      parsed.pathname === "/intent/like" &&
      parsed.searchParams.has("tweet_id")
    ) {
      return "X_LIKE";
    }

    if (
      parsed.pathname === "/intent/retweet" &&
      parsed.searchParams.has("tweet_id")
    ) {
      return "X_REPOST";
    }

    if (
      parsed.pathname === "/intent/tweet" &&
      parsed.searchParams.has("in_reply_to")
    ) {
      return "X_REPLY";
    }

    return null;
  }

  private isValidXProfileHref(href: string): boolean {
    let parsed: URL;

    try {
      parsed = new URL(href);
    } catch {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

    if (
      hostname !== "x.com" &&
      hostname !== "twitter.com" &&
      hostname !== "mobile.twitter.com"
    ) {
      return false;
    }

    return this.isXProfileUrl(parsed);
  }

  private isValidXStatusHref(href: string): boolean {
    let parsed: URL;

    try {
      parsed = new URL(href);
    } catch {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

    if (
      hostname !== "x.com" &&
      hostname !== "twitter.com" &&
      hostname !== "mobile.twitter.com"
    ) {
      return false;
    }

    return this.isXStatusUrl(parsed);
  }

  private isValidXIntentHref(href: string): boolean {
    let parsed: URL;

    try {
      parsed = new URL(href);
    } catch {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

    if (
      hostname !== "x.com" &&
      hostname !== "twitter.com" &&
      hostname !== "mobile.twitter.com"
    ) {
      return false;
    }

    return parsed.pathname.startsWith("/intent/");
  }

  private normalizeActionEvidence(
    evidence: TaskEvidence,
    sourceUrl: string,
  ): TaskRequirement[] {
    const description = evidence.description.trim();

    const detectedActions = this.detectXActions(
      description,
      evidence.actionType,
    );

    if (detectedActions.length > 0) {
      return detectedActions.map((type) =>
        this.buildXRequirement(type, evidence, sourceUrl),
      );
    }

    const rawType = String(evidence.actionType ?? "CUSTOM")
      .trim()
      .toUpperCase();

    const type = SUPPORTED_TASK_TYPES.has(rawType) ? rawType : "CUSTOM";

    const targetUrl = this.normalizeGenericTargetUrl(
      evidence.targetUrl,
      sourceUrl,
    );

    return [
      {
        type: type as TaskRequirement["type"],
        description,
        targetUrl,

        producesOwnTweetUrl:
          type === "X_POST" && evidence.producesOwnTweetUrl === true,

        requiresOwnTweetUrl:
          type !== "X_COMMENT" &&
          type !== "X_REPLY" &&
          type !== "X_QUOTE" &&
          evidence.requiresOwnTweetUrl === true,

        form: undefined,
      },
    ];
  }

  private buildXRequirement(
    type: string,
    evidence: TaskEvidence,
    sourceUrl: string,
  ): TaskRequirement {
    const normalizedType = type as TaskRequirement["type"];

    const targetUrl = this.normalizeXTargetUrl(
      normalizedType,
      evidence.targetUrl,
    );

    const isCommentLike =
      normalizedType === "X_COMMENT" ||
      normalizedType === "X_REPLY" ||
      normalizedType === "X_QUOTE";

    return {
      type: normalizedType,

      description: evidence.description.trim(),

      targetUrl,

      producesOwnTweetUrl:
        normalizedType === "X_POST" && evidence.producesOwnTweetUrl === true,

      requiresOwnTweetUrl:
        !isCommentLike && evidence.requiresOwnTweetUrl === true,

      form: undefined,
    };
  }

  private normalizeFormEvidence(
    evidence: TaskEvidence,
    sourceUrl: string,
  ): TaskRequirement | null {
    const form = evidence.form;

    if (!form) {
      return {
        type: "FORM_SUBMIT",

        description: evidence.description.trim(),

        targetUrl: evidence.targetUrl?.trim() || sourceUrl,

        producesOwnTweetUrl: false,

        requiresOwnTweetUrl: false,

        form: undefined,
      };
    }

    const fields = (form.fields ?? []).map((field) => {
      const rawType = String(field.type ?? "")
        .trim()
        .toUpperCase();

      const type = SUPPORTED_FORM_FIELD_TYPES.has(rawType) ? rawType : "CUSTOM";

      return {
        type: type as any,

        label: field.label?.trim(),

        required: field.required ?? true,

        value: typeof field.value === "string" ? field.value.trim() : null,
      };
    });

    const checkboxes = (form.checkboxes ?? []).map((checkbox) => {
      const rawType = String(checkbox.type ?? "")
        .trim()
        .toUpperCase();

      const type = SUPPORTED_CHECKBOX_TYPES.has(rawType) ? rawType : "CUSTOM";

      return {
        type: type as any,

        label: checkbox.label?.trim(),

        required: checkbox.required ?? false,

        checked: checkbox.checked ?? true,
      };
    });

    const walletInteraction = evidence.walletInteraction ?? "UNKNOWN";

    const hasWalletAddressField = fields.some(
      (field) => field.type === "WALLET_ADDRESS",
    );

    /*
     * WALLET_ADDRESS != wallet connection.
     */
    const requiresWalletInteraction =
      walletInteraction === "CONNECT" ||
      walletInteraction === "SIGN" ||
      walletInteraction === "APPROVE";

    let taskType: "FORM" | "FORM_TWITTER" | "FORM_WALLET" | "FORM_SUBMIT" =
      "FORM";

    if (requiresWalletInteraction) {
      taskType = "FORM_WALLET";
    } else if (hasWalletAddressField && !requiresWalletInteraction) {
      taskType = "FORM_SUBMIT";
    } else {
      taskType = "FORM_SUBMIT";
    }

    const formType =
      form.formType === "GOOGLE_FORM" ? "GOOGLE_FORM" : "WEBSITE";

    const targetUrl =
      form.targetUrl?.trim() || evidence.targetUrl?.trim() || sourceUrl;

    return {
      type: taskType,

      description: evidence.description.trim(),

      targetUrl,

      producesOwnTweetUrl: false,

      requiresOwnTweetUrl: fields.some(
        (field) => field.type === "OWN_TWEET_URL",
      ),

      form: {
        formType,

        targetUrl,

        fields,

        checkboxes,

        submit: undefined,
      },
    };
  }

  private detectXActions(description: string, hintedType?: string): string[] {
    const lower = description.toLowerCase();

    const candidates: Array<{
      type: string;
      index: number;
      priority: number;
    }> = [];

    const patterns: Array<{
      type: string;
      regex: RegExp;
      priority: number;
    }> = [
      {
        type: "X_FOLLOW",
        regex: /\bfollow\b/,
        priority: 1,
      },

      {
        type: "X_LIKE",
        regex: /\blike\b/,
        priority: 2,
      },

      {
        type: "X_REPOST",
        regex: /\b(retweet|repost|rt)\b/,
        priority: 3,
      },

      {
        type: "X_COMMENT",
        regex: /\bcomment\b/,
        priority: 4,
      },

      {
        type: "X_REPLY",
        regex: /\breply\b/,
        priority: 5,
      },

      {
        type: "X_QUOTE",
        regex: /\bquote\b/,
        priority: 6,
      },
    ];

    for (const pattern of patterns) {
      const match = lower.match(pattern.regex);

      if (match?.index !== undefined) {
        candidates.push({
          type: pattern.type,

          index: match.index,

          priority: pattern.priority,
        });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        if (a.index !== b.index) {
          return a.index - b.index;
        }

        return a.priority - b.priority;
      });

      const hinted = String(hintedType ?? "")
        .trim()
        .toUpperCase();

      const hintedIsX = X_TASK_TYPES.has(hinted);

      if (hintedIsX || this.looksLikeSocialRequirement(lower)) {
        return candidates.map((candidate) => candidate.type);
      }
    }

    if (hintedType && X_TASK_TYPES.has(hintedType.trim().toUpperCase())) {
      return [hintedType.trim().toUpperCase()];
    }

    return [];
  }

  private looksLikeSocialRequirement(text: string): boolean {
    return /\b(on x|on twitter|x\.com|twitter\.com|tweet|post|pinned post|pinned tweet)\b/i.test(
      text,
    );
  }

  private normalizeXTargetUrl(
    type: TaskRequirement["type"],
    targetUrl?: string | null,
  ): string | null {
    const raw = String(targetUrl ?? "").trim();

    if (!raw) {
      return null;
    }

    let parsed: URL;

    try {
      parsed = new URL(raw);
    } catch {
      return null;
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

    const isXHost =
      hostname === "x.com" ||
      hostname === "twitter.com" ||
      hostname === "mobile.twitter.com";

    if (!isXHost) {
      return null;
    }

    /*
     * X_FOLLOW
     *
     * Bisa berupa:
     * https://x.com/arcroulette
     * https://x.com/intent/follow?screen_name=arcroulette
     */
    if (type === "X_FOLLOW") {
      if (this.isXProfileUrl(parsed)) {
        return parsed.toString();
      }

      if (
        parsed.pathname === "/intent/follow" &&
        parsed.searchParams.has("screen_name")
      ) {
        return parsed.toString();
      }

      return null;
    }

    /*
     * Post-level X actions.
     *
     * Prioritas:
     * 1. Exact /status/ URL
     * 2. Verified X intent URL
     */
    if (
      type === "X_LIKE" ||
      type === "X_REPOST" ||
      type === "X_COMMENT" ||
      type === "X_REPLY" ||
      type === "X_QUOTE"
    ) {
      if (this.isXStatusUrl(parsed)) {
        return parsed.toString();
      }

      /*
       * Like
       */
      if (
        parsed.pathname === "/intent/like" &&
        parsed.searchParams.has("tweet_id")
      ) {
        return parsed.toString();
      }

      /*
       * Repost
       */
      if (
        parsed.pathname === "/intent/retweet" &&
        parsed.searchParams.has("tweet_id")
      ) {
        return parsed.toString();
      }

      /*
       * Reply
       */
      if (
        parsed.pathname === "/intent/tweet" &&
        parsed.searchParams.has("in_reply_to")
      ) {
        return parsed.toString();
      }

      return null;
    }

    /*
     * X_POST
     */
    if (type === "X_POST") {
      return parsed.toString();
    }

    return null;
  }

  private isXStatusUrl(url: URL): boolean {
    return /\/status\/\d+/i.test(url.pathname);
  }

  private isXProfileUrl(url: URL): boolean {
    const pathname = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");

    if (!pathname) {
      return false;
    }

    if (pathname.includes("/status/")) {
      return false;
    }

    if (pathname.startsWith("intent/")) {
      return false;
    }

    return pathname.split("/").length === 1;
  }

  private normalizeGenericTargetUrl(
    targetUrl: string | null | undefined,
    sourceUrl: string,
  ): string | null {
    const raw = String(targetUrl ?? "").trim();

    if (!raw) {
      return sourceUrl;
    }

    try {
      const parsed = new URL(raw);

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return sourceUrl;
      }

      return parsed.toString();
    } catch {
      return sourceUrl;
    }
  }
}
