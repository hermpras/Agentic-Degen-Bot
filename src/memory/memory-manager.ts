import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { LLMMessage } from '../providers/llm.interface.js';

export class MemoryManager {
  private db: Database.Database;

  constructor(dbPathRelative = 'data/agent.db') {
    const fullPath = path.resolve(process.cwd(), dbPathRelative);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(fullPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
    `);
  }

  /**
   * Menyimpan satu pesan ke dalam tabel messages
   */
  saveMessage(chatId: string | number, role: 'user' | 'assistant' | 'tool', content: string): void {
    const stmt = this.db.prepare(
      'INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)'
    );
    stmt.run(String(chatId), role, content);
  }

  /**
   * Mengambil N pesan terakhir (default: 20) untuk chat_id tertentu
   * Diurutkan secara kronologis (terlama ke terbaru) untuk dikirim ke LLM Provider
   */
  getRecentMessages(chatId: string | number, limit = 20): LLMMessage[] {
    const stmt = this.db.prepare(`
      SELECT role, content FROM (
        SELECT id, role, content FROM messages
        WHERE chat_id = ?
        ORDER BY id DESC
        LIMIT ?
      ) ORDER BY id ASC
    `);

    const rows = stmt.all(String(chatId), limit) as Array<{
      role: 'user' | 'assistant' | 'tool';
      content: string;
    }>;

    return rows.map((r) => ({
      role: r.role === 'assistant' ? 'model' : 'user',
      content: r.content,
    }));
  }

  /**
   * Menghapus seluruh riwayat percakapan untuk chat_id tertentu
   */
  clearHistory(chatId: string | number): void {
    const stmt = this.db.prepare('DELETE FROM messages WHERE chat_id = ?');
    stmt.run(String(chatId));
  }
}
