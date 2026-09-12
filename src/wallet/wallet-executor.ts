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
  constructor(
    private readonly browser: BrowserExecutor,
  ) {}

  async inspectConnection(
    context: WalletExecutionContext,
  ): Promise<WalletConnectionResult> {
    if (!context.walletAddress) {
      return {
        success: false,
        connected: false,
        walletAddress: null,
        message:
          `Account "${context.accountName}" belum memiliki wallet address.`,
      };
    }

    const page = await this.browser.getPageResult();

    const detectedWallet =
      this.extractWalletAddress(
        page.text,
        context.walletAddress,
      );

    if (detectedWallet) {
      return {
        success: true,
        connected: true,
        walletAddress: detectedWallet,
        message:
          `Wallet ${detectedWallet} terlihat pada halaman.`,
      };
    }

    const shortWallet =
      this.getShortWallet(
        context.walletAddress,
      );

    const normalizedPageText =
      page.text.toLowerCase();

    if (
      normalizedPageText.includes(
        shortWallet.toLowerCase(),
      )
    ) {
      return {
        success: true,
        connected: true,
        walletAddress:
          context.walletAddress,
        message:
          `Wallet ${shortWallet} terlihat pada halaman.`,
      };
    }

    if (
      /disconnect wallet/i.test(page.text) &&
      /connected/i.test(page.text)
    ) {
      return {
        success: true,
        connected: true,
        walletAddress:
          context.walletAddress,
        message:
          `Halaman menunjukkan wallet terhubung dan menyediakan aksi Disconnect wallet.`,
      };
    }

    if (
      /connect wallet/i.test(page.text) ||
      /connect/i.test(page.text)
    ) {
      return {
        success: true,
        connected: false,
        walletAddress: null,
        message:
          `Halaman masih menunjukkan opsi Connect Wallet.`,
      };
    }

    return {
      success: false,
      connected: false,
      walletAddress: null,
      message:
        `Tidak cukup bukti untuk menentukan status koneksi wallet.`,
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
        message:
          `Account "${context.accountName}" belum memiliki wallet address.`,
      };
    }

    const expected =
      context.walletAddress.toLowerCase();

    const page =
      await this.browser.getPageResult();

    console.log(
      "🔎 Wallet verification page:",
      page.url,
    );

    console.log(
      "🔎 Wallet verification text:",
      page.text.slice(0, 2000),
    );

    const detected =
      this.extractWalletAddress(
        page.text,
        context.walletAddress,
      );

    if (!detected) {
      const connectedEvidence =
        this.hasConnectedWalletEvidence(
          page.text,
          context.walletAddress,
        );

      if (connectedEvidence) {
        return {
          success: true,
          matchesExpected: true,
          expectedWalletAddress:
            context.walletAddress,
          detectedWalletAddress:
            context.walletAddress,
          message:
            `Halaman menunjukkan wallet Account "${context.accountName}" terhubung dengan address yang sesuai.`,
        };
      }

      return {
        success: false,
        matchesExpected: false,
        expectedWalletAddress:
          context.walletAddress,
        detectedWalletAddress: null,
        message:
          `Tidak menemukan wallet address pada halaman aktif.`,
      };
    }

    const matchesExpected =
      detected.toLowerCase() === expected ||
      this.walletRepresentationsMatch(
        detected,
        context.walletAddress,
      );

    if (!matchesExpected) {
      return {
        success: false,
        matchesExpected: false,
        expectedWalletAddress:
          context.walletAddress,
        detectedWalletAddress: detected,
        message:
          `Wallet aktif ${detected} tidak cocok dengan wallet Account "${context.accountName}" (${context.walletAddress}).`,
      };
    }

    return {
      success: true,
      matchesExpected: true,
      expectedWalletAddress:
        context.walletAddress,
      detectedWalletAddress: detected,
      message:
        `Wallet aktif ${detected} cocok dengan wallet Account "${context.accountName}".`,
    };
  }

  private hasConnectedWalletEvidence(
    pageText: string,
    expectedWalletAddress: string,
  ): boolean {
    const normalized =
      pageText.toLowerCase();

    const expectedShort =
      this.getShortWallet(
        expectedWalletAddress,
      );

    if (
      normalized.includes(
        expectedShort.toLowerCase(),
      )
    ) {
      return true;
    }

    const uiShort =
      this.getUiShortWallet(
        expectedWalletAddress,
      );

    if (
      normalized.includes(
        uiShort.toLowerCase(),
      )
    ) {
      return true;
    }

    const hasConnected =
      /connected\s+0x[0-9a-f]{4,6}/i.test(
        pageText,
      );

    const hasDisconnect =
      /disconnect wallet/i.test(pageText);

    return hasConnected && hasDisconnect;
  }

  private extractWalletAddress(
    text: string,
    expectedWalletAddress: string,
  ): string | null {
    const fullAddress =
      text.match(
        /0x[a-fA-F0-9]{40}/,
      );

    if (fullAddress) {
      return fullAddress[0];
    }

    const normalizedExpected =
      expectedWalletAddress.toLowerCase();

    const shortExpected =
      this.getShortWallet(
        expectedWalletAddress,
      ).toLowerCase();

    const uiShortExpected =
      this.getUiShortWallet(
        expectedWalletAddress,
      ).toLowerCase();

    const normalizedText =
      text.toLowerCase();

    if (
      normalizedText.includes(
        shortExpected,
      )
    ) {
      return shortExpected;
    }

    if (
      normalizedText.includes(
        uiShortExpected,
      )
    ) {
      return uiShortExpected;
    }

    const first4 =
      normalizedExpected.slice(2, 6);

    const last4 =
      normalizedExpected.slice(-4);

    const first6 =
      normalizedExpected.slice(2, 8);

    const last6 =
      normalizedExpected.slice(-6);

    const first4Last4 =
      new RegExp(
        `0x${first4}.{0,3}${last4}`,
        "i",
      );

    const first6Last6 =
      new RegExp(
        `0x${first6}.{0,3}${last6}`,
        "i",
      );

    if (first4Last4.test(text)) {
      return `0x${first4}…${last4}`;
    }

    if (first6Last6.test(text)) {
      return `0x${first6}…${last6}`;
    }

    return null;
  }

  private walletRepresentationsMatch(
    detectedWallet: string,
    expectedWallet: string,
  ): boolean {
    const detected =
      detectedWallet
        .toLowerCase()
        .replace(/0x/, "")
        .replace(/[.…]/g, "");

    const expected =
      expectedWallet
        .toLowerCase()
        .replace(/0x/, "");

    if (detected === expected) {
      return true;
    }

    if (
      detected.length >= 8 &&
      expected.startsWith(
        detected.slice(0, 4),
      ) &&
      expected.endsWith(
        detected.slice(-4),
      )
    ) {
      return true;
    }

    return false;
  }

  private getShortWallet(
    walletAddress: string,
  ): string {
    const normalized =
      walletAddress.toLowerCase();

    return `${normalized.slice(
      0,
      8,
    )}...${normalized.slice(-6)}`;
  }

  private getUiShortWallet(
    walletAddress: string,
  ): string {
    const normalized =
      walletAddress.toLowerCase();

    return `0x${normalized.slice(
      2,
      6,
    )}…${normalized.slice(-4)}`;
  }
}