import { Tool } from './tool.interface.js';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  /**
   * Mendaftarkan tool baru ke registry
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`⚠️ Tool dengan nama "${tool.name}" sudah terdaftar. Mengganti...`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Mengambil tool berdasarkan nama
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Mengambil seluruh daftar tool yang terdaftar
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Eksekusi tool berdasarkan nama dan parameter yang diberikan LLM
   */
  async executeTool(name: string, args: Record<string, any>): Promise<string> {
    const tool = this.getTool(name);
    if (!tool) {
      return `Error: Tool dengan nama "${name}" tidak ditemukan di ToolRegistry.`;
    }

    try {
      console.log(`🔧 [ToolRegistry] Memanggil tool: ${name} dengan argumen:`, args);
      const result = await tool.execute(args);
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (error: any) {
      console.error(`❌ [ToolRegistry] Error saat eksekusi tool ${name}:`, error);
      return `Error saat eksekusi tool "${name}": ${error.message || String(error)}`;
    }
  }
}
