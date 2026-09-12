import "dotenv/config";
import { GeminiProvider } from "../src/providers/gemini.provider";
import { AgentDatabase } from "../src/database/agent-database";
import { BrowserExecutor } from "../src/browser/browser-executor";
import {
  AdaptiveWebExecutor,
  AdaptiveWebExecutionContext,
} from "../src/tasks/adaptive-web-executor";

async function main() {
  console.log("🧪 Adaptive Wallet Check Test");
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

    if (!account.wallet_address) {
      throw new Error("Account 1 belum memiliki wallet address.");
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
      "https://themotif.art/ensemble#/ensemble",
      `
Check this wallet on the website using the wallet address
belonging to the provided account.

Use the account walletAddress as the value for the wallet
address input.

Complete the normal public wallet-check flow:
1. Inspect the actual page.
2. Find the wallet address input.
3. Fill it with the account wallet address.
4. Click the normal Check action.
5. Read and report the result shown by the page.

Do not connect an external wallet.
Do not sign any message or transaction.
Do not use private keys.
Do not bypass CAPTCHA, anti-bot systems, rate limits,
authentication restrictions, or other security controls.

If the page requires wallet connection or signing instead
of accepting the wallet address directly, stop and report
BLOCKED.
      `,
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
  console.error("\n❌ Adaptive wallet check test failed:");
  console.error(error);
  process.exit(1);
});
