import { AccountBrowser } from "../src/browser/account-browser.js";

async function main(): Promise<void> {
  const accountId = 1;

  console.log(
    `🧪 Testing persistent Chrome profile untuk account-${accountId}...`,
  );

  const accountBrowser = new AccountBrowser({
    headless: true,
    timeoutMs: 30_000,
    profilesRootDir: "playwright/chrome-profiles",
  });

  try {
    const browser = await accountBrowser.openForAccount(accountId);

    console.log("🌐 Membuka X...");
    await browser.open("https://x.com/home");

    // Beri waktu sedikit untuk X merender SPA-nya.
    await new Promise((resolve) => setTimeout(resolve, 3_000));

    const currentUrl = await browser.getCurrentUrl();

    console.log(`📍 URL: ${currentUrl}`);

    const bodyText = await browser.getText("body");

    console.log("\n📋 BODY PREVIEW:");

    if (bodyText.trim().length === 0) {
      console.log("(body masih kosong)");
    } else {
      console.log(bodyText.slice(0, 2000));
    }

    console.log("\n✅ Persistent profile berhasil dibuka.");
  } catch (error) {
    console.error("\n❌ Test gagal:");

    if (error instanceof Error) {
      console.error(error.message);
      console.error(error.stack);
    } else {
      console.error(error);
    }

    process.exitCode = 1;
  } finally {
    await accountBrowser.close();
    console.log("\n🔒 Browser ditutup.");
  }
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exitCode = 1;
});
