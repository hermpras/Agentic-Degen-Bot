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

interface ExecutionTaskResult {
  planTaskId?: string;
  taskId?: number;
  projectName?: string;
  accountName?: string;
  taskType?: string;
  status?: string;
  output?: string;
  error?: string | null;
}

interface ExecutionReport {
  totalTasks?: number;
  completedTasks?: number;
  failedTasks?: number;
  skippedTasks?: number;
  results?: ExecutionTaskResult[];
}

interface ExecutionResult {
  success?: boolean;
  executionStarted?: boolean;
  planId?: number;
  status?: string;
  message?: string;
  projectName?: string;
  sourceUrl?: string;
  accountCount?: number;
  taskCount?: number;
  report?: ExecutionReport;
}

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

function parseExecutionResult(result: string): ExecutionResult | null {
  try {
    const parsed: unknown = JSON.parse(result);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    return parsed as ExecutionResult;
  } catch {
    return null;
  }
}

function formatTaskStatus(status?: string): string {
  switch (status) {
    case "DONE":
      return "✅";

    case "FAILED":
      return "❌";

    case "IN_PROGRESS":
      return "🔄";

    case "PENDING":
      return "⏳";

    default:
      return "•";
  }
}

function formatExecutionResult(result: string): string {
  const parsed = parseExecutionResult(result);

  if (!parsed?.report) {
    return result;
  }

  const report = parsed.report;
  const results = report.results ?? [];
  const lines: string[] = [];

  if (parsed.status === "COMPLETED") {
    lines.push("✅ Execution completed");
  } else if (parsed.status === "PARTIAL") {
    lines.push("🟡 Execution partially completed");
  } else if (parsed.status === "BLOCKED") {
    lines.push("⏸️ Execution blocked");
  } else {
    lines.push("📋 Execution finished");
  }

  lines.push("");

  if (parsed.projectName) {
    lines.push(`🦍 ${parsed.projectName}`);
  }

  if (parsed.planId !== undefined) {
    lines.push(`📋 Plan #${parsed.planId}`);
  }

  lines.push("");

  for (const task of results) {
    const icon = formatTaskStatus(task.status);
    const accountName = task.accountName ?? "Unknown account";
    const taskType = task.taskType ?? "UNKNOWN";

    lines.push(`${icon} ${accountName} — ${taskType}`);

    if (task.status === "FAILED" && task.error) {
      lines.push(`   └─ ${task.error}`);
    }
  }

  lines.push("");

  const totalTasks = report.totalTasks ?? results.length;
  const completedTasks = report.completedTasks ?? 0;
  const failedTasks = report.failedTasks ?? 0;
  const skippedTasks = report.skippedTasks ?? 0;

  lines.push("📊 Summary");
  lines.push(`✅ ${completedTasks}/${totalTasks} completed`);
  lines.push(`❌ ${failedTasks} failed`);
  lines.push(`⏭️ ${skippedTasks} skipped`);

  return lines.join("\n");
}

async function main(): Promise<void> {
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

  const profiles = await buildAgentProfiles(
    llmProvider,
    memoryManager,
    database,
  );

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

      await ctx.api.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        aiReply,
      );
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
      const rawResult = await service.approveAndExecute(approvalId, chatId);

      const formattedResult = formatExecutionResult(rawResult);

      await replyLongMessage(ctx, formattedResult);
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
      text: rejected
        ? "Approval ditolak."
        : "Approval request tidak ditemukan.",
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
}

main().catch((error) => {
  console.error("❌ Fatal error saat startup Degen Agent AI:", error);

  process.exit(1);
});
