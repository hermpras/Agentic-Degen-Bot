import { LLMMessage } from "../providers/llm.interface.js";
import { AgentDatabase } from "../database/agent-database.js";

export class MemoryManager {
  private database: AgentDatabase;

  constructor(dbPathRelative = "data/agent.db") {
    this.database = new AgentDatabase(dbPathRelative);
  }

  private get db() {
    return this.database.getDb();
  }

  /**
   * Menyimpan satu pesan ke dalam tabel messages.
   */
  saveMessage(
    chatId: string | number,
    role: "user" | "assistant" | "tool",
    content: string,
  ): void {
    const stmt = this.db.prepare(
      "INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)",
    );

    stmt.run(String(chatId), role, content);
  }

  /**
   * Mengambil N pesan terakhir (default: 20) untuk chat_id tertentu.
   *
   * Diurutkan secara kronologis (terlama ke terbaru)
   * untuk dikirim ke LLM Provider.
   */
  getRecentMessages(chatId: string | number, limit = 20): LLMMessage[] {
    const stmt = this.db.prepare(`
      SELECT role, content FROM (
        SELECT id, role, content
        FROM messages
        WHERE chat_id = ?
        ORDER BY id DESC
        LIMIT ?
      )
      ORDER BY id ASC
    `);

    const rows = stmt.all(String(chatId), limit) as Array<{
      role: "user" | "assistant" | "tool";
      content: string;
    }>;

    return rows.map((r) => ({
      role: r.role === "assistant" ? "model" : "user",
      content: r.content,
    }));
  }

  /**
   * Menghapus seluruh riwayat percakapan untuk chat_id tertentu.
   */
  clearHistory(chatId: string | number): void {
    const stmt = this.db.prepare("DELETE FROM messages WHERE chat_id = ?");

    stmt.run(String(chatId));
  }
}
