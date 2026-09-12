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

    let bodyText = await this.waitForBodyText(page);

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

      bodyText = await this.waitForBodyText(page);
    }

    const selectedAccount = await this.ensureCorrectAccountSelected(
      page,
      request,
      bodyText,
    );

    if (!selectedAccount.success) {
      return selectedAccount;
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

    console.log("⏳ Menunggu Rabby Connect button siap...");

    const connectButton = page.getByRole("button", {
      name: /^Connect$/i,
    });

    const buttonReady = await this.waitForConnectButton(connectButton, 10000);

    if (!buttonReady) {
      return {
        success: false,
        connected: false,
        origin: inspection.origin,
        accountName: inspection.accountName,
        message:
          "Rabby Connect button ditemukan tetapi tidak menjadi clickable dalam 10 detik.",
      };
    }

    console.log("🟢 Rabby Connect button siap.");

    console.log("🖱️ Klik Connect...");

    try {
      await connectButton.click({
        timeout: 5000,
      });

      console.log("✅ Rabby Connect button berhasil diklik.");

      return {
        success: true,
        connected: true,
        origin: inspection.origin,
        accountName: inspection.accountName,
        message: "Rabby Connect berhasil diklik.",
      };
    } catch (error) {
      /*
       * Rabby biasanya menutup notification popup
       * segera setelah Connect diproses.
       *
       * Playwright dapat melempar error karena target
       * page sudah closed sebelum click() selesai.
       *
       * Kalau page memang sudah closed, treat sebagai
       * expected successful handoff dan biarkan
       * WalletExecutor memverifikasi website.
       */
      const pageClosed = await this.isPageClosed(page);

      if (pageClosed) {
        console.log("🦊 Rabby popup tertutup setelah Connect.");

        console.log(
          "✅ Menganggap Connect berhasil diproses. Website akan diverifikasi.",
        );

        return {
          success: true,
          connected: true,
          origin: inspection.origin,
          accountName: inspection.accountName,
          message:
            "Rabby popup tertutup setelah Connect; koneksi akan diverifikasi pada website.",
        };
      }

      console.log("⚠️ Normal click gagal, mencoba force click...");

      try {
        await connectButton.click({
          force: true,
          timeout: 5000,
        });

        console.log("✅ Rabby Connect berhasil melalui force click.");

        return {
          success: true,
          connected: true,
          origin: inspection.origin,
          accountName: inspection.accountName,
          message: "Rabby Connect berhasil diklik melalui force click.",
        };
      } catch (forceError) {
        const closedAfterForce = await this.isPageClosed(page);

        if (closedAfterForce) {
          console.log("🦊 Rabby popup tertutup setelah Connect.");

          return {
            success: true,
            connected: true,
            origin: inspection.origin,
            accountName: inspection.accountName,
            message:
              "Rabby popup tertutup setelah Connect; koneksi akan diverifikasi pada website.",
          };
        }

        return {
          success: false,
          connected: false,
          origin: inspection.origin,
          accountName: inspection.accountName,
          message: `Gagal klik Rabby Connect button: ${
            forceError instanceof Error
              ? forceError.message
              : String(forceError)
          }`,
        };
      }
    }
  }

  private async ensureCorrectAccountSelected(
    page: Page,
    request: RabbyConnectionRequest,
    initialBodyText: string,
  ): Promise<RabbyConnectionResult> {
    const accountNameRegex = new RegExp(
      this.escapeRegex(request.accountName),
      "i",
    );

    if (accountNameRegex.test(initialBodyText)) {
      console.log(
        `👤 Account "${request.accountName}" sudah terlihat di Rabby.`,
      );

      return {
        success: true,
        connected: false,
        origin: null,
        accountName: request.accountName,
        message: "Account Rabby sudah terpilih.",
      };
    }

    const selectAddress = page.getByText(/^Select Address$/i);

    const selectCount = await selectAddress.count();

    if (selectCount !== 1) {
      const currentText = await this.waitForBodyText(page);

      if (accountNameRegex.test(currentText)) {
        return {
          success: true,
          connected: false,
          origin: null,
          accountName: request.accountName,
          message: "Account Rabby sudah terpilih.",
        };
      }

      return {
        success: false,
        connected: false,
        origin: null,
        accountName: null,
        message: `Rabby tidak menampilkan account "${request.accountName}" dan selector "Select Address" tidak ditemukan secara unik.`,
      };
    }

    const visible = await selectAddress.isVisible().catch(() => false);

    if (!visible) {
      return {
        success: false,
        connected: false,
        origin: null,
        accountName: null,
        message:
          "Rabby menampilkan Select Address tetapi element tidak visible.",
      };
    }

    console.log("👤 Rabby meminta pemilihan address.");

    console.log("🖱️ Membuka Select Address...");

    try {
      await selectAddress.click({
        timeout: 5000,
      });
    } catch {
      try {
        await selectAddress.click({
          force: true,
          timeout: 5000,
        });
      } catch (error) {
        return {
          success: false,
          connected: false,
          origin: null,
          accountName: null,
          message: `Gagal membuka Select Address: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    }

    await page.waitForTimeout(500);

    const selectorText = await this.waitForBodyText(page);

    console.log("🦊 Rabby account selector:");

    console.log(selectorText.slice(0, 5000));

    const accountCandidate = page.getByText(
      new RegExp(`^${this.escapeRegex(request.accountName)}$`, "i"),
    );

    const accountCount = await accountCandidate.count();

    if (accountCount === 1) {
      const accountVisible = await accountCandidate
        .isVisible()
        .catch(() => false);

      if (accountVisible) {
        console.log(`👤 Account "${request.accountName}" ditemukan.`);

        try {
          await accountCandidate.click({
            timeout: 5000,
          });
        } catch {
          try {
            await accountCandidate.click({
              force: true,
              timeout: 5000,
            });
          } catch (error) {
            return {
              success: false,
              connected: false,
              origin: null,
              accountName: null,
              message: `Gagal memilih account "${request.accountName}": ${
                error instanceof Error ? error.message : String(error)
              }`,
            };
          }
        }

        await page.waitForTimeout(500);

        const afterSelection = await this.waitForBodyText(page);

        console.log("✅ Account berhasil dipilih.");

        if (accountNameRegex.test(afterSelection)) {
          return {
            success: true,
            connected: false,
            origin: null,
            accountName: request.accountName,
            message: `Account "${request.accountName}" berhasil dipilih di Rabby.`,
          };
        }
      }
    }

    const normalizedWallet = request.walletAddress.toLowerCase();

    const shortWallet = this.getShortWallet(
      request.walletAddress,
    ).toLowerCase();

    const walletCandidate = page.getByText(
      new RegExp(
        `(?:${this.escapeRegex(normalizedWallet)}|${this.escapeRegex(
          shortWallet,
        )})`,
        "i",
      ),
    );

    const walletCount = await walletCandidate.count();

    if (walletCount === 1) {
      const walletVisible = await walletCandidate
        .isVisible()
        .catch(() => false);

      if (walletVisible) {
        console.log("💳 Wallet address ditemukan di account selector.");

        try {
          await walletCandidate.click({
            timeout: 5000,
          });
        } catch {
          try {
            await walletCandidate.click({
              force: true,
              timeout: 5000,
            });
          } catch (error) {
            return {
              success: false,
              connected: false,
              origin: null,
              accountName: null,
              message: `Gagal memilih wallet address di Rabby: ${
                error instanceof Error ? error.message : String(error)
              }`,
            };
          }
        }

        await page.waitForTimeout(500);

        return {
          success: true,
          connected: false,
          origin: null,
          accountName: request.accountName,
          message: "Wallet address account berhasil dipilih di Rabby.",
        };
      }
    }

    return {
      success: false,
      connected: false,
      origin: null,
      accountName: null,
      message: `Tidak menemukan account "${request.accountName}" atau wallet "${shortWallet}" di Rabby account selector.`,
    };
  }

  private async inspectConnectApproval(
    page: Page,
    request: RabbyConnectionRequest,
  ): Promise<RabbyConnectionResult> {
    const bodyText = await this.waitForBodyText(page);

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

  private async waitForConnectButton(
    button: ReturnType<Page["getByRole"]>,
    timeoutMs: number,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const count = await button.count();

      if (count !== 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));

        continue;
      }

      const visible = await button.isVisible().catch(() => false);

      const enabled = await button.isEnabled().catch(() => false);

      if (visible && enabled) {
        await new Promise((resolve) => setTimeout(resolve, 300));

        const stillVisible = await button.isVisible().catch(() => false);

        const stillEnabled = await button.isEnabled().catch(() => false);

        if (stillVisible && stillEnabled) {
          return true;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return false;
  }

  private async waitForBodyText(
    page: Page,
    timeoutMs = 10000,
  ): Promise<string> {
    const body = page.locator("body");

    const deadline = Date.now() + timeoutMs;

    let text = "";

    while (Date.now() < deadline) {
      text = await body.innerText().catch(() => "");

      if (text.trim().length > 0) {
        return text;
      }

      await page.waitForTimeout(250);
    }

    return text;
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

      if (count !== 1) {
        continue;
      }

      const visible = await candidate.isVisible().catch(() => false);

      if (!visible) {
        continue;
      }

      console.log("🔘 Ignore All ditemukan.");

      try {
        await candidate.click({
          timeout: 5000,
        });
      } catch {
        await candidate.click({
          force: true,
          timeout: 5000,
        });
      }

      return true;
    }

    return false;
  }

  private async isPageClosed(page: Page): Promise<boolean> {
    return page.isClosed();
  }

  private isAlertReminder(text: string): boolean {
    return (
      /Please process the alert before signing/i.test(text) ||
      /process the alert before signing/i.test(text)
    );
  }

  private extractAccountName(text: string): string | null {
    const match = text.match(/Connect Address\s+([^\n]+)/i);

    const value = match?.[1]?.trim() ?? null;

    if (!value || /^Select Address$/i.test(value)) {
      return null;
    }

    return value;
  }

  private getShortWallet(walletAddress: string): string {
    return walletAddress.slice(0, 8) + "..." + walletAddress.slice(-6);
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
