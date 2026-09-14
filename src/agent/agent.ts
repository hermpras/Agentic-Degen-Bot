import { LLMProvider, LLMMessage } from "../providers/llm.interface.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import { MemoryManager } from "../memory/memory-manager.js";

export interface AgentOptions {
  maxIterations?: number;
  memoryManager?: MemoryManager;
  systemInstruction?: string;
}

const DEFAULT_SYSTEM_INSTRUCTION =
  "Kamu adalah Degen Agent AI, asisten pintar berbasis Telegram. Kamu mengingat riwayat percakapan sebelumnya. Jika pengguna menanyakan waktu atau pertanyaan yang memerlukan alat, selalu gunakan alat yang tersedia sebelum menjawab.";

export class Agent {
  private provider: LLMProvider;
  private toolRegistry: ToolRegistry;
  private memoryManager?: MemoryManager;
  private maxIterations: number;
  private systemInstruction: string;

  constructor(
    provider: LLMProvider,
    toolRegistry: ToolRegistry,
    options?: AgentOptions,
  ) {
    this.provider = provider;
    this.toolRegistry = toolRegistry;
    this.memoryManager = options?.memoryManager;
    this.maxIterations = options?.maxIterations ?? 5;
    this.systemInstruction =
      options?.systemInstruction ?? DEFAULT_SYSTEM_INSTRUCTION;
  }

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  async processMessage(
    userMessage: string,
    chatId?: string | number,
  ): Promise<string> {
    const tools = this.toolRegistry.getAllTools();
    let messages: LLMMessage[] = [];

    if (this.memoryManager && chatId !== undefined) {
      this.memoryManager.saveMessage(chatId, "user", userMessage);
      messages = this.memoryManager.getRecentMessages(chatId, 20);
    } else {
      messages = [
        {
          role: "user",
          content: userMessage,
        },
      ];
    }

    const explicitlyRequestedPlanId = this.extractExplicitPlanId(userMessage);

    const executionIntent = this.hasExecutionIntent(userMessage);

    let freshCreatedPlanId: number | null = null;
    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      console.log(
        `🤖 [Agent Loop] Iterasi ke-${iteration} (chat_id: ${
          chatId || "local"
        })...`,
      );

      try {
        /**
         * Execution workflow guard.
         *
         * Kalau user meminta execution tanpa planId,
         * Agent wajib membuat fresh task plan terlebih dahulu.
         *
         * Jangan menggunakan planId lama dari conversation memory.
         */
        const executionWorkflowInstruction =
          executionIntent &&
          explicitlyRequestedPlanId === null &&
          freshCreatedPlanId === null
            ? [
                "",
                "ATURAN INTERNAL EXECUTION WORKFLOW:",
                "User meminta execution/kerjakan/jalankan task.",
                "User TIDAK memberikan planId secara eksplisit.",
                "JANGAN menggunakan planId dari conversation memory.",
                "JANGAN memanggil execute_project_task_plan.",
                "JANGAN memberikan jawaban final sebelum membuat task plan baru.",
                "Gunakan create_project_task_plan berdasarkan requirements project yang relevan dari conversation.",
                "Setelah create_project_task_plan berhasil, Agent akan meneruskan execution menggunakan planId baru tersebut.",
              ].join("\n")
            : "";

        /**
         * Pada turn pertama, request tertentu memang membutuhkan
         * tool call.
         *
         * Contoh:
         * "buatkan task plan Consensus"
         * "buat account baru"
         * "list account"
         * "buat project"
         *
         * Untuk request seperti ini kita tidak boleh membiarkan
         * model fallback menjawab seolah-olah tool sudah dijalankan.
         */
        const requiresToolCall =
          iteration === 1 && this.requiresToolForRequest(userMessage, tools);

        const result = await this.provider.generate({
          messages,
          tools,
          systemInstruction:
            this.systemInstruction + executionWorkflowInstruction,
          toolChoice: requiresToolCall ? "ANY" : "AUTO",
        });

        if (result.toolCalls && result.toolCalls.length > 0) {
          if (result.rawResponse) {
            messages.push({
              role: "model",
              rawParts: result.rawResponse.parts,
            });
          }

          for (const call of result.toolCalls) {
            console.log(
              `💡 [Agent] LLM memilih tool: "${call.name}" dengan argumen:`,
              call.args,
            );

            /**
             * Guard #1:
             *
             * execute_project_task_plan hanya boleh memakai:
             * - planId yang diberikan eksplisit oleh user terbaru, atau
             * - fresh planId yang baru dibuat pada turn ini.
             */
            if (
              call.name === "execute_project_task_plan" &&
              !this.isExecutionAllowed(
                call.args,
                explicitlyRequestedPlanId,
                freshCreatedPlanId,
              )
            ) {
              const blockedResult = JSON.stringify({
                success: false,
                blocked: true,
                reason:
                  "Execution ditahan oleh Agent Guard karena planId tidak berasal dari instruksi user terbaru dan belum merupakan plan baru yang dibuat pada turn ini.",
                actionRequired:
                  "Jangan panggil execute_project_task_plan lagi. Buat task plan baru terlebih dahulu menggunakan create_project_task_plan berdasarkan requirements project yang relevan.",
                explicitlyRequestedPlanId,
                freshCreatedPlanId,
              });

              console.log(
                "🛡️ [Agent Guard] execute_project_task_plan ditahan karena planId tidak valid untuk execution turn ini.",
              );

              console.log(
                `📦 [Agent] Hasil guard "execute_project_task_plan":`,
                blockedResult,
              );

              messages.push({
                role: "user",
                rawParts: [
                  {
                    functionResponse: {
                      name: call.name,
                      response: {
                        result: blockedResult,
                      },
                    },
                  },
                ],
              });

              continue;
            }

            /**
             * Guard #2:
             *
             * Untuk execution intent tanpa explicit planId,
             * execution tidak boleh dilakukan sebelum ada fresh plan.
             */
            if (
              call.name === "execute_project_task_plan" &&
              executionIntent &&
              explicitlyRequestedPlanId === null &&
              freshCreatedPlanId === null
            ) {
              const blockedResult = JSON.stringify({
                success: false,
                blocked: true,
                reason:
                  "Execution belum boleh dilakukan karena belum ada fresh task plan pada turn ini.",
                actionRequired:
                  "Buat task plan baru menggunakan create_project_task_plan terlebih dahulu. Jangan gunakan plan lama dari conversation memory.",
              });

              console.log(
                "🛡️ [Agent Guard] Execution ditahan karena fresh plan belum dibuat.",
              );

              messages.push({
                role: "user",
                rawParts: [
                  {
                    functionResponse: {
                      name: call.name,
                      response: {
                        result: blockedResult,
                      },
                    },
                  },
                ],
              });

              continue;
            }

            const toolResult = await this.toolRegistry.executeTool(
              call.name,
              call.args,
              chatId,
            );

            console.log(
              `📦 [Agent] Hasil eksekusi "${call.name}":`,
              toolResult,
            );

            /**
             * Capture fresh planId dari
             * create_project_task_plan.
             *
             * IMPORTANT:
             * Tool create_project_task_plan tidak wajib
             * mengembalikan field "status".
             *
             * Selama:
             * - success === true
             * - planId valid
             *
             * maka plan tersebut dianggap fresh plan
             * yang baru dibuat pada turn ini.
             */
            if (call.name === "create_project_task_plan") {
              const createdPlanId = this.extractCreatedPlanId(toolResult);

              if (createdPlanId !== null) {
                freshCreatedPlanId = createdPlanId;

                console.log(
                  `🆕 [Agent] Fresh task plan terdeteksi: #${freshCreatedPlanId}.`,
                );
              } else {
                console.log(
                  "⚠️ [Agent] create_project_task_plan berhasil dipanggil tetapi planId tidak berhasil dideteksi dari hasil tool.",
                );
              }
            }

            /**
             * Simpan hasil tool ke conversation state.
             */
            messages.push({
              role: "user",
              rawParts: [
                {
                  functionResponse: {
                    name: call.name,
                    response: {
                      result: toolResult,
                    },
                  },
                },
              ],
            });

            /**
             * ============================================================
             * DETERMINISTIC EXECUTION CONTINUATION
             * ============================================================
             *
             * User:
             *   "langsung kerjakan Arc Ape"
             *
             * LLM:
             *   create_project_task_plan
             *
             * Tool:
             *   { success: true, planId: 1 }
             *
             * Execution intent:
             *   -> otomatis execute plan baru.
             *
             * Approval boundary tetap aktif karena execution
             * dilakukan melalui ToolRegistry.executeTool().
             */
            if (
              call.name === "create_project_task_plan" &&
              executionIntent &&
              explicitlyRequestedPlanId === null &&
              freshCreatedPlanId !== null
            ) {
              console.log(
                `🚀 [Agent] Execution intent terdeteksi setelah fresh plan #${freshCreatedPlanId}.`,
              );

              console.log(
                `➡️ [Agent] Auto-continuation → execute_project_task_plan(${freshCreatedPlanId})`,
              );

              const executionArgs = {
                planId: freshCreatedPlanId,
              };

              const executionToolResult = await this.toolRegistry.executeTool(
                "execute_project_task_plan",
                executionArgs,
                chatId,
              );

              console.log(
                `📦 [Agent] Hasil auto-execution "execute_project_task_plan":`,
                executionToolResult,
              );

              messages.push({
                role: "user",
                rawParts: [
                  {
                    functionResponse: {
                      name: "execute_project_task_plan",
                      response: {
                        result: executionToolResult,
                      },
                    },
                  },
                ],
              });

              continue;
            }
          }

          continue;
        }

        /**
         * Guard #3:
         *
         * Execution intent tanpa explicit planId belum boleh
         * menghasilkan final answer sebelum fresh task plan dibuat.
         */
        if (
          result.text &&
          executionIntent &&
          explicitlyRequestedPlanId === null &&
          freshCreatedPlanId === null
        ) {
          console.log(
            "🛡️ [Agent Guard] Final answer ditahan karena execution intent belum menghasilkan fresh task plan.",
          );

          const forcedPlanningInstruction = [
            "Execution workflow belum selesai.",
            "Jangan memberikan jawaban final kepada user.",
            "User meminta task dijalankan tetapi belum memberikan planId.",
            "Jangan gunakan planId lama dari conversation memory.",
            "Sekarang buat task plan baru dengan create_project_task_plan berdasarkan requirements project yang relevan.",
            "Setelah tool tersebut berhasil, Agent akan otomatis meneruskan execution.",
          ].join("\n");

          messages.push({
            role: "user",
            content: forcedPlanningInstruction,
          });

          continue;
        }

        if (result.text) {
          console.log(`✅ [Agent] Jawaban final diterima dari LLM.`);

          if (this.memoryManager && chatId !== undefined) {
            this.memoryManager.saveMessage(chatId, "assistant", result.text);
          }

          return result.text;
        }
      } catch (error: any) {
        console.error(
          `❌ [Agent Error] Terjadi kesalahan pada iterasi ke-${iteration}:`,
          error,
        );

        return `⚠️ Maaf, terjadi kesalahan pada Agent: ${
          error.message || String(error)
        }`;
      }

      break;
    }

