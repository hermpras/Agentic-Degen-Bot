import { chromium, Browser, BrowserContext, Page } from "playwright";

export interface BrowserExecutorOptions {
  headless?: boolean;
  timeoutMs?: number;
  storageStatePath?: string;
  connectOverCDPUrl?: string;
}

export interface BrowserPageResult {
  url: string;
  title: string;
  text: string;
}

export class BrowserExecutor {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  private readonly headless: boolean;
  private readonly timeoutMs: number;
  private readonly storageStatePath: string | undefined;
  private readonly connectOverCDPUrl: string | undefined;

  constructor(options: BrowserExecutorOptions = {}) {
    this.headless = options.headless ?? true;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.storageStatePath = options.storageStatePath?.trim() || undefined;
    this.connectOverCDPUrl = options.connectOverCDPUrl?.trim() || undefined;

    if (this.headless && this.connectOverCDPUrl) {
      throw new Error(
        "BrowserExecutor tidak boleh menggunakan headless=true saat connectOverCDP.",
      );
    }
  }

  async start(): Promise<void> {
    if (this.browser) {
      return;
    }

    console.log(
      `🌐 [BrowserExecutor] Starting browser (headless=${this.headless})...`,
    );

    if (this.connectOverCDPUrl) {
      console.log(
        `🔗 [BrowserExecutor] Connecting over CDP: ${this.connectOverCDPUrl}`,
      );

      this.browser = await chromium.connectOverCDP(this.connectOverCDPUrl);

      const contexts = this.browser.contexts();

      if (contexts.length === 0) {
        throw new Error(
          "Browser CDP terhubung tetapi tidak memiliki browser context.",
        );
      }

      this.context = contexts[0];

      this.context.setDefaultTimeout(this.timeoutMs);

      const pages = this.context.pages();

      if (pages.length > 0) {
        this.page = pages[0];
      } else {
        this.page = await this.context.newPage();
      }

      console.log("🔗 [BrowserExecutor] Connected to existing browser.");
      return;
    }

    if (this.storageStatePath) {
      console.log(
        `🔐 [BrowserExecutor] Using storage state: ${this.storageStatePath}`,
      );
    } else {
      console.log("🔐 [BrowserExecutor] Starting without saved session.");
    }

    this.browser = await chromium.launch({
      headless: this.headless,
    });

    this.context = await this.browser.newContext({
      storageState: this.storageStatePath,
    });

    this.context.setDefaultTimeout(this.timeoutMs);

    this.page = await this.context.newPage();

    console.log("🌐 [BrowserExecutor] Browser ready.");
  }

  async open(url: string): Promise<BrowserPageResult> {
    const page = await this.getPage();
    const normalizedUrl = url.trim();

    if (!normalizedUrl) {
      throw new Error("URL browser tidak boleh kosong.");
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      throw new Error(`URL browser tidak valid: "${normalizedUrl}".`);
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error(
        "BrowserExecutor hanya mengizinkan URL http:// atau https://.",
      );
    }

    console.log(`🌐 [BrowserExecutor] Opening: ${parsedUrl.toString()}`);

    await page.goto(parsedUrl.toString(), {
      waitUntil: "domcontentloaded",
    });

    return this.getPageResult();
  }

  async getPageResult(): Promise<BrowserPageResult> {
    const page = await this.getPage();

    return {
      url: page.url(),
      title: await page.title(),
      text: await page.locator("body").innerText(),
    };
  }

  async elementExists(selector: string): Promise<boolean> {
    const page = await this.getPage();
    const normalizedSelector = selector.trim();

    if (!normalizedSelector) {
      throw new Error("Selector elementExists tidak boleh kosong.");
    }

    const count = await page.locator(normalizedSelector).count();

    return count > 0;
  }

