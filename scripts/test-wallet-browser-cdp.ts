import { WalletBrowser } from "../src/wallet/wallet-browser.js";

async function main() {
  console.log("🧪 WalletBrowser CDP Test");
  console.log("========================");

  const walletBrowser = new WalletBrowser();

  const browser = await walletBrowser.openForAccount(1, {
    connectOverCDPUrl: "http://127.0.0.1:9223",
    timeoutMs: 30000,
  });

  try {
    console.log("\n✅ WalletBrowser connected.");

    const result = await browser.evaluate(`
      (() => ({
        url: window.location.href,
        title: document.title,
      }))()
    `);

    console.log("\n📋 Current page:");
    console.log(JSON.stringify(result, null, 2));

    if (
      typeof result !== "object" ||
      result === null ||
      !("url" in result) ||
      !("title" in result)
    ) {
      throw new Error("Browser result tidak memiliki url/title.");
    }

    console.log("\n✅ WalletBrowser CDP test PASS.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("\n❌ WalletBrowser CDP test failed:");
  console.error(error);
  process.exit(1);
});
