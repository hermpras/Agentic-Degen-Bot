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
    console.log(
      "👆 Sekarang lakukan Connect Wallet → Rabby → Connect secara manual.",
    );
    console.log("⏳ Setelah selesai, tekan ENTER di terminal ini.");

    await waitForEnter();

    const page = browser.getActivePage();

    console.log("\n==============================");
    console.log("CURRENT URL");
    console.log("==============================");
    console.log(await page.url());

    console.log("\n==============================");
    console.log("BODY TEXT");
    console.log("==============================");

    const bodyText = await page
      .locator("body")
      .innerText()
      .catch(() => "");

    console.log(bodyText.slice(0, 10000));

    console.log("\n==============================");
    console.log("WALLET-RELATED DOM");
    console.log("==============================");

    const walletDom = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll("*"));

      return elements
        .map((element) => {
          const text = element.textContent?.trim() ?? "";

          const attributes = Array.from(element.attributes).map(
            (attribute) => ({
              name: attribute.name,
              value: attribute.value,
            }),
          );

          const relevantText =
            /connected|disconnect|wallet|0x[a-f0-9]{4,}/i.test(text);

          const relevantAttributes = attributes.some((attribute) =>
            /wallet|address|account|connect|disconnect|0x/i.test(
              `${attribute.name} ${attribute.value}`,
            ),
          );

          if (!relevantText && !relevantAttributes) {
            return null;
          }

          return {
            tag: element.tagName,
            text: text.slice(0, 500),
            attributes,
            outerHTML: element.outerHTML.slice(0, 3000),
          };
        })
        .filter(Boolean)
        .slice(0, 100);
    });

    console.log(JSON.stringify(walletDom, null, 2));

    console.log("\n==============================");
    console.log("WINDOW / LOCAL STORAGE CHECK");
    console.log("==============================");

    const browserState = await page.evaluate(() => {
      return {
        localStorage: Object.fromEntries(Object.entries(localStorage)),
        sessionStorage: Object.fromEntries(Object.entries(sessionStorage)),
      };
    });

    console.log(JSON.stringify(browserState, null, 2));

    console.log("\n==============================");
    console.log("DONE");
    console.log("==============================");
  } finally {
    await browser.close();
  }
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.resume();

    process.stdin.once("data", () => {
      resolve();
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
