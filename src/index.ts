import { Bot } from "grammy";
import { config } from "./config/index.js";
import { GeminiProvider } from "./providers/gemini.provider.js";
import { MemoryManager } from "./memory/memory-manager.js";
import { buildAgentProfiles } from "./agents/agent-profiles.js";
import { Orchestrator } from "./orchestrator/orchestrator.js";
import { ensureWorkspaceDirExists } from "./tools/impl/workspace.utils.js";

console.log(
  "🤖 Menyiapkan Degen Agent AI (Phase 5: Specialized Agents & Orchestrator)...",
);

if (!config.telegramBotToken || !config.geminiApiKey) {
  console.error(
    "❌ Gagal menjalankan bot: TELEGRAM_BOT_TOKEN atau GEMINI_API_KEY belum diisi di file .env!",
  );
  process.exit(1);
}

ensureWorkspaceDirExists();

const memoryManager = new MemoryManager("data/agent.db");
console.log("💾 SQLite Memory Manager aktif (data/agent.db)");

const llmProvider = new GeminiProvider(config.geminiApiKey);

const profiles = buildAgentProfiles(llmProvider, memoryManager);
console.log(
  `🧠 Agent profiles siap (${profiles.length}): [${profiles.map((p) => p.name).join(", ")}]`,
);

const orchestrator = new Orchestrator(llmProvider, profiles);

const bot = new Bot(config.telegramBotToken);

bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Halo! Saya Degen AI Agent (Phase 5 - Specialized Agents Enabled).\n\nSekarang saya otomatis milih agent yang paling cocok buat jawab pertanyaan kamu (General/Research vs Dev & HoodBear), dan tetap mengingat riwayat percakapan kita.",
  );
});

bot.on("message:text", async (ctx) => {
  const userText = ctx.message.text;
  const chatId = ctx.chat.id;

  const loadingMsg = await ctx.reply("🤔 Sedang berpikir & mengingat...");

  try {
    const aiReply = await orchestrator.route(userText, chatId);

    await ctx.api.editMessageText(ctx.chat.id, loadingMsg.message_id, aiReply);
  } catch (error) {
    console.error("Error saat memproses pesan:", error);
    await ctx.api.editMessageText(
      ctx.chat.id,
      loadingMsg.message_id,
      "❌ Maaf, terjadi kesalahan saat menghubungi AI.",
    );
  }
});

bot.start({
  onStart: (botInfo) => {
    console.log(
      `✅ Bot @${botInfo.username} online dan siap mengingat percakapan!`,
    );
  },
});
