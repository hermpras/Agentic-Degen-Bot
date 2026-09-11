import { Bot } from "grammy";
import { config } from "./config/index.js";
import { GeminiProvider } from "./providers/gemini.provider.js";
import { Agent } from "./agent/agent.js";
import { ToolRegistry } from "./tools/tool-registry.js";
import { MemoryManager } from "./memory/memory-manager.js";
import { getCurrentTimeTool } from "./tools/impl/get-current-time.tool.js";
import { webSearchTool } from "./tools/impl/web-search.tool.js";
import { readFileTool } from "./tools/impl/read-file.tool.js";
import { writeFileTool } from "./tools/impl/write-file.tool.js";
import { browsePageTool } from "./tools/impl/browse-page.tool.js";
import { ensureWorkspaceDirExists } from "./tools/impl/workspace.utils.js";
import { githubReadFileTool } from "./tools/impl/github-read-file.tool.js";
import { githubListDirectoryTool } from "./tools/impl/github-list-directory.tool.js";
import { githubGetRecentCommitsTool } from "./tools/impl/github-get-recent-commits.tool.js";
import { githubGetWorkflowStatusTool } from "./tools/impl/github-get-workflow-status.tool.js";

console.log(
  "🤖 Menyiapkan Degen Agent AI (Phase 4: SQLite Memory & History Enabled)...",
);

if (!config.telegramBotToken || !config.geminiApiKey) {
  console.error(
    "❌ Gagal menjalankan bot: TELEGRAM_BOT_TOKEN atau GEMINI_API_KEY belum diisi di file .env!",
  );
  process.exit(1);
}

// Pastikan folder workspace/ ada saat aplikasi startup
ensureWorkspaceDirExists();

// 1. Inisialisasi Memory Manager (SQLite DB: data/agent.db)
const memoryManager = new MemoryManager("data/agent.db");
console.log("💾 SQLite Memory Manager aktif (data/agent.db)");

// 2. Inisialisasi Tool Registry & Daftarkan Tools
const toolRegistry = new ToolRegistry();
toolRegistry.register(getCurrentTimeTool);
toolRegistry.register(webSearchTool);
toolRegistry.register(readFileTool);
toolRegistry.register(writeFileTool);
toolRegistry.register(browsePageTool);
toolRegistry.register(githubReadFileTool);
toolRegistry.register(githubListDirectoryTool);
toolRegistry.register(githubGetRecentCommitsTool);
toolRegistry.register(githubGetWorkflowStatusTool);

console.log(
  `🛠️ Tool Registry siap. Tools terdaftar (${toolRegistry.getAllTools().length}): [${toolRegistry
    .getAllTools()
    .map((t) => t.name)
    .join(", ")}]`,
);

// 3. Inisialisasi Provider LLM (Provider-Agnostic)
const llmProvider = new GeminiProvider(config.geminiApiKey);

// 4. Inisialisasi Core Agent dengan LLM Provider, Tool Registry, & Memory Manager
const agent = new Agent(llmProvider, toolRegistry, {
  memoryManager,
});

// 5. Inisialisasi Telegram Bot via grammy
const bot = new Bot(config.telegramBotToken);

// Handler command /start
bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Halo! Saya Degen AI Agent (Phase 4 - SQLite Memory & History Enabled).\n\nSaya akan mengingat riwayat percakapan kita per-user! Coba beri tahu saya nama atau favorit kamu.",
  );
});

// Handler pesan teks biasa: Telegram -> Agent Reasoning Loop -> Telegram
bot.on("message:text", async (ctx) => {
  const userText = ctx.message.text;
  const chatId = ctx.chat.id;

  // Indikator loading
  const loadingMsg = await ctx.reply("🤔 Sedang berpikir & mengingat...");

  try {
    // Jalankan Reasoning Loop di dalam Agent dengan konteks chat_id
    const aiReply = await agent.processMessage(userText, chatId);

    // Edit pesan loading dengan jawaban dari AI
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

// Jalankan Bot secara lokal (Long Polling)
bot.start({
  onStart: (botInfo) => {
    console.log(
      `✅ Bot @${botInfo.username} online dan siap mengingat percakapan!`,
    );
  },
});
