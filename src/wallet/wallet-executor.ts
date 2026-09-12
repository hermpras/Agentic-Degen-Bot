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

export interface WalletVerificationResult {
  success: boolean;
  matchesExpected: boolean;
  expectedWalletAddress: string | null;
  detectedWalletAddress: string | null;
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

    const fullWalletVisible = normalizedPageText.includes(normalizedWallet);

    const shortenedWalletVisible = this.matchesShortWallet(
      normalizedPageText,
      normalizedWallet,
    );

    if (fullWalletVisible || shortenedWalletVisible) {
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

  async verifyActiveWallet(
    context: WalletExecutionContext,
  ): Promise<WalletVerificationResult> {
    if (!context.walletAddress) {
      return {
        success: false,
        matchesExpected: false,
        expectedWalletAddress: null,
        detectedWalletAddress: null,
        message: `Account "${context.accountName}" belum memiliki wallet address.`,
      };
    }

    const page = await this.browser.getPageResult();

    const expected = context.walletAddress.toLowerCase();

    const detected = this.extractWalletAddress(page.text, expected);

    if (!detected) {
      return {
        success: false,
        matchesExpected: false,
        expectedWalletAddress: context.walletAddress,
        detectedWalletAddress: null,
        message:
          "Tidak ditemukan wallet address yang dapat diverifikasi dari Rabby.",
      };
    }

    const matchesExpected =
      detected.toLowerCase() === expected ||
      this.matchesShortWallet(detected.toLowerCase(), expected);

    if (!matchesExpected) {
      return {
        success: false,
        matchesExpected: false,
        expectedWalletAddress: context.walletAddress,
        detectedWalletAddress: detected,
        message: "Wallet aktif di Rabby berbeda dengan wallet Account.",
      };
    }

    return {
      success: true,
      matchesExpected: true,
      expectedWalletAddress: context.walletAddress,
      detectedWalletAddress: detected,
      message: "Wallet aktif di Rabby cocok dengan wallet Account.",
    };
  }

  private extractWalletAddress(
    text: string,
    expectedWallet: string,
  ): string | null {
    const fullMatch = text.match(/0x[a-fA-F0-9]{40}/);

    if (fullMatch) {
      return fullMatch[0];
    }

    const expectedShort = this.getShortWallet(expectedWallet);

    const escapedShort = this.escapeRegExp(expectedShort);

    const shortMatch = text.match(new RegExp(escapedShort, "i"));

    if (shortMatch) {
      return expectedShort;
    }

    return null;
  }

  private matchesShortWallet(text: string, walletAddress: string): boolean {
    const shortWallet = this.getShortWallet(walletAddress);

    return text.includes(shortWallet);
  }

  private getShortWallet(walletAddress: string): string {
    const normalized = walletAddress.toLowerCase();

    return normalized.slice(0, 8) + "..." + normalized.slice(-6);
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
