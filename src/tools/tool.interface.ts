export type ToolRiskLevel = "SAFE" | "APPROVAL" | "STRONG_APPROVAL";

export interface ToolParameterProperty {
  type: "string" | "number" | "boolean" | "object" | "array";

  description?: string;

  enum?: string[];

  items?: ToolParameterProperty;

  properties?: Record<string, ToolParameterProperty>;

  required?: string[];
}

export interface ToolParameters {
  type: "object";

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
   * Tingkat risiko dari aksi yang dilakukan tool.
   *
   * SAFE:
   * Tidak mengubah state atau melakukan aksi sensitif.
   *
   * APPROVAL:
   * Mengubah state / melakukan aksi yang membutuhkan persetujuan user.
   *
   * STRONG_APPROVAL:
   * Aksi sangat sensitif seperti transaksi finansial, signing,
   * transfer dana, atau aksi irreversible lainnya.
   */
  riskLevel: ToolRiskLevel;

  /**
   * Skema parameter yang dibutuhkan oleh LLM.
   */
  parameters?: ToolParameters;

  /**
   * Fungsi eksekusi utama yang menjalankan logika tool.
   */
  execute(args: Record<string, any>): Promise<any>;
}
