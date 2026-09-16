import http from "http";
import { AccountBrowser } from "../src/browser/account-browser.js";

const PORT = 3457;

function startTestServer(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Account Browser Test</title>
        </head>
        <body>
          <h1>Account Browser Test</h1>
          <p id="status">Account browser berhasil membuka halaman.</p>
        </body>
      </html>
    `;

    res.writeHead(200, {
      "Content-Type": "text/html",
    });

    res.end(html);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);

    server.listen(PORT, () => {
      console.log(`🧪 [TestServer] Running at http://127.0.0.1:${PORT}`);

      resolve(server);
    });
  });
}

async function main(): Promise<void> {
  console.log("");
  console.log("==========================================");
  console.log("🧪 Account Browser Test");
  console.log("==========================================");
  console.log("");

  const rawAccountId = process.argv[2];

  if (!rawAccountId) {
    throw new Error(
      "Account ID wajib diberikan.\n" +
        "Contoh: npx tsx scripts/test-account-browser.ts 1",
    );
  }

  const accountId = Number(rawAccountId);

  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw new Error("Account ID harus berupa integer positif.");
  }

  const server = await startTestServer();

  const accountBrowser = new AccountBrowser(undefined, {
    headless: false,
    timeoutMs: 30_000,
  });

  try {
    console.log(`👤 Opening browser for account ${accountId}...`);

    const executor = await accountBrowser.openForAccount(accountId);

    const currentAccountId = accountBrowser.getCurrentAccountId();

    console.log(`👤 Current account: ${currentAccountId}`);

    if (currentAccountId !== accountId) {
      throw new Error(
        `Account mismatch. Expected ${accountId}, got ${currentAccountId}.`,
      );
    }

    const result = await executor.open(`http://127.0.0.1:${PORT}`);

    console.log("");
    console.log(`📄 Page title: ${result.title}`);
    console.log(`📄 Page text: ${result.text}`);
    console.log("");

    if (!result.text.includes("Account browser berhasil membuka halaman.")) {
      throw new Error("Account browser gagal membuka test page.");
    }

    console.log(
      `✅ AccountBrowser berhasil menggunakan session Account ${accountId}.`,
    );

    console.log("💾 Saving session...");

    await accountBrowser.saveSession();

    console.log("🌐 Closing account browser...");

    await accountBrowser.close();

    console.log("");
    console.log("🎉 ACCOUNT BROWSER TEST BERHASIL.");
    console.log("==========================================");
    console.log(`✅ Account ID      : ${accountId}`);
    console.log(`✅ Current account : ${currentAccountId}`);
    console.log(`✅ Session berhasil digunakan.`);
    console.log(`✅ BrowserExecutor berhasil dibuat otomatis.`);
    console.log(`✅ Session berhasil disimpan.`);
    console.log("==========================================");
  } finally {
    await accountBrowser.close();

    server.close();

    console.log("");
    console.log("🧹 Test server ditutup.");
  }
}

main().catch((error) => {
  console.error("");
  console.error("❌ Account browser test gagal:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
