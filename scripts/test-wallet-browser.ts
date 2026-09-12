import { WalletBrowser } from "../src/wallet/wallet-browser.js";

async function main() {
  console.log("🧪 WalletBrowser Test");
  console.log("====================");

  const walletBrowser = new WalletBrowser();

  console.log("\n📁 Session path:");
  console.log(walletBrowser.getSessionPath(1));

  console.log("\n🔎 Session exists:");
  console.log(walletBrowser.hasSession(1));

  if (walletBrowser.hasSession(1)) {
    throw new Error(
      "Test ini mengharapkan Account 1 belum memiliki wallet session.",
    );
  }

  try {
    await walletBrowser.openForAccount(1);

    throw new Error("WalletBrowser seharusnya menolak account tanpa session.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.log("\n🎯 Expected error:");
    console.log(message);

    if (!message.includes("Wallet session untuk account 1 belum tersedia")) {
      throw error;
    }
  }

  console.log("\n✅ WalletBrowser test PASS.");
}

main().catch((error) => {
  console.error("\n❌ WalletBrowser test failed:");
  console.error(error);
  process.exit(1);
});
