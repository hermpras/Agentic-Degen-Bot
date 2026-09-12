import "dotenv/config";

import { AgentDatabase } from "../src/database/agent-database.js";
import { BrowserExecutor } from "../src/browser/browser-executor.js";
import { WalletExecutor } from "../src/wallet/wallet-executor.js";

async function main() {
  console.log("🧪 WalletExecutor Test");
  console.log("======================");

  const database = new AgentDatabase("data/agent.db");

  const browser = new BrowserExecutor({
    headless: true,
    timeoutMs: 30000,
  });

  try {
    const account = database
      .getDb()
      .prepare(
        `
        SELECT
          id,
          name,
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
          wallet_address: string | null;
        }
      | undefined;

    if (!account) {
      throw new Error("Account 1 tidak ditemukan atau tidak ACTIVE.");
    }

    if (!account.wallet_address) {
      throw new Error("Account 1 belum memiliki wallet address.");
    }

    console.log("\n👤 Account");
    console.log(
      JSON.stringify(
        {
          id: account.id,
          name: account.name,
          walletAddress: account.wallet_address,
        },
        null,
        2,
      ),
    );

    console.log("\n🌐 Opening Motif...");

    await browser.open("https://themotif.art/ensemble#/ensemble");

    const walletExecutor = new WalletExecutor(browser);

    const result = await walletExecutor.inspectConnection({
      accountId: account.id,
      accountName: account.name,
      walletAddress: account.wallet_address,
    });

    console.log("\n================================");
    console.log("🎯 RESULT");
    console.log("================================");
    console.log(JSON.stringify(result, null, 2));

    if (!result.success) {
      throw new Error(`WalletExecutor gagal: ${result.message}`);
    }

    console.log("\n✅ WalletExecutor test PASS.");
  } finally {
    await browser.close();
    database.getDb().close();
  }
}

main().catch((error) => {
  console.error("\n❌ WalletExecutor test failed:");
  console.error(error);
  process.exit(1);
});
