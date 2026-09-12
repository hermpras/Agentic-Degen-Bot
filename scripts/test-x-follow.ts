import { AccountBrowser } from "../src/browser/account-browser.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const accountId = Number(process.argv[2]);

  if (!Number.isInteger(accountId) || accountId <= 0) {
    console.error("Usage: npx tsx scripts/test-x-follow.ts <accountId>");
    process.exit(1);
  }

  const targetUrl = "https://x.com/arcwargg";

  const accountBrowser = new AccountBrowser(undefined, {
    headless: true,
  });

  try {
    console.log("========================================");
    console.log("ARCWAR FOLLOW BUTTON DIAGNOSTIC");
    console.log("========================================");
    console.log(`Account : ${accountId}`);
    console.log(`Target  : ${targetUrl}`);
    console.log("");

    const browser = await accountBrowser.openForAccount(accountId);

    await browser.open(targetUrl);

    console.log("Waiting 8 seconds for X to render...");
    await sleep(8000);

    const buttons = await browser.evaluate(`
      (() => {
        return Array.from(document.querySelectorAll('button'))
          .map((button, index) => ({
            index,
            text: (
              button.innerText ||
              button.textContent ||
              ''
            ).trim(),
            ariaLabel: button.getAttribute('aria-label'),
            dataTestId: button.getAttribute('data-testid'),
            role: button.getAttribute('role'),
            title: button.getAttribute('title'),
            html: button.outerHTML.slice(0, 1500)
          }))
          .filter((button) => {
            const text = (button.text || '').trim().toLowerCase();
            const aria = (button.ariaLabel || '').toLowerCase();
            const testid = (button.dataTestId || '').toLowerCase();

            return (
              text === 'follow' ||
              text === 'following' ||
              aria.includes('follow') ||
              testid.includes('follow')
            );
          });
      })()
    `);

    console.log("");
    console.log("========================================");
    console.log("ALL X FOLLOW BUTTONS");
    console.log("========================================");

    console.log(JSON.stringify(buttons, null, 2));

    console.log("");
    console.log("========================================");
    console.log("DONE");
    console.log("========================================");
  } catch (error) {
    console.error("");
    console.error("DIAGNOSTIC FAILED:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await accountBrowser.close();
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
