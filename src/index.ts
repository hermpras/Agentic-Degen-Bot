import { Bot, InlineKeyboard } from "grammy";

import { config } from "./config/index.js";
import { GeminiProvider } from "./providers/gemini.provider.js";
import { MemoryManager } from "./memory/memory-manager.js";
import { buildAgentProfiles } from "./agents/agent-profiles.js";
import { Orchestrator } from "./orchestrator/orchestrator.js";
import { ApprovalService } from "./approval/approval-service.js";
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
  `🧠 Agent profiles siap (${profiles.length}): [${profiles
    .map((p) => p.name)
    .join(", ")}]`,
);

const orchestrator = new Orchestrator(llmProvider, profiles);

const approvalServices = profiles.map(
  (profile) =>
    new ApprovalService(
      profile.approvalManager,
      profile.agent.getToolRegistry(),
    ),
);

const bot = new Bot(config.telegramBotToken);

bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Halo! Saya Degen AI Agent (Phase 5 - Specialized Agents Enabled).\n\nSekarang saya otomatis memilih agent yang paling cocok buat menjawab pertanyaan kamu (General/Research vs Dev & HoodBear), dan tetap mengingat riwayat percakapan kita.",
  );
});

bot.on("message:text", async (ctx) => {
  const userText = ctx.message.text;
  const chatId = ctx.chat.id;

  const loadingMsg = await ctx.reply("🤔 Sedang berpikir & mengingat...");

  try {
    const aiReply = await orchestrator.route(userText, chatId);

    const approvalRequest = approvalServices
      .flatMap((service) => service.getPendingRequests())
      .find((request) => request.chatId === chatId);

    if (approvalRequest) {
      const keyboard = new InlineKeyboard()
        .text("✅ Approve", `approve:${approvalRequest.id}`)
        .text("❌ Reject", `reject:${approvalRequest.id}`);

      await ctx.api.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        aiReply,
        {
          reply_markup: keyboard,
        },
      );

      return;
    }

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

bot.callbackQuery(/^approve:(.+)$/, async (ctx) => {
  const approvalId = ctx.match[1];

  const chatId = ctx.callbackQuery.message?.chat.id;

  if (chatId === undefined) {
    await ctx.answerCallbackQuery({
      text: "❌ Chat tidak ditemukan.",
      show_alert: true,
    });

    return;
  }

  console.log(
    `🔐 [Telegram Approval] Approve request ${approvalId} dari chat ${chatId}`,
  );

  for (const service of approvalServices) {
    const request = service.getRequest(approvalId);

    if (!request) {
      continue;
    }

    if (request.chatId !== chatId) {
      await ctx.answerCallbackQuery({
        text: "❌ Approval ini bukan milik chat kamu.",
        show_alert: true,
      });

      return;
    }

    const result = await service.approveAndExecute(approvalId, chatId);

    await ctx.answerCallbackQuery({
      text: "✅ Approval diproses.",
    });

    await ctx.reply(`🔐 Approval selesai.\n\nHasil:\n${result}`);

    return;
  }

  await ctx.answerCallbackQuery({
    text: "❌ Approval request tidak ditemukan.",
    show_alert: true,
  });
});

bot.callbackQuery(/^reject:(.+)$/, async (ctx) => {
  const approvalId = ctx.match[1];

  const chatId = ctx.callbackQuery.message?.chat.id;

  if (chatId === undefined) {
    await ctx.answerCallbackQuery({
      text: "❌ Chat tidak ditemukan.",
      show_alert: true,
    });

    return;
  }

  console.log(
    `🔐 [Telegram Approval] Reject request ${approvalId} dari chat ${chatId}`,
  );

  for (const service of approvalServices) {
    const request = service.getRequest(approvalId);

    if (!request) {
      continue;
    }

    if (request.chatId !== chatId) {
      await ctx.answerCallbackQuery({
        text: "❌ Approval ini bukan milik chat kamu.",
        show_alert: true,
      });

      return;
    }

    const rejectedRequest = service.rejectForChat(approvalId, chatId);

    if (!rejectedRequest) {
      await ctx.answerCallbackQuery({
        text: "❌ Gagal menolak approval.",
        show_alert: true,
      });

      return;
    }

    await ctx.answerCallbackQuery({
      text: "❌ Tool ditolak.",
    });

    await ctx.reply(
      `❌ Approval ditolak.\n\nTool: ${rejectedRequest.toolName}`,
    );

    return;
  }

  await ctx.answerCallbackQuery({
    text: "❌ Approval request tidak ditemukan.",
    show_alert: true,
  });
});

bot.start({
  onStart: (botInfo) => {
    console.log(
      `✅ Bot @${botInfo.username} online dan siap mengingat percakapan!`,
    );
  },
});
