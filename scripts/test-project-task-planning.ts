import "dotenv/config";

import { AgentDatabase } from "../src/database/agent-database.js";
import { BrowserExecutor } from "../src/browser/browser-executor.js";
import { GeminiProvider } from "../src/providers/gemini.provider.js";
import { ProjectTaskAnalyzer } from "../src/projects/project-task-analyzer.js";
import { ProjectTaskWorkflow } from "../src/workflows/project-task-workflow.js";

async function main() {
  const sourceUrl = process.argv[2] ?? "https://quest.arcwar.gg/";

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY belum tersedia di file .env.");
  }

  const database = new AgentDatabase("data/agent.db");

  const browser = new BrowserExecutor({
    headless: true,
    timeoutMs: 30_000,
  });

  try {
    console.log("========================================");
    console.log(" PROJECT TASK PLANNING TEST");
    console.log("========================================");
    console.log(`🌐 Source URL: ${sourceUrl}`);
    console.log("");

    const llm = new GeminiProvider(apiKey);

    const analyzer = new ProjectTaskAnalyzer({
      browser,
      llm,
    });

    console.log("🔎 Step 1: Analyze project...");

    const analyzedInput = await analyzer.analyze(sourceUrl);

    console.log("");
    console.log("✅ Analyzer result:");
    console.log(JSON.stringify(analyzedInput, null, 2));

    console.log("");
    console.log("🧠 Step 2: Build TaskPlan...");

    const workflow = new ProjectTaskWorkflow(database);

    const plan = workflow.createPlan(analyzedInput);

    console.log("");
    console.log("✅ TASK PLAN");
    console.log("============");
    console.log(JSON.stringify(plan, null, 2));

    console.log("");
    console.log("📊 SUMMARY");
    console.log("==========");
    console.log(`Project      : ${plan.projectName}`);
    console.log(`Accounts     : ${plan.accountCount}`);
    console.log(`Tasks        : ${plan.taskCount}`);
    console.log("");

    for (const task of plan.tasks) {
      console.log(
        [
          `# ${task.planTaskId}`,
          `account=${task.accountName}`,
          `type=${task.taskType}`,
          `target=${task.targetUrl ?? "-"}`,
          `dependsOn=${task.dependsOn.join(", ") || "-"}`,
        ].join(" | "),
      );
    }

    console.log("");
    console.log("🎯 Planning test selesai.");
    console.log("⚠️ Tidak ada task yang dieksekusi.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("");
  console.error("❌ TEST FAILED");

  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
});
