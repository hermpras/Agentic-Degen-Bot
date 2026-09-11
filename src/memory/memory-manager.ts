import { LLMMessage } from "../providers/llm.interface.js";
import { AgentDatabase } from "../database/agent-database.js";

export class MemoryManager {
  constructor(private readonly database: AgentDatabase) {}

  private get db() {
    return this.database.getDb();
  }

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
      role: "assistant" | "user" | "tool";
      content: string;
    }>;

    return rows.map((r) => ({
      role: r.role === "assistant" ? "model" : "user",
      content: r.content,
    }));
  }

  clearHistory(chatId: string | number): void {
    const stmt = this.db.prepare("DELETE FROM messages WHERE chat_id = ?");

    stmt.run(String(chatId));
  }
}
