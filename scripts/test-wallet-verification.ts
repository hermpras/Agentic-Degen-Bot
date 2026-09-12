import { AgentDatabase } from "../src/database/agent-database.js";
import { WalletBrowser } from "../src/wallet/wallet-browser.js";
import { WalletExecutor } from "../src/wallet/wallet-executor.js";

async function main() {
  console.log("🧪 Wallet Verification Test");
  console.log("==========================");

  const database = new AgentDatabase("data/agent.db");
  const walletBrowser = new WalletBrowser();

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

  const browser = await walletBrowser.openForAccount(1, {
    connectOverCDPUrl: "http://127.0.0.1:9223",
    timeoutMs: 30000,
  });

  try {
    console.log("\n👤 Account:");
    console.log(account.name);

    console.log("\n💰 Expected wallet:");
    console.log(account.wallet_address);

    console.log("\n🔍 Checking active Rabby wallet...");

    const walletExecutor = new WalletExecutor(browser);

    const result = await walletExecutor.verifyActiveWallet({
      accountId: account.id,
      accountName: account.name,
      walletAddress: account.wallet_address,
    });

    console.log("\n================================");
    console.log("🎯 RESULT");
    console.log("================================");
    console.log(JSON.stringify(result, null, 2));

    if (!result.success) {
      throw new Error(result.message);
    }

    if (!result.matchesExpected) {
      throw new Error("Wallet Rabby tidak cocok dengan Account 1.");
    }

    console.log("\n✅ Wallet verification test PASS.");
  } finally {
    await browser.close();
    database.getDb().close();
  }
}

main().catch((error) => {
  console.error("\n❌ Wallet verification test failed:");
  console.error(error);
  process.exit(1);
});
