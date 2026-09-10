export interface ToolParameterProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  enum?: string[];
}

export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface Tool {
  /**
   * Nama unik tool (contoh: 'get_current_time')
   */
  name: string;

  /**
   * Deskripsi tentang apa fungsi tool ini dan kapan LLM harus menggunakannya
   */
  description: string;

  /**
   * Skema parameter yang dibutuhkan oleh tool
   */
  parameters?: ToolParameters;

  /**
   * Fungsi eksekusi utama yang menjalankan logika tool
   */
  execute(args: Record<string, any>): Promise<any>;
}
