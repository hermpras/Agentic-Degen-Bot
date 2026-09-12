import { Page } from "playwright";

export interface RabbyConnectionRequest {
  accountName: string;
  walletAddress: string;
  expectedOrigin: string;
}

export interface RabbyConnectionResult {
  success: boolean;
  connected: boolean;
  origin: string | null;
  accountName: string | null;
  message: string;
}

export class RabbyWalletConnector {
  async inspectApproval(
    page: Page,
    request: RabbyConnectionRequest,
  ): Promise<RabbyConnectionResult> {
    const url = page.url();

    if (!url.startsWith("chrome-extension://")) {
      return {
        success: false,
        connected: false,
        origin: null,
        accountName: null,
        message: "Page bukan Rabby extension.",
      };
    }

    const bodyText = await this.getBodyText(page);

    console.log("\n🦊 Rabby popup body:");
    console.log(bodyText.slice(0, 5000));

    if (this.isAlertReminder(bodyText)) {
      console.log("⚠️ Rabby alert reminder terdeteksi.");

      const handled = await this.ignoreAllAlerts(page);

      if (!handled) {
        return {
          success: false,
          connected: false,
          origin: null,
          accountName: null,
          message:
            "Rabby meminta proses alert/reminder, tetapi tombol Ignore All tidak ditemukan secara unik.",
        };
      }

      console.log("✅ Rabby alert reminder berhasil di-ignore.");

      await page.waitForTimeout(1000);
    }

    return this.inspectConnectApproval(page, request);
  }

  async connect(
    page: Page,
    request: RabbyConnectionRequest,
  ): Promise<RabbyConnectionResult> {
    const inspection = await this.inspectApproval(page, request);

    if (!inspection.success) {
      return inspection;
    }

    const connectButton = page.getByRole("button", {
      name: /^Connect$/i,
    });

    if ((await connectButton.count()) !== 1) {
      return {
        success: false,
        connected: false,
        origin: inspection.origin,
        accountName: inspection.accountName,
        message: "Rabby Connect button tidak ditemukan secara unik.",
      };
    }

    console.log("🟢 Rabby Connect button ditemukan.");
    console.log("🖱️ Klik Connect...");

    await connectButton.click();

    return {
      success: true,
      connected: true,
      origin: inspection.origin,
      accountName: inspection.accountName,
      message: "Rabby Connect berhasil diklik.",
    };
  }

  private async inspectConnectApproval(
    page: Page,
    request: RabbyConnectionRequest,
  ): Promise<RabbyConnectionResult> {
    const bodyText = await this.getBodyText(page);

    if (!/Connect to Dapp/i.test(bodyText)) {
      return {
        success: false,
        connected: false,
        origin: null,
        accountName: null,
        message: "Rabby belum berada di approval Connect to Dapp.",
      };
    }

    const originMatch = bodyText.match(/https?:\/\/[^\s]+/i);
    const origin = originMatch?.[0] ?? null;

    if (!origin || !this.sameOrigin(origin, request.expectedOrigin)) {
      return {
        success: false,
        connected: false,
        origin,
        accountName: null,
        message: `Origin Rabby tidak cocok. Expected: ${request.expectedOrigin}`,
      };
    }

    const accountName = this.extractAccountName(bodyText);

    if (
      !accountName ||
      accountName.toLowerCase() !== request.accountName.toLowerCase()
    ) {
      return {
        success: false,
        connected: false,
        origin,
        accountName,
        message: `Account Rabby tidak cocok. Expected: ${request.accountName}`,
      };
    }

    return {
      success: true,
      connected: false,
      origin,
      accountName,
      message: "Rabby approval cocok dengan website dan account yang diminta.",
    };
  }

  private async ignoreAllAlerts(page: Page): Promise<boolean> {
    const candidates = [
      page.getByRole("button", {
        name: /^Ignore All$/i,
      }),
      page.getByText(/^Ignore All$/i),
    ];

    for (const candidate of candidates) {
      const count = await candidate.count();

      if (count === 1) {
        console.log("🔘 Ignore All ditemukan.");

        await candidate.click();

        return true;
      }
    }

    return false;
  }

  private isAlertReminder(text: string): boolean {
    return (
      /Please process the alert before signing/i.test(text) ||
      /process the alert before signing/i.test(text)
    );
  }

  private async getBodyText(page: Page): Promise<string> {
    return page
      .locator("body")
      .innerText()
      .catch(() => "");
  }

  private extractAccountName(text: string): string | null {
    const match = text.match(/Connect Address\s+([^\n]+)/i);

    return match?.[1]?.trim() ?? null;
  }

  private sameOrigin(actual: string, expected: string): boolean {
    try {
      const actualUrl = new URL(actual);
      const expectedUrl = new URL(expected);

      return (
        actualUrl.origin.toLowerCase() === expectedUrl.origin.toLowerCase()
      );
    } catch {
      return false;
    }
  }
}
