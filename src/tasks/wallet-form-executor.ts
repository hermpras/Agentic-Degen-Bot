import type { Page } from "playwright";
import type { BrowserExecutor } from "../browser/browser-executor.js";
import {
  FormInspector,
  type InspectedForm,
  type InspectedInteractive,
} from "./form-inspector.js";
import {
  WalletExecutor,
  type WalletVerificationResult,
} from "../wallet/wallet-executor.js";
import {
  RabbyWalletConnector,
  type RabbyConnectionResult,
} from "../wallet/rabby-wallet-connector.js";

export type WalletFormMode = "ADDRESS_INPUT" | "CONNECT_WALLET" | "UNKNOWN";

export interface WalletFormDetectionResult {
  mode: WalletFormMode;
  connectInteractive: InspectedInteractive | null;
  walletAddressField: InspectedForm["fields"][number] | null;
  reason: string;
}

export interface WalletFormExecutionContext {
  accountId: number;
  accountName: string;
  walletAddress: string;
}

export interface WalletFormExecutionResult {
  success: boolean;
  mode: WalletFormMode;
  connected: boolean;
  walletAddressFilled: boolean;
  walletVerification: WalletVerificationResult | null;
  rabbyConnection: RabbyConnectionResult | null;
  message: string;
}

export interface WalletConnectExecutionOptions {
  rabbyPopupTimeoutMs?: number;
}

export class WalletFormExecutor {
  private readonly inspector: FormInspector;
  private readonly walletExecutor: WalletExecutor;
  private readonly rabbyConnector: RabbyWalletConnector;

  constructor(
    private readonly browser: BrowserExecutor,
    walletExecutor?: WalletExecutor,
    rabbyConnector?: RabbyWalletConnector,
  ) {
    this.inspector = new FormInspector(browser);
    this.walletExecutor = walletExecutor ?? new WalletExecutor(browser);
    this.rabbyConnector = rabbyConnector ?? new RabbyWalletConnector();
  }

  async inspect(): Promise<InspectedForm> {
    return this.inspector.inspect();
  }

  detectWalletRequirement(form: InspectedForm): WalletFormDetectionResult {
    const walletAddressField = this.findWalletAddressField(form);

    const connectInteractive = this.findConnectWalletInteractive(form);

    if (connectInteractive) {
      return {
        mode: "CONNECT_WALLET",
        connectInteractive,
        walletAddressField,
        reason:
          "Ditemukan interactive element yang terlihat seperti Connect Wallet.",
      };
    }

    if (walletAddressField) {
      return {
        mode: "ADDRESS_INPUT",
        connectInteractive: null,
        walletAddressField,
        reason: "Ditemukan field yang terlihat seperti wallet address input.",
      };
    }

    return {
      mode: "UNKNOWN",
      connectInteractive: null,
      walletAddressField: null,
      reason:
        "Tidak ditemukan wallet address input atau Connect Wallet UI yang cukup jelas.",
    };
  }

  async execute(
    context: WalletFormExecutionContext,
    options: WalletConnectExecutionOptions = {},
  ): Promise<WalletFormExecutionResult> {
    const form = await this.inspect();

    const detection = this.detectWalletRequirement(form);

    console.log(`🔐 [WalletFormExecutor] Mode: ${detection.mode}`);

    console.log(`🔐 [WalletFormExecutor] ${detection.reason}`);

    if (detection.mode === "ADDRESS_INPUT") {
      return this.executeAddressInput(context, detection);
    }

    if (detection.mode === "CONNECT_WALLET") {
      return this.executeWalletConnection(context, detection, options);
    }

    return {
      success: false,
      mode: "UNKNOWN",
      connected: false,
      walletAddressFilled: false,
      walletVerification: null,
      rabbyConnection: null,
      message:
        "Wallet requirement belum bisa ditentukan dari halaman saat ini.",
    };
  }

  private async executeAddressInput(
    context: WalletFormExecutionContext,
    detection: WalletFormDetectionResult,
  ): Promise<WalletFormExecutionResult> {
    if (!detection.walletAddressField) {
      return {
        success: false,
        mode: "ADDRESS_INPUT",
        connected: false,
        walletAddressFilled: false,
        walletVerification: null,
        rabbyConnection: null,
        message:
          "Mode ADDRESS_INPUT terdeteksi tetapi field wallet tidak ditemukan.",
      };
    }

    await this.browser.fill(
      detection.walletAddressField.selector,
      context.walletAddress,
    );

    console.log(
      `🔐 [WalletFormExecutor] Wallet address Account "${context.accountName}" diisi.`,
    );

    return {
      success: true,
      mode: "ADDRESS_INPUT",
      connected: false,
      walletAddressFilled: true,
      walletVerification: null,
      rabbyConnection: null,
      message: `Wallet address Account "${context.accountName}" berhasil diisi.`,
    };
  }

