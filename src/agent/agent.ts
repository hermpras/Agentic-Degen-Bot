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

  /**
   * Memproses pesan pengguna melalui Reasoning Loop
   * dengan memuat & menyimpan riwayat percakapan.
   */
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
      messages = [{ role: "user", content: userMessage }];
    }

    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      console.log(
        `🤖 [Agent Loop] Iterasi ke-${iteration} (chat_id: ${
          chatId || "local"
        })...`,
      );

      try {
        const result = await this.provider.generate({
          messages,
          tools,
          systemInstruction: this.systemInstruction,
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

            const toolResult = await this.toolRegistry.executeTool(
              call.name,
              call.args,
              chatId,
            );

            console.log(
              `📦 [Agent] Hasil eksekusi "${call.name}":`,
              toolResult,
            );

            messages.push({
              role: "user",
              rawParts: [
                {
                  functionResponse: {
                    name: call.name,
                    response: { result: toolResult },
                  },
                },
              ],
            });
          }

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
}
