import { LLMProvider } from "../providers/llm.interface.js";
import { AgentProfile } from "../agents/agent-profiles.js";

/**
 * Orchestrator: pilih agent mana yang paling cocok buat menangani sebuah pesan,
 * lalu serahkan eksekusinya ke Agent tersebut.
 */
export class Orchestrator {
  constructor(
    private provider: LLMProvider,
    private profiles: AgentProfile[],
  ) {}

  async route(userMessage: string, chatId: string | number): Promise<string> {
    const chosenName = await this.classify(userMessage);
    const profile =
      this.profiles.find((p) => p.name === chosenName) ?? this.profiles[0];

    console.log(`🧭 [Orchestrator] Routing pesan ke agent: "${profile.name}"`);

    return profile.agent.processMessage(userMessage, chatId);
  }

  private async classify(userMessage: string): Promise<string> {
    const optionsText = this.profiles
      .map((p) => `- ${p.name}: ${p.description}`)
      .join("\n");
    const validNames = this.profiles.map((p) => p.name).join(", ");

    const result = await this.provider.generate({
      messages: [{ role: "user", content: userMessage }],
      systemInstruction: `Kamu adalah router internal. Pilih SATU nama agent yang paling cocok buat menangani pesan user, dari daftar berikut:\n${optionsText}\n\nJawab HANYA dengan nama agent-nya persis (salah satu dari: ${validNames}), tanpa tanda baca atau teks lain.`,
    });

    const answer = (result.text || "").trim().toLowerCase();
    const match = this.profiles.find((p) =>
      answer.includes(p.name.toLowerCase()),
    );
    return match?.name ?? this.profiles[0].name;
  }
}
