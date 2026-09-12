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
    console.log("WALLET PROVIDER");
    console.log("==============================");

    const providerState = await page.evaluate(async () => {
      const ethereum = (
        window as typeof window & {
          ethereum?: {
            selectedAddress?: string | null;
            chainId?: string;
            isConnected?: () => boolean;
            request?: (args: { method: string }) => Promise<unknown>;
          };
        }
      ).ethereum;

      if (!ethereum) {
        return {
          exists: false,
          selectedAddress: null,
          chainId: null,
          isConnected: null,
          accounts: null,
          error: null,
        };
      }

      let accounts: unknown = null;
      let error: string | null = null;

      try {
        if (ethereum.request) {
          accounts = await ethereum.request({
            method: "eth_accounts",
          });
        }
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }

      let isConnected: boolean | null = null;

      try {
        isConnected =
          typeof ethereum.isConnected === "function"
            ? ethereum.isConnected()
            : null;
      } catch {
        isConnected = null;
      }

      return {
        exists: true,
        selectedAddress: ethereum.selectedAddress ?? null,
        chainId: ethereum.chainId ?? null,
        isConnected,
        accounts,
        error,
      };
    });

    console.log(JSON.stringify(providerState, null, 2));

    console.log("\n==============================");
    console.log("MOTIF STORAGE STATE");
    console.log("==============================");

    const storageState = await page.evaluate(() => ({
      localStorage: {
        connectionStatus: localStorage.getItem("@appkit/connection_status"),

        activeNamespace: localStorage.getItem("@appkit/active_namespace"),

        activeCaipNetwork: localStorage.getItem(
          "@appkit/active_caip_network_id",
        ),

        recentConnector: localStorage.getItem("wagmi.recentConnectorId"),

        wagmiStore: localStorage.getItem("wagmi.store"),
      },

      sessionStorage: {
        walletTrip: sessionStorage.getItem("motif.walletTrip"),

        sessionId: sessionStorage.getItem("motif.sid"),
      },
    }));

    console.log(JSON.stringify(storageState, null, 2));

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
