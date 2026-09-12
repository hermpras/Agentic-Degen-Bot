import { BrowserExecutor } from "../browser/browser-executor.js";

export interface WalletExecutionContext {
  accountId: number;
  accountName: string;
  walletAddress: string | null;
}

export interface WalletConnectionResult {
  success: boolean;
  connected: boolean;
  walletAddress: string | null;
  message: string;
}

export class WalletExecutor {
  constructor(private readonly browser: BrowserExecutor) {}

  async inspectConnection(
    context: WalletExecutionContext,
  ): Promise<WalletConnectionResult> {
    if (!context.walletAddress) {
      return {
        success: false,
        connected: false,
        walletAddress: null,
        message: `Account "${context.accountName}" belum memiliki wallet address.`,
      };
    }

    const page = await this.browser.getPageResult();

    const normalizedPageText = page.text.toLowerCase();
    const normalizedWallet = context.walletAddress.toLowerCase();

    /*
     * Generic verification:
     *
     * Kita belum menganggap wallet connected hanya karena
     * tombol "Connect Wallet" hilang.
     *
     * Yang kita cari adalah evidence bahwa website benar-benar
     * menampilkan / mengenali wallet address milik account.
     */
    const shortWallet = normalizedWallet.slice(0, 6);

    const walletVisible =
      normalizedPageText.includes(normalizedWallet) ||
      normalizedPageText.includes(shortWallet);

    if (walletVisible) {
      return {
        success: true,
        connected: true,
        walletAddress: context.walletAddress,
        message: "Website menampilkan evidence bahwa wallet account terhubung.",
      };
    }

    const connectButtonVisible =
      /\bconnect wallet\b/i.test(page.text) ||
      /\bconnect\b.*\bwallet\b/i.test(page.text);

    if (connectButtonVisible) {
      return {
        success: true,
        connected: false,
        walletAddress: context.walletAddress,
        message: "Website masih meminta wallet connection.",
      };
    }

    return {
      success: true,
      connected: false,
      walletAddress: context.walletAddress,
      message:
        "Belum ditemukan evidence yang cukup untuk memastikan wallet terhubung.",
    };
  }
}
