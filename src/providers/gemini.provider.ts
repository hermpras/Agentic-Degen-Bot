import { GoogleGenAI, Type, FunctionCallingConfigMode } from "@google/genai";

import {
  LLMProvider,
  LLMGenerateOptions,
  LLMGenerateResult,
} from "./llm.interface.js";

import { Tool, ToolParameterProperty } from "../tools/tool.interface.js";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  private ai: GoogleGenAI;

  private primaryModel: string;

  private fallbackModels: string[];

  constructor(apiKey: string, modelName = "gemini-3.5-flash") {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY tidak ditemukan di .env");
    }

    this.ai = new GoogleGenAI({ apiKey });

    this.primaryModel = modelName;

    this.fallbackModels = [
      "gemini-3.5-flash-lite",
      "gemini-3.7-flash",
      "gemini-3.8-flash",
    ];
  }

  private mapType(type: string): Type {
    switch (type) {
      case "string":
        return Type.STRING;

      case "number":
        return Type.NUMBER;

      case "boolean":
        return Type.BOOLEAN;

      case "array":
        return Type.ARRAY;

      case "object":
      default:
        return Type.OBJECT;
    }
  }

  /**
   * Mengubah schema ToolParameterProperty internal
   * menjadi schema yang bisa diterima Gemini.
   *
   * Mapper ini recursive supaya nested:
   *
   * array
   *   -> items
   *       -> object
   *           -> properties
   *               -> array
   *                   -> items
   *
   * semuanya tetap dipertahankan.
   */
  private mapProperty(property: ToolParameterProperty): Record<string, any> {
    const mapped: Record<string, any> = {
      type: this.mapType(property.type),
    };

    if (property.description) {
      mapped.description = property.description;
    }

    if (property.enum) {
      mapped.enum = property.enum;
    }

    if (property.items) {
      mapped.items = this.mapProperty(property.items);
    }

    if (property.properties) {
      const nestedProperties: Record<string, any> = {};

      for (const [key, nestedProperty] of Object.entries(property.properties)) {
        nestedProperties[key] = this.mapProperty(nestedProperty);
      }

      mapped.properties = nestedProperties;
    }

    if (property.required) {
      mapped.required = property.required;
    }

    return mapped;
  }

  private mapToolsToGemini(tools?: Tool[]): any {
    if (!tools || tools.length === 0) {
      return undefined;
    }

    return [
      {
        functionDeclarations: tools.map((tool) => {
          const properties: Record<string, any> = {};

          if (tool.parameters?.properties) {
            for (const [key, property] of Object.entries(
              tool.parameters.properties,
            )) {
              properties[key] = this.mapProperty(property);
            }
          }

          return {
            name: tool.name,
            description: tool.description,
            parameters: {
              type: Type.OBJECT,
              properties,
              required: tool.parameters?.required,
            },
          };
        }),
      },
    ];
  }

  async generate(options: LLMGenerateOptions): Promise<LLMGenerateResult> {
    const geminiTools = this.mapToolsToGemini(options.tools);

    const contents = options.messages.map((msg) => {
      if (msg.rawParts) {
        return {
          role: msg.role === "model" ? "model" : "user",
          parts: msg.rawParts,
        };
      }

      return {
        role: msg.role === "model" ? "model" : "user",
        parts: [
          {
            text: msg.content || "",
          },
        ],
      };
    });

    const modelsToTry = [this.primaryModel, ...this.fallbackModels];

    let lastError: any;

    for (const model of modelsToTry) {
      const maxRetries = 2;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          /**
           * Gemini function calling configuration.
           *
           * AUTO:
           *   default behavior, LLM boleh memilih tool atau final answer.
           *
           * ANY:
           *   LLM wajib menghasilkan function call.
           *
           * NONE:
           *   LLM tidak menggunakan function call.
           */
          const functionCallingConfig: {
            mode: FunctionCallingConfigMode;
          } =
            options.toolChoice === "ANY"
              ? {
                  mode: FunctionCallingConfigMode.ANY,
                }
              : options.toolChoice === "NONE"
                ? {
                    mode: FunctionCallingConfigMode.NONE,
                  }
                : {
                    mode: FunctionCallingConfigMode.AUTO,
                  };

          const response = await this.ai.models.generateContent({
            model,
            contents,
            config: {
              tools: geminiTools,
              systemInstruction: options.systemInstruction,
              toolConfig: geminiTools
                ? {
                    functionCallingConfig,
                  }
                : undefined,
            },
          });

          const candidate = response.candidates?.[0];

          const functionCalls = response.functionCalls;

          if (functionCalls && functionCalls.length > 0) {
            return {
              toolCalls: functionCalls.map((functionCall) => ({
                id: functionCall.id,
                name: functionCall.name || "",
                args: (functionCall.args as Record<string, any>) || {},
              })),

              rawResponse: candidate?.content,
            };
          }

          return {
            text: response.text ?? "",

            rawResponse: candidate?.content,
          };
        } catch (error: any) {
          lastError = error;

          const errorMessage = error?.message || String(error);

          const isQuotaOrTransient =
            errorMessage.includes("429") ||
            errorMessage.includes("RESOURCE_EXHAUSTED") ||
            errorMessage.includes("503") ||
            errorMessage.includes("UNAVAILABLE");

          if (isQuotaOrTransient) {
            console.warn(
              `⚠️ [GeminiProvider] Model "${model}" mengalami kendala quota/server (429/503). Mencoba model alternatif...`,
            );

            break;
          }

          throw error;
        }
      }
    }

    throw lastError;
  }
}
