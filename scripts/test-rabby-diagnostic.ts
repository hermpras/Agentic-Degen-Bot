import { WalletBrowser } from "../src/wallet/wallet-browser.js";

async function main() {
  console.log("🧪 Rabby Diagnostic");
  console.log("===================");

  const walletBrowser = new WalletBrowser();

  const browser = await walletBrowser.openForAccount(1, {
    connectOverCDPUrl: "http://127.0.0.1:9223",
    timeoutMs: 30000,
  });

  try {
    const result = await browser.evaluate(`
      (() => {
        const bodyText = document.body?.innerText ?? "";

        const elements = Array.from(
          document.querySelectorAll("*")
        )
          .map((element) => ({
            tag: element.tagName,
            text: (element.textContent ?? "").trim(),
            ariaLabel: element.getAttribute("aria-label"),
            title: element.getAttribute("title"),
          }))
          .filter((item) =>
            item.text ||
            item.ariaLabel ||
            item.title
          )
          .slice(0, 300);

        return {
          url: window.location.href,
          title: document.title,
          bodyText,
          elements,
        };
      })()
    `);

    console.log("\n📍 URL:");
    console.log(result.url);

    console.log("\n📋 TITLE:");
    console.log(result.title);

    console.log("\n📝 BODY TEXT:");
    console.log(result.bodyText);

    console.log("\n🔎 ELEMENTS:");
    console.log(JSON.stringify(result.elements, null, 2));

    console.log("\n✅ Rabby diagnostic selesai.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("\n❌ Rabby diagnostic failed:");
  console.error(error);
  process.exit(1);
});
