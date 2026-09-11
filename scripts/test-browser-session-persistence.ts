import http from "http";
import { BrowserSessionService } from "../src/browser/browser-session-service.js";

const PORT = 3456;
const TEST_VALUE = "agentic-session-persisted";

function startTestServer(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Browser Session Persistence Test</title>
        </head>
        <body>
          <h1>Browser Session Persistence Test</h1>

          <div id="status"></div>

          <script>
            const key = "agentic-session-test";
            const existing = localStorage.getItem(key);

            if (existing) {
              document.getElementById("status").innerText =
                "EXISTING:" + existing;
            } else {
              localStorage.setItem(
                key,
                "${TEST_VALUE}"
              );

              document.getElementById("status").innerText =
                "CREATED:${TEST_VALUE}";
            }
          </script>
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
  console.log("🧪 Browser Session Persistence Test");
  console.log("==========================================");
  console.log("");

  const server = await startTestServer();

  const sessionService = new BrowserSessionService();

  const accountId = 1;

  try {
    console.log("1️⃣ Starting first browser session...");

    const firstSession = await sessionService.startManualSession(accountId);

    console.log("🌐 Opening local persistence test page...");

    const firstResult = await firstSession.executor.open(
      `http://127.0.0.1:${PORT}`,
    );

    console.log(`📄 First page result: ${firstResult.text}`);

    if (!firstResult.text.includes(`CREATED:${TEST_VALUE}`)) {
      throw new Error("Browser pertama tidak membuat localStorage test value.");
    }

    console.log("✅ Browser pertama berhasil membuat localStorage.");

    console.log("💾 Saving storage state...");

    await sessionService.saveSession(firstSession);

    await sessionService.closeSession(firstSession);

    console.log("✅ Browser pertama ditutup.");

    console.log("");
    console.log("2️⃣ Starting second browser session...");

    const secondSession = await sessionService.openSavedSession(accountId);

    console.log("🌐 Opening local persistence test page again...");

    const secondResult = await secondSession.executor.open(
      `http://127.0.0.1:${PORT}`,
    );

    console.log(`📄 Second page result: ${secondResult.text}`);

    if (!secondResult.text.includes(`EXISTING:${TEST_VALUE}`)) {
      throw new Error(
        "localStorage tidak berhasil dipulihkan dari storage state.",
      );
    }

    console.log("");
    console.log("🎉 SESSION PERSISTENCE TEST BERHASIL.");
    console.log("✅ Browser pertama membuat localStorage.");
    console.log("✅ Storage state berhasil disimpan.");
    console.log("✅ Browser kedua memuat storage state.");
    console.log("✅ localStorage berhasil dipulihkan.");

    await sessionService.closeSession(secondSession);
  } finally {
    server.close();

    console.log("");
    console.log("🧹 Test server ditutup.");
  }
}

main().catch((error) => {
  console.error("");
  console.error("❌ Browser session persistence test gagal:");
  console.error(error);
  process.exit(1);
});
