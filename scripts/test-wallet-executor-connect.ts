import { BrowserExecutor } from "../src/browser/browser-executor.js";
import { WalletExecutor } from "../src/wallet/wallet-executor.js";
import { RabbyWalletConnector } from "../src/wallet/rabby-wallet-connector.js";

async function main(): Promise<void> {
  const browser = new BrowserExecutor({
    headless: false,
    timeoutMs: 30000,
    connectOverCDPUrl: "http://127.0.0.1:9223",
  });

  const walletExecutor = new WalletExecutor(browser);
  const rabbyConnector = new RabbyWalletConnector();

  const context = {
    accountId: 1,
    accountName: "Raja Tuyul",
    walletAddress: "0xcf51dbba6a82c2ed1f0a6ff9dacd803298693ae9",
  };

  try {
    await browser.start();

    await browser.open("https://themotif.art/ensemble#/ensemble");

    console.log("🌐 Motif terbuka.");

    console.log("\n🔎 Initial wallet inspection...");

    const initialInspection = await walletExecutor.inspectConnection(context);

    console.log(JSON.stringify(initialInspection, null, 2));

    if (initialInspection.connected) {
      console.log("\n⚠️ Wallet sudah connected di Motif.");

      console.log("\n🔎 Verifying active wallet...");

      const verification = await walletExecutor.verifyActiveWallet(context);

      console.log(JSON.stringify(verification, null, 2));

      if (verification.success && verification.matchesExpected) {
        console.log("\n🎉 Wallet verification PASS.");

        return;
      }

      throw new Error(verification.message);
    }

    /*
     * Penting:
     * Listener popup harus dipasang SEBELUM user
     * melakukan Connect Wallet → Rabby.
     */
    const popupPromise = browser.waitForNewPage(30000);

    console.log("\n👆 Sekarang lakukan flow manual:");
    console.log("   1. Klik Connect Wallet di Motif.");
    console.log("   2. Pilih Rabby.");
    console.log("   3. Tunggu popup Rabby.");
    console.log("   4. Popup akan ditangkap otomatis.");

    const rabbyPage = await popupPromise;

    if (!rabbyPage) {
      throw new Error("Popup Rabby tidak terdeteksi dalam 30 detik.");
    }

    console.log("\n🦊 Popup Rabby terdeteksi.");

    console.log(`URL: ${rabbyPage.url()}`);

    /*
     * RabbyWalletConnector memang menerima
     * Playwright Page sebagai argumen pertama.
     */
    const rabbyResult = await rabbyConnector.connect(rabbyPage, {
      expectedOrigin: "https://themotif.art",
      accountName: context.accountName,
      walletAddress: context.walletAddress,
    });

    console.log("\n🦊 Rabby connection result:");

    console.log(JSON.stringify(rabbyResult, null, 2));

    if (!rabbyResult.success || !rabbyResult.connected) {
      throw new Error(rabbyResult.message);
    }

    console.log("\n🌐 Kembali ke halaman Motif.");

    await new Promise((resolve) => setTimeout(resolve, 1500));

    console.log("\n🔎 Verifying wallet di Motif...");

    const verification = await walletExecutor.verifyActiveWallet(context);

    console.log(JSON.stringify(verification, null, 2));

    if (!verification.success || !verification.matchesExpected) {
      throw new Error(verification.message);
    }

    console.log("\n🎉 Wallet connection PASS.");

    console.log(
      `✅ Account "${context.accountName}" menggunakan wallet yang benar.`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
