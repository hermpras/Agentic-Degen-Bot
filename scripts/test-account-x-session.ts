import { AccountBrowser } from "../src/browser/account-browser.js";

async function main(): Promise<void> {
  const rawAccountId = process.argv[2];

  if (!rawAccountId) {
    throw new Error(
      "Account ID wajib diberikan.\n" +
        "Contoh: npx tsx scripts/test-account-x-session.ts 2",
    );
  }

  const accountId = Number(rawAccountId);

  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw new Error("Account ID harus berupa integer positif.");
  }

  console.log("");
  console.log("==========================================");
  console.log("🧪 X Account Session Test");
  console.log("==========================================");
  console.log("");

  const accountBrowser = new AccountBrowser(undefined, {
    headless: false,
    timeoutMs: 30_000,
  });

  try {
    console.log(`👤 Opening Account ${accountId}...`);

    const browser = await accountBrowser.openForAccount(accountId);

    console.log(`👤 Current account: ${accountBrowser.getCurrentAccountId()}`);

    const result = await browser.open("https://x.com/home");

    const currentUrl = await browser.getCurrentUrl();

    console.log("");
    console.log(`🌐 Current URL: ${currentUrl}`);
    console.log(`📄 Page title: ${result.title}`);
    console.log("");
    console.log("📄 Page text:");
    console.log("------------------------------------------");
    console.log(result.text.slice(0, 5000));
    console.log("------------------------------------------");
    console.log("");

    if (currentUrl.includes("/login")) {
      throw new Error(
        `Account ${accountId} belum authenticated di X. Redirect ke halaman login.`,
      );
    }

    console.log(`✅ Account ${accountId} tidak diarahkan ke halaman login.`);
    console.log("✅ X session berhasil dibuka.");
    console.log("");
    console.log("⚠️ Cek browser yang terbuka.");
    console.log(
      `⚠️ Pastikan akun X yang tampil adalah akun untuk Account ${accountId}.`,
    );
    console.log("");
    console.log("Tekan ENTER untuk menutup browser.");

    await new Promise<void>((resolve) => {
      process.stdin.resume();
      process.stdin.once("data", () => resolve());
    });
  } finally {
    await accountBrowser.close();

    console.log("");
    console.log("🧹 Browser ditutup.");
  }
}

main().catch((error) => {
  console.error("");
  console.error("❌ X Account Session Test gagal:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
