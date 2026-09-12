import { Bot, Context } from "grammy";
import { config } from "./config/index.js";
import { GeminiProvider } from "./providers/gemini.provider.js";
import { AgentDatabase } from "./database/agent-database.js";
import { MemoryManager } from "./memory/memory-manager.js";
import { buildAgentProfiles } from "./agents/agent-profiles.js";
import { Orchestrator } from "./orchestrator/orchestrator.js";
import { ensureWorkspaceDirExists } from "./tools/impl/workspace.utils.js";
import { ApprovalService } from "./approval/approval-service.js";

console.log("🤖 Menyiapkan Degen Agent AI...");

if (!config.telegramBotToken || !config.geminiApiKey) {
  console.error(
    "❌ Gagal menjalankan bot: TELEGRAM_BOT_TOKEN atau GEMINI_API_KEY belum diisi di file .env!",
  );
  process.exit(1);
}

ensureWorkspaceDirExists();

const database = new AgentDatabase("data/agent.db");
console.log("💾 SQLite Database aktif (data/agent.db)");

const memoryManager = new MemoryManager(database);
console.log("🧠 Memory Manager aktif.");

const llmProvider = new GeminiProvider(config.geminiApiKey);

const profiles = buildAgentProfiles(llmProvider, memoryManager, database);

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

const TELEGRAM_MAX_MESSAGE_LENGTH = 4000;

function splitTelegramMessage(text: string): string[] {
  if (text.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > TELEGRAM_MAX_MESSAGE_LENGTH) {
    let splitAt = remaining.lastIndexOf("\n", TELEGRAM_MAX_MESSAGE_LENGTH);

    if (splitAt <= 0) {
      splitAt = TELEGRAM_MAX_MESSAGE_LENGTH;
    }

    chunks.push(remaining.slice(0, splitAt));

    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

async function replyLongMessage(ctx: Context, text: string): Promise<void> {
  const chunks = splitTelegramMessage(text);

  for (const chunk of chunks) {
    await ctx.reply(chunk);
  }
}

bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Halo! Saya Degen AI Agent.\n\nSaya bisa melakukan riset, development, menggunakan tools, dan mengingat percakapan kita.",
  );
});

bot.on("message:text", async (ctx) => {
  const userText = ctx.message.text;
  const chatId = ctx.chat.id;
  const loadingMsg = await ctx.reply("🤔 Sedang berpikir & mengingat...");

  try {
    const aiReply = await orchestrator.route(userText, chatId);

    const pendingApproval = approvalServices
      .flatMap((service) => service.getPendingRequests())
      .find((request) => request.chatId === chatId);

    if (pendingApproval) {
      const service = approvalServices.find(
        (candidate) =>
          candidate.getRequest(pendingApproval.id)?.id === pendingApproval.id,
      );

      if (service) {
        await ctx.api.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          aiReply,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Approve",
                    callback_data: `approve:${pendingApproval.id}`,
                  },
                  {
                    text: "❌ Reject",
                    callback_data: `reject:${pendingApproval.id}`,
                  },
                ],
              ],
            },
          },
        );

        return;
      }
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
      text: "Chat tidak ditemukan.",
      show_alert: true,
    });

    return;
  }

  const service = approvalServices.find(
    (candidate) => candidate.getRequest(approvalId)?.chatId === chatId,
  );

  if (!service) {
    await ctx.answerCallbackQuery({
      text: "Approval request tidak ditemukan.",
      show_alert: true,
    });

    return;
  }

  await ctx.answerCallbackQuery({
    text: "Approval disetujui.",
  });

  try {
    const result = await service.approveAndExecute(approvalId, chatId);

    await replyLongMessage(ctx, result);
  } catch (error) {
    console.error(`Error saat menjalankan approval ${approvalId}:`, error);

    await ctx.reply(
      "❌ Approval berhasil disetujui, tetapi terjadi error saat menjalankan tool. Cek terminal untuk detail.",
    );
  }
});

bot.callbackQuery(/^reject:(.+)$/, async (ctx) => {
  const approvalId = ctx.match[1];
  const chatId = ctx.callbackQuery.message?.chat.id;

  if (chatId === undefined) {
    await ctx.answerCallbackQuery({
      text: "Chat tidak ditemukan.",
      show_alert: true,
    });

    return;
  }

  const service = approvalServices.find(
    (candidate) => candidate.getRequest(approvalId)?.chatId === chatId,
  );

  if (!service) {
    await ctx.answerCallbackQuery({
      text: "Approval request tidak ditemukan.",
      show_alert: true,
    });

    return;
  }

  const rejected = service.rejectForChat(approvalId, chatId);

  await ctx.answerCallbackQuery({
    text: rejected ? "Approval ditolak." : "Approval request tidak ditemukan.",
  });

  await ctx.reply(
    rejected
      ? "❌ Approval ditolak. Tool tidak dijalankan."
      : "⚠️ Approval request tidak ditemukan.",
  );
});

bot.catch((error) => {
  console.error("❌ Unhandled Grammy error:", error.error);
});

bot.start({
  onStart: (botInfo) => {
    console.log(`✅ Bot @${botInfo.username} online dan siap!`);
  },
});