  private async executeWalletConnection(
    context: WalletFormExecutionContext,
    detection: WalletFormDetectionResult,
    options: WalletConnectExecutionOptions,
  ): Promise<WalletFormExecutionResult> {
    if (!detection.connectInteractive) {
      return {
        success: false,
        mode: "CONNECT_WALLET",
        connected: false,
        walletAddressFilled: false,
        walletVerification: null,
        rabbyConnection: null,
        message:
          "Mode CONNECT_WALLET terdeteksi tetapi tombol Connect Wallet tidak ditemukan.",
      };
    }

    const page = this.browser.getActivePage();

    if (!page) {
      return {
        success: false,
        mode: "CONNECT_WALLET",
        connected: false,
        walletAddressFilled: false,
        walletVerification: null,
        rabbyConnection: null,
        message:
          "Tidak ada active browser page untuk melakukan wallet connection.",
      };
    }

    const expectedOrigin = new URL(page.url()).origin;

    console.log(
      `🔐 [WalletFormExecutor] Clicking Connect Wallet: ${
        detection.connectInteractive.text ??
        detection.connectInteractive.ariaLabel ??
        detection.connectInteractive.title ??
        "unknown"
      }`,
    );

    await this.clickInteractive(page, detection.connectInteractive);

    const popup = await this.waitForWalletPopup(
      page,
      options.rabbyPopupTimeoutMs ?? 10_000,
    );

    if (!popup) {
      return {
        success: false,
        mode: "CONNECT_WALLET",
        connected: false,
        walletAddressFilled: false,
        walletVerification: null,
        rabbyConnection: null,
        message: "Connect Wallet diklik tetapi popup Rabby tidak terdeteksi.",
      };
    }

    const rabbyResult = await this.rabbyConnector.connect(popup, {
      accountName: context.accountName,
      walletAddress: context.walletAddress,
      expectedOrigin,
    });

    console.log(`🔐 [WalletFormExecutor] Rabby: ${rabbyResult.message}`);

    if (!rabbyResult.success) {
      return {
        success: false,
        mode: "CONNECT_WALLET",
        connected: false,
        walletAddressFilled: false,
        walletVerification: null,
        rabbyConnection: rabbyResult,
        message: `Rabby connection gagal: ${rabbyResult.message}`,
      };
    }

    const walletVerification = await this.walletExecutor.verifyActiveWallet({
      accountId: context.accountId,
      accountName: context.accountName,
      walletAddress: context.walletAddress,
    });

    console.log(
      `🔐 [WalletFormExecutor] Verification: ${walletVerification.message}`,
    );

    if (!walletVerification.success) {
      return {
        success: false,
        mode: "CONNECT_WALLET",
        connected: true,
        walletAddressFilled: false,
        walletVerification,
        rabbyConnection: rabbyResult,
        message: `Rabby berhasil connect tetapi wallet verification gagal: ${walletVerification.message}`,
      };
    }

    return {
      success: true,
      mode: "CONNECT_WALLET",
      connected: true,
      walletAddressFilled: false,
      walletVerification,
      rabbyConnection: rabbyResult,
      message: `Wallet Account "${context.accountName}" berhasil terhubung melalui Rabby dan wallet terverifikasi.`,
    };
  }

  private async clickInteractive(
    page: Page,
    interactive: InspectedInteractive,
  ): Promise<void> {
    if (interactive.ariaLabel) {
      const locator = page.getByRole("button", {
        name: interactive.ariaLabel,
      });

      if ((await locator.count()) === 1) {
        await locator.click();
        return;
      }
    }

    if (interactive.text) {
      const exactText = interactive.text.trim();

      const locator = page.getByText(exactText, {
        exact: true,
      });

      if ((await locator.count()) === 1) {
        await locator.click();
        return;
      }
    }

    if (interactive.title) {
      const locator = page.locator(
        `[title="${this.escapeAttribute(interactive.title)}"]`,
      );

      if ((await locator.count()) === 1) {
        await locator.click();
        return;
      }
    }

    await page.locator(interactive.selector).first().click();
  }

  private async waitForWalletPopup(
    page: Page,
    timeoutMs: number,
  ): Promise<Page | null> {
    const existingPages = this.browser.getOpenPages();

    const existingSet = new Set(existingPages);

    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const pages = this.browser.getOpenPages();

      for (const candidate of pages) {
        if (existingSet.has(candidate)) {
          continue;
        }

        const url = candidate.url();

        if (url.startsWith("chrome-extension://")) {
          return candidate;
        }
      }

      await page.waitForTimeout(250);
    }

    return null;
  }

  private findWalletAddressField(
    form: InspectedForm,
  ): InspectedForm["fields"][number] | null {
    const candidates = form.fields.filter((field) => {
      const haystack = [
        field.label,
        field.name,
        field.id,
        field.placeholder,
        field.ariaLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        haystack.includes("wallet") ||
        haystack.includes("address") ||
        haystack.includes("eth address") ||
        haystack.includes("ethereum address")
      );
    });

    return candidates[0] ?? null;
  }

  private findConnectWalletInteractive(
    form: InspectedForm,
  ): InspectedInteractive | null {
    const candidates = form.interactives.filter((interactive) => {
      const haystack = [
        interactive.text,
        interactive.ariaLabel,
        interactive.title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        haystack.includes("connect wallet") ||
        (haystack.includes("connect") && haystack.includes("wallet")) ||
        haystack.includes("connect rabby") ||
        haystack.includes("rabby wallet") ||
        haystack.includes("link wallet") ||
        haystack.includes("wallet connect")
      );
    });

    return candidates[0] ?? null;
  }

  private escapeAttribute(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }
}
