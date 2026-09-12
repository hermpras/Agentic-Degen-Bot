import "dotenv/config";

import { BrowserExecutor } from "../src/browser/browser-executor.js";
import { GeminiProvider } from "../src/providers/gemini.provider.js";
import { ProjectTaskAnalyzer } from "../src/projects/project-task-analyzer.js";

async function main() {
  const sourceUrl = process.argv[2] ?? "https://quest.arcwar.gg/";

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY belum tersedia di file .env.");
  }

  const browser = new BrowserExecutor({
    headless: true,
    timeoutMs: 30_000,
  });

  const llm = new GeminiProvider(apiKey);

  const analyzer = new ProjectTaskAnalyzer({
    browser,
    llm,
  });

  try {
    console.log("🔎 Analyzing project...");
    console.log(`🌐 URL: ${sourceUrl}`);
    console.log("");

    const result = await analyzer.analyze(sourceUrl);

    console.log("✅ ANALYSIS RESULT");
    console.log("==================");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("❌ Analyzer failed:");

    if (error instanceof Error) {
      console.error(error.stack ?? error.message);
    } else {
      console.error(error);
    }

    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("❌ Unexpected error:");

  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
});
