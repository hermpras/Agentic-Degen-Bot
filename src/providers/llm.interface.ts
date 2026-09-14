import { Tool } from "../tools/tool.interface.js";

export interface LLMMessage {
  role: "user" | "model" | "system";

  content?: string;

  rawParts?: any[];
}

export interface LLMToolCall {
  id?: string;

  name: string;

  args: Record<string, any>;
}

export type LLMToolChoice = "AUTO" | "ANY" | "NONE";

export interface LLMGenerateOptions {
  messages: LLMMessage[];

  tools?: Tool[];

  systemInstruction?: string;

  /**
   * Mengontrol apakah LLM boleh memilih tool secara bebas
   * atau wajib menghasilkan function call.
   *
   * AUTO:
   *   LLM bebas memilih tool atau final answer.
   *
   * ANY:
   *   LLM wajib menghasilkan function call.
   *
   * NONE:
   *   LLM tidak boleh menggunakan function call.
   */
  toolChoice?: LLMToolChoice;
}

export interface LLMGenerateResult {
  text?: string;

  toolCalls?: LLMToolCall[];

  rawResponse?: any;
}

export interface LLMProvider {
  /**
   * Nama provider LLM (misal: 'gemini', 'openai', 'ollama')
   */
  readonly name: string;

  /**
   * Mengirimkan percakapan beserta skema tools ke LLM
   * dan mengembalikan teks balasan atau permintaan tool calls.
   */
  generate(options: LLMGenerateOptions): Promise<LLMGenerateResult>;
}
