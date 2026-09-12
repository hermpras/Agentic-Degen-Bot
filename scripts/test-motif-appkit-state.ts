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

    const page = browser.getActivePage();

    console.log("🌐 Motif terbuka.");
    console.log("👆 Lakukan Connect wallet → Rabby → Connect.");
    console.log("⏳ Setelah selesai, tekan ENTER.");

    await waitForEnter();

    console.log("\n==============================");
    console.log("1. WINDOW PROVIDERS");
    console.log("==============================");

    const providerState = await page.evaluate(async () => {
      const win = window as typeof window & {
        ethereum?: unknown;
        WagmiProvider?: unknown;
        __WALLETCONNECT_MODAL__?: unknown;
        __APPKIT__?: unknown;
      };

      const ethereum = win.ethereum as
        | {
            selectedAddress?: string | null;
            chainId?: string;
            isConnected?: () => boolean;
            request?: (args: { method: string }) => Promise<unknown>;
          }
        | undefined;

      let accounts: unknown = null;
      let error: string | null = null;

      try {
        accounts = await ethereum?.request?.({
          method: "eth_accounts",
        });
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }

      return {
        ethereumExists: Boolean(ethereum),
        selectedAddress: ethereum?.selectedAddress ?? null,
        chainId: ethereum?.chainId ?? null,
        isConnected:
          typeof ethereum?.isConnected === "function"
            ? ethereum.isConnected()
            : null,
        accounts,
        error,
        globalKeys: Object.keys(window)
          .filter((key) => /appkit|wagmi|wallet|web3|reown|modal/i.test(key))
          .sort(),
      };
    });

    console.log(JSON.stringify(providerState, null, 2));

    console.log("\n==============================");
    console.log("2. MOTIF DOM STATE");
    console.log("==============================");

    const motifDom = await page.evaluate(() => {
      const bodyText = document.body?.innerText ?? "";

      const walletField = Array.from(
        document.querySelectorAll("div, section, form"),
      ).find((element) => {
        const text = element.textContent ?? "";

        return (
          /No wallet connected/i.test(text) ||
          /Connect the wallet you want to mint with/i.test(text)
        );
      });

      const buttons = Array.from(document.querySelectorAll("button")).map(
        (button) => ({
          text: button.textContent?.trim() ?? "",
          disabled: (button as HTMLButtonElement).disabled,
          className: button.className,
        }),
      );

      return {
        bodyText: bodyText.slice(0, 8000),
        walletField: walletField?.outerHTML.slice(0, 5000) ?? null,
        buttons,
      };
    });

    console.log(JSON.stringify(motifDom, null, 2));

    console.log("\n==============================");
    console.log("3. REACT ROOTS");
    console.log("==============================");

    const reactState = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll("*"));

      const reactKeys = new Set<string>();

      for (const element of elements) {
        for (const key of Object.keys(element)) {
          if (
            key.startsWith("__reactFiber$") ||
            key.startsWith("__reactProps$")
          ) {
            reactKeys.add(key);
          }
        }
      }

      return {
        reactKeys: Array.from(reactKeys),
        reactRootCount: document.querySelectorAll("[data-reactroot]").length,
        nextRoot: document.getElementById("__next") !== null,
      };
    });

    console.log(JSON.stringify(reactState, null, 2));

    console.log("\n==============================");
    console.log("4. STORAGE");
    console.log("==============================");

    const storage = await page.evaluate(() => ({
      localStorage: Object.fromEntries(
        Object.entries(localStorage).filter(([key]) =>
          /wallet|wagmi|appkit|reown|connection|motif/i.test(key),
        ),
      ),
      sessionStorage: Object.fromEntries(
        Object.entries(sessionStorage).filter(([key]) =>
          /wallet|wagmi|appkit|reown|connection|motif/i.test(key),
        ),
      ),
    }));

    console.log(JSON.stringify(storage, null, 2));

    console.log("\n==============================");
    console.log("5. PERFORMANCE RESOURCE HINTS");
    console.log("==============================");

    const resources = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((url) =>
          /wagmi|appkit|reown|walletconnect|wallet|motif/i.test(url),
        )
        .slice(-100),
    );

    console.log(JSON.stringify(resources, null, 2));

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
