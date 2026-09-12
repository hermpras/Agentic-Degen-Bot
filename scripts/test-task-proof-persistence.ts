import "dotenv/config";

import { GeminiProvider } from "../src/providers/gemini.provider";
import { AgentDatabase } from "../src/database/agent-database";
import { BrowserExecutor } from "../src/browser/browser-executor";
import {
  AdaptiveWebExecutor,
  AdaptiveWebExecutionContext,
} from "../src/tasks/adaptive-web-executor";

async function main() {
  console.log("🧪 Adaptive Web Executor Test");
  console.log("================================");

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY belum tersedia.");
  }

  const database = new AgentDatabase("data/agent.db");

  try {
    const llm = new GeminiProvider(
      apiKey,
      process.env.GEMINI_MODEL || "gemini-3.5-flash",
    );

    const browser = new BrowserExecutor({
      headless: true,
      timeoutMs: 30000,
    });

    const executor = new AdaptiveWebExecutor(llm, browser, {
      maxSteps: 12,
    });

    const account = database
      .getDb()
      .prepare(
        `
        SELECT
          id,
          name,
          twitter_handle,
          wallet_address
        FROM accounts
        WHERE id = 1
          AND status = 'ACTIVE'
        LIMIT 1
        `,
      )
      .get() as
      | {
          id: number;
          name: string;
          twitter_handle: string | null;
          wallet_address: string | null;
        }
      | undefined;

    if (!account) {
      throw new Error("Account 1 tidak ditemukan atau tidak ACTIVE.");
    }

    const context: AdaptiveWebExecutionContext = {
      account: {
        accountId: account.id,
        accountName: account.name,
        twitterHandle: account.twitter_handle,
        walletAddress: account.wallet_address,
      },
    };

    console.log("\n👤 Account Context");
    console.log(JSON.stringify(context.account, null, 2));

    const result = await executor.execute(
      "https://quest.arcwar.gg/",
      "Inspect this project whitelist/quest page and complete any safe publicly available task flow. Determine the next action from the actual page state. Do not bypass CAPTCHA, anti-bot systems, rate limits, authentication restrictions, or wallet signing. If authentication, wallet signature, or manual approval is required, stop and report BLOCKED.",
      context,
    );

    console.log("\n================================");
    console.log("🎯 RESULT");
    console.log("================================");
    console.log(JSON.stringify(result, null, 2));

    console.log("\n================================");
    console.log("📋 PROOF");
    console.log("================================");
    console.log(JSON.stringify(result.proof, null, 2));
  } finally {
    database.getDb().close();
  }
}

main().catch((error) => {
  console.error("\n❌ Adaptive Web Executor test failed:");
  console.error(error);

  process.exit(1);
});
