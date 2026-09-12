import { BrowserExecutor } from "../src/browser/browser-executor.js";

async function main(): Promise<void> {
  const browser = new BrowserExecutor({
    headless: false,
    timeoutMs: 30000,
    connectOverCDPUrl: "http://127.0.0.1:9223",
  });

  try {
    await browser.start();

    await browser.open("https://themotif.art/ensemble#/ensemble");

    console.log("🌐 Motif terbuka.");

    console.log("👆 Klik Connect Wallet → Rabby.");

    const newPagePromise = browser.waitForNewPage(30000);

    const newPage = await newPagePromise;

    if (!newPage) {
      console.log("❌ Tidak ada page baru.");
      return;
    }

    console.log("\n🆕 Rabby page terdeteksi!");

    await newPage.waitForLoadState("domcontentloaded").catch(() => {});

    await newPage.waitForTimeout(1000);

    console.log("URL:", newPage.url());

    console.log("Title:", await newPage.title());

    const bodyText = await newPage
      .locator("body")
      .innerText()
      .catch(() => "");

    console.log("\n📄 BODY TEXT:");

    console.log(bodyText || "(empty)");

    const buttons = await newPage
      .locator("button")
      .allInnerTexts()
      .catch(() => []);

    console.log("\n🔘 BUTTONS:");

    console.log(buttons);

    const links = await newPage
      .locator("a")
      .allInnerTexts()
      .catch(() => []);

    console.log("\n🔗 LINKS:");

    console.log(links);

    const inputs = await newPage
      .locator("input")
      .evaluateAll((elements) =>
        elements.map((element) => ({
          type: element.getAttribute("type"),
          placeholder: element.getAttribute("placeholder"),
          ariaLabel: element.getAttribute("aria-label"),
        })),
      )
      .catch(() => []);

    console.log("\n⌨️ INPUTS:");

    console.log(inputs);

    console.log("\n🌳 HTML SAMPLE:");

    const html = await newPage
      .locator("body")
      .innerHTML()
      .catch(() => "");

    console.log(html.slice(0, 10000));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
