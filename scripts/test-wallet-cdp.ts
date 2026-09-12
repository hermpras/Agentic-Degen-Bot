import { BrowserExecutor } from "../src/browser/browser-executor.js";

async function main() {
  console.log("🧪 Wallet CDP Test");
  console.log("==================");

  const browser = new BrowserExecutor({
    headless: false,
    connectOverCDPUrl: "http://127.0.0.1:9223",
    timeoutMs: 30000,
  });

  try {
    await browser.start();

    console.log("\n🌐 Browser connected via CDP.");

    const result = await browser.evaluate(`
      (() => ({
        url: window.location.href,
        title: document.title,
        userAgent: navigator.userAgent,
      }))()
    `);

    console.log("\n📋 Current browser:");
    console.log(JSON.stringify(result, null, 2));

    const pages = await browser.evaluate(`
      Array.from(document.querySelectorAll("body")).map(() => ({
        bodyPresent: true
      }))
    `);

    console.log("\n📄 Page check:");
    console.log(JSON.stringify(pages, null, 2));

    console.log("\n✅ Wallet CDP test PASS.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("\n❌ Wallet CDP test failed:");
  console.error(error);
  process.exit(1);
});