  async click(selector: string): Promise<void> {
    const page = await this.getPage();
    const normalizedSelector = selector.trim();

    if (!normalizedSelector) {
      throw new Error("Selector click tidak boleh kosong.");
    }

    console.log(`🖱️ [BrowserExecutor] Click: ${normalizedSelector}`);

    await page.locator(normalizedSelector).click();
  }

  async fill(selector: string, value: string): Promise<void> {
    const page = await this.getPage();
    const normalizedSelector = selector.trim();

    if (!normalizedSelector) {
      throw new Error("Selector fill tidak boleh kosong.");
    }

    console.log(`⌨️ [BrowserExecutor] Fill: ${normalizedSelector}`);

    await page.locator(normalizedSelector).fill(value);
  }

  async press(selector: string, key: string): Promise<void> {
    const page = await this.getPage();
    const normalizedSelector = selector.trim();
    const normalizedKey = key.trim();

    if (!normalizedSelector) {
      throw new Error("Selector press tidak boleh kosong.");
    }

    if (!normalizedKey) {
      throw new Error("Key press tidak boleh kosong.");
    }

    console.log(
      `⌨️ [BrowserExecutor] Press: ${normalizedSelector} → ${normalizedKey}`,
    );

    await page.locator(normalizedSelector).press(normalizedKey);
  }

  async getText(selector: string): Promise<string> {
    const page = await this.getPage();
    const normalizedSelector = selector.trim();

    if (!normalizedSelector) {
      throw new Error("Selector getText tidak boleh kosong.");
    }

    return page.locator(normalizedSelector).innerText();
  }

  async getAttribute(
    selector: string,
    attribute: string,
  ): Promise<string | null> {
    const page = await this.getPage();
    const normalizedSelector = selector.trim();
    const normalizedAttribute = attribute.trim();

    if (!normalizedSelector) {
      throw new Error("Selector getAttribute tidak boleh kosong.");
    }

    if (!normalizedAttribute) {
      throw new Error("Nama attribute tidak boleh kosong.");
    }

    return page.locator(normalizedSelector).getAttribute(normalizedAttribute);
  }

  async evaluate<T>(script: string): Promise<T> {
    const page = await this.getPage();
    const normalizedScript = script.trim();

    if (!normalizedScript) {
      throw new Error("Script evaluate tidak boleh kosong.");
    }

    return page.evaluate(normalizedScript) as Promise<T>;
  }

  getCurrentUrl(): string {
    if (!this.page) {
      throw new Error(
        "Browser belum dimulai. Panggil start() terlebih dahulu.",
      );
    }

    return this.page.url();
  }

  async saveStorageState(outputPath?: string): Promise<string> {
    const context = await this.getContext();
    const targetPath = outputPath?.trim() || this.storageStatePath;

    if (!targetPath) {
      throw new Error("Path storage state wajib diisi.");
    }

    await context.storageState({
      path: targetPath,
    });

    console.log(`🔐 [BrowserExecutor] Storage state saved: ${targetPath}`);

    return targetPath;
  }

  async screenshot(path: string): Promise<void> {
    const page = await this.getPage();
    const normalizedPath = path.trim();

    if (!normalizedPath) {
      throw new Error("Path screenshot tidak boleh kosong.");
    }

    await page.screenshot({
      path: normalizedPath,
      fullPage: true,
    });

    console.log(`📸 [BrowserExecutor] Screenshot saved: ${normalizedPath}`);
  }

  async close(): Promise<void> {
    if (this.browser) {
      console.log("🌐 [BrowserExecutor] Closing browser...");

      await this.browser.close();

      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  private async getContext(): Promise<BrowserContext> {
    if (!this.context) {
      await this.start();
    }

    if (!this.context) {
      throw new Error("Browser context gagal dibuat.");
    }

    return this.context;
  }

  private async getPage(): Promise<Page> {
    if (!this.page) {
      await this.start();
    }

    if (!this.page) {
      throw new Error("Browser page gagal dibuat.");
    }

    return this.page;
  }
}
