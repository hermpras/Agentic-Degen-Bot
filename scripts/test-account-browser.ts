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

  const server = await startTestServer();

  const accountId = 1;

  const accountBrowser = new AccountBrowser(undefined, {
    headless: false,
    timeoutMs: 30_000,
  });

  try {
    console.log(`👤 Opening browser for account ${accountId}...`);

    const executor = await accountBrowser.openForAccount(accountId);

    console.log(`👤 Current account: ${accountBrowser.getCurrentAccountId()}`);

    const result = await executor.open(`http://127.0.0.1:${PORT}`);

    console.log("");
    console.log(`📄 Page title: ${result.title}`);
    console.log(`📄 Page text: ${result.text}`);
    console.log("");

    if (!result.text.includes("Account browser berhasil membuka halaman.")) {
      throw new Error("Account browser gagal membuka test page.");
    }

    console.log("✅ AccountBrowser berhasil menggunakan session Account 1.");

    console.log("💾 Saving session...");

    await accountBrowser.saveSession();

    console.log("🌐 Closing account browser...");

    await accountBrowser.close();

    console.log("");
    console.log("🎉 ACCOUNT BROWSER TEST BERHASIL.");
    console.log("✅ Account ID berhasil diteruskan ke browser.");
    console.log("✅ Session account-1.json berhasil digunakan.");
    console.log("✅ BrowserExecutor berhasil dibuat otomatis.");
    console.log("✅ Session berhasil disimpan.");
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
  console.error(error);
  process.exit(1);
});
