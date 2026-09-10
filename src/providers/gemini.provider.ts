import { GoogleGenAI, Type } from '@google/genai';
import {
  LLMProvider,
  LLMGenerateOptions,
  LLMGenerateResult,
} from './llm.interface.js';
import { Tool } from '../tools/tool.interface.js';

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  private ai: GoogleGenAI;
  private primaryModel: string;
  private fallbackModels: string[];

  constructor(apiKey: string, modelName = 'gemini-3.5-flash') {
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY tidak ditemukan di .env');
    }
    this.ai = new GoogleGenAI({ apiKey });
    this.primaryModel = modelName;
    this.fallbackModels = ['gemini-3.5-flash-lite', 'gemini-3.7-flash', 'gemini-3.8-flash'];
  }

  private mapType(type: string): Type {
    switch (type) {
      case 'string':
        return Type.STRING;
      case 'number':
        return Type.NUMBER;
      case 'boolean':
        return Type.BOOLEAN;
      case 'array':
        return Type.ARRAY;
      case 'object':
      default:
        return Type.OBJECT;
    }
  }

  private mapToolsToGemini(tools?: Tool[]): any {
    if (!tools || tools.length === 0) return undefined;

    return [
      {
        functionDeclarations: tools.map((t) => {
          const properties: Record<string, any> = {};
          if (t.parameters?.properties) {
            for (const [key, prop] of Object.entries(t.parameters.properties)) {
              properties[key] = {
                type: this.mapType(prop.type),
                description: prop.description,
                enum: prop.enum,
              };
            }
          }

          return {
            name: t.name,
            description: t.description,
            parameters: {
              type: Type.OBJECT,
              properties,
              required: t.parameters?.required,
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
          role: msg.role === 'model' ? 'model' : 'user',
          parts: msg.rawParts,
        };
      }
      return {
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.content || '' }],
      };
    });

    const modelsToTry = [this.primaryModel, ...this.fallbackModels];
    let lastError: any;

    for (const model of modelsToTry) {
      const maxRetries = 2;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await this.ai.models.generateContent({
            model,
            contents,
            config: {
              tools: geminiTools,
              systemInstruction: options.systemInstruction,
            },
          });

          const candidate = response.candidates?.[0];
          const functionCalls = response.functionCalls;

          if (functionCalls && functionCalls.length > 0) {
            return {
              toolCalls: functionCalls.map((fc) => ({
                id: fc.id,
                name: fc.name || '',
                args: (fc.args as Record<string, any>) || {},
              })),
              rawResponse: candidate?.content,
            };
          }

          return {
            text: response.text ?? '',
            rawResponse: candidate?.content,
          };
        } catch (error: any) {
          lastError = error;
          const errorMessage = error?.message || String(error);
          const isQuotaOrTransient =
            errorMessage.includes('429') ||
            errorMessage.includes('RESOURCE_EXHAUSTED') ||
            errorMessage.includes('503') ||
            errorMessage.includes('UNAVAILABLE');

          if (isQuotaOrTransient) {
            console.warn(
              `⚠️ [GeminiProvider] Model "${model}" mengalami kendala quota/server (429/503). Mencoba model alternatif...`
            );
            // Pindah ke model berikutnya jika quota habis
            break;
          } else {
            throw error;
          }
        }
      }
    }

    throw lastError;
  }
}
