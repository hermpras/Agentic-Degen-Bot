import { Tool } from "../tool.interface.js";

export const getCurrentTimeTool: Tool = {
  name: "get_current_time",
  description:
    "Mendapatkan waktu (jam, menit, detik) dan tanggal lokal saat ini dari sistem.",
  riskLevel: "SAFE",
  parameters: {
    type: "object",
    properties: {},
  },
  async execute() {
    const now = new Date();

    return JSON.stringify({
      currentTime: now.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
      isoString: now.toISOString(),
      timeZone: "Asia/Jakarta (WIB)",
    });
  },
};
