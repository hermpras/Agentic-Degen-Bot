import "dotenv/config";

import { BrowserExecutor } from "../src/browser/browser-executor.js";

async function main(): Promise<void> {
  const browser = new BrowserExecutor({
    headless: false,
    timeoutMs: 30000,
    connectOverCDPUrl: "http://127.0.0.1:9223",
  });

  try {
    await browser.start();

    console.log("📄 Open pages:");

    for (const [index, page] of browser
      .getOpenPages()
      .entries()) {
      console.log(
        `${index}: ${page.url()}`
      );
    }

    console.log(
      "\n✅ Browser popup/page detection siap."
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});