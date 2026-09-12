import { BrowserExecutor } from "../src/browser/browser-executor.js";
import { RabbyWalletConnector } from "../src/wallet/rabby-wallet-connector.js";

async function main(): Promise<void> {
  const browser = new BrowserExecutor({
    headless: false,
    timeoutMs: 30000,
    connectOverCDPUrl: "http://127.0.0.1:9223",
  });

  const connector = new RabbyWalletConnector();

  try {
    await browser.start();

    await browser.open("https://themotif.art/ensemble#/ensemble");

    console.log("🌐 Motif terbuka.");
    console.log("👆 Klik Connect Wallet → Rabby.");

    const rabbyPagePromise = browser.waitForNewPage(30000);

    const rabbyPage = await rabbyPagePromise;

    if (!rabbyPage) {
      throw new Error("Popup Rabby tidak terdeteksi.");
    }

    console.log("🦊 Rabby popup terdeteksi:", rabbyPage.url());

    console.log("⏳ Menunggu UI Rabby selesai render...");

    try {
      await rabbyPage.waitForFunction(
        () => {
          const text = document.body?.innerText?.trim() ?? "";

          return text.length > 0;
        },
        {
          timeout: 10000,
        },
      );
    } catch {
      console.log("⚠️ Body Rabby belum berisi text setelah 10 detik.");
    }

    await rabbyPage.waitForTimeout(1000);

    const bodyText = await rabbyPage
      .locator("body")
      .innerText()
      .catch(() => "");

    console.log("\n🦊 Rabby popup body:");
    console.log(bodyText || "(BODY KOSONG)");

    console.log("\n🔘 Rabby buttons:");

    const buttons = await rabbyPage
      .locator("button")
      .allTextContents()
      .catch(() => []);

    console.log(buttons);

    console.log("\n🧪 Menjalankan Rabby connection...");

    const result = await connector.connect(rabbyPage, {
      accountName: "Raja Tuyul",
      walletAddress: "0xcf51dbba6a82c2ed1f0a6ff9dacd803298693ae9",
      expectedOrigin: "https://themotif.art",
    });

    console.log("\n📋 Connection result:");
    console.log(JSON.stringify(result, null, 2));

    if (!result.success || !result.connected) {
      throw new Error(result.message);
    }

    console.log("\n✅ Rabby Connect berhasil.");

    console.log("⏳ Menunggu Motif kembali aktif...");

    await browser.usePage(
      (await browser
        .getOpenPages()
        .find((page) => page.url().includes("themotif.art"))) ??
        (() => {
          throw new Error("Halaman Motif tidak ditemukan.");
        })(),
    );

    await browser.getActivePage().waitForTimeout(1500);

    const motifText = await browser
      .getActivePage()
      .locator("body")
      .innerText()
      .catch(() => "");

    console.log("\n🌐 Motif page:");
    console.log(motifText.slice(0, 5000));

    console.log("\n🎉 FULL RABBY CONNECTION TEST PASS.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