    return "⚠️ Agent mencapai batas maksimum iterasi tanpa menghasilkan jawaban.";
  }

  /**
   * Menentukan apakah request user secara eksplisit meminta
   * sebuah operasi yang harus dilakukan oleh tool.
   *
   * Kita sengaja TIDAK menggunakan ANY untuk semua pesan.
   *
   * Contoh yang wajib tool:
   * - buatkan task plan
   * - buat account
   * - list account
   * - buat project
   * - update project
   * - watchlist
   *
   * Pertanyaan biasa tetap menggunakan AUTO.
   */
  private requiresToolForRequest(message: string, tools: any[]): boolean {
    if (!tools || tools.length === 0) {
      return false;
    }

    const text = message.toLowerCase().trim();

    const operationPatterns = [
      /\bbuatkan\b/,
      /\bbuat\b/,
      /\bbikin\b/,
      /\bcreate\b/,
      /\btambahkan\b/,
      /\btambah\b/,
      /\badd\b/,
      /\blist\b/,
      /\bdaftar\b/,
      /\blihat\b/,
      /\bcek\b/,
      /\bcheck\b/,
      /\bupdate\b/,
      /\bubah\b/,
      /\bedit\b/,
      /\brename\b/,
      /\bganti nama\b/,
      /\bhapus\b/,
      /\bdelete\b/,
      /\bwatchlist\b/,
      /\btask\s*plan\b/,
      /\btask\b.*\bplan\b/,
      /\bproject\b.*\bplan\b/,
    ];

    const looksLikeOperation = operationPatterns.some((pattern) =>
      pattern.test(text),
    );

    if (!looksLikeOperation) {
      return false;
    }

    /**
     * Pastikan memang ada tool yang relevan.
     *
     * Untuk request task plan, create_project_task_plan
     * harus tersedia.
     */
    if (
      /\btask\s*plan\b/.test(text) ||
      /\btask\b.*\bplan\b/.test(text) ||
      /\bproject\b.*\bplan\b/.test(text)
    ) {
      return tools.some((tool) => tool.name === "create_project_task_plan");
    }

    return true;
  }

  private hasExecutionIntent(message: string): boolean {
    const text = message.toLowerCase();

    const executionPatterns = [
      /\bkerjakan\b/,
      /\bjalan(?:kan)?\b/,
      /\bjalankan\b/,
      /\beksekusi\b/,
      /\bexecute\b/,
      /\blangsung\s+kerja/,
      /\blangsung\s+jalan/,
      /\blanjutkan\s+eksekusi/,
      /\bdo\s+it\b/,
      /\bstart\s+execution\b/,
    ];

    return executionPatterns.some((pattern) => pattern.test(text));
  }

  private isExecutionAllowed(
    args: Record<string, any>,
    explicitlyRequestedPlanId: number | null,
    freshCreatedPlanId: number | null,
  ): boolean {
    const planId = this.normalizePlanId(args?.planId);

    if (planId === null) {
      return false;
    }

    if (
      explicitlyRequestedPlanId !== null &&
      planId === explicitlyRequestedPlanId
    ) {
      return true;
    }

    if (freshCreatedPlanId !== null && planId === freshCreatedPlanId) {
      return true;
    }

    return false;
  }

  private extractExplicitPlanId(message: string): number | null {
    const text = message.trim();

    const patterns = [
      /\bplanId\s*[:#]?\s*(\d+)\b/i,
      /\bplan\s*#?\s*(\d+)\b/i,
      /\btask\s*plan\s*#?\s*(\d+)\b/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);

      if (match) {
        const planId = Number(match[1]);

        if (Number.isInteger(planId) && planId > 0) {
          return planId;
        }
      }
    }

    return null;
  }

  private extractCreatedPlanId(toolResult: string): number | null {
    try {
      const parsed = JSON.parse(toolResult) as {
        success?: boolean;
        planId?: number;
      };

      /**
       * create_project_task_plan saat ini mengembalikan:
       *
       * {
       *   success: true,
       *   planId: 24,
       *   ...
       * }
       *
       * Tidak ada requirement bahwa response harus
       * mempunyai field "status".
       */
      if (
        parsed.success === true &&
        typeof parsed.planId === "number" &&
        Number.isInteger(parsed.planId) &&
        parsed.planId > 0
      ) {
        return parsed.planId;
      }
    } catch {
      // Ignore non-JSON tool results.
    }

    return null;
  }

  private normalizePlanId(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      return null;
    }

    return value;
  }
}
