import { chromium } from "playwright";
import { Tool } from "../tool.interface.js";

export const browsePageTool: Tool = {
  name: "browse_page",
  description:
    "Membuka dan membaca isi lengkap dari sebuah URL halaman web publik (Read-Only) menggunakan headless browser Chromium. Sangat berguna untuk situs web berbasis JavaScript / Single Page Application (SPA) yang membutuhkan rendering halaman.",
  riskLevel: "SAFE",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          'URL lengkap halaman web yang akan dibuka (contoh: "https://example.com" atau "https://hoodbear.site")',
      },
    },
    required: ["url"],
  },
  async execute(args: Record<string, any>) {
    const rawUrl = args.url;

    if (!rawUrl || typeof rawUrl !== "string") {
      return JSON.stringify({
        error: 'Parameter "url" wajib diisi dengan string URL yang valid.',
      });
    }

    let targetUrl = rawUrl.trim();

    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = `https://${targetUrl}`;
    }

    let browser;

    try {
      console.log(
        `🌐 [BrowsePage] Membuka browser Playwright Chromium ke URL: "${targetUrl}"`,
      );

      browser = await chromium.launch({
        headless: true,
      });

      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 800 },
      });

      const page = await context.newPage();

      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      try {
        await page.waitForLoadState("networkidle", { timeout: 3000 });
      } catch (e) {
        // Ignored: fallback untuk halaman SPA dengan websocket / polling aktif
      }

      const title = await page.title();

      let bodyText = (await page.innerText("body")) || "";

      bodyText = bodyText
        .split("\n")
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0)
        .join("\n");

      const maxChars = 6000;
      let isTruncated = false;

      if (bodyText.length > maxChars) {
        bodyText = bodyText.substring(0, maxChars);
        isTruncated = true;
      }

      return JSON.stringify({
        url: targetUrl,
        title: title || "Tanpa Judul",
        contentLength: bodyText.length,
        isTruncated,
        content: bodyText || "(Halaman web tidak mengembalikan teks)",
      });
    } catch (error: any) {
      console.error(
        `❌ [BrowsePage Error] Gagal membuka URL ${targetUrl}:`,
        error,
      );

      const errorMessage = error.message || String(error);

      if (
        errorMessage.includes("Timeout") ||
        errorMessage.includes("timeout")
      ) {
        return JSON.stringify({
          error: `Waktu habis (Timeout 15s) saat membuka ${targetUrl}. Halaman lambat atau tidak merespon.`,
        });
      }

      if (
        errorMessage.includes("ERR_NAME_NOT_RESOLVED") ||
        errorMessage.includes("ENOTFOUND")
      ) {
        return JSON.stringify({
          error: `Domain/URL "${targetUrl}" tidak ditemukan. Pastikan alamat URL sudah benar.`,
        });
      }

      return JSON.stringify({
        error: `Gagal membuka halaman web "${targetUrl}": ${errorMessage}`,
      });
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  },
};
