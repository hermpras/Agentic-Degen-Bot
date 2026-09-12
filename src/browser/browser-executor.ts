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

  constructor(private readonly options: BrowserExecutorOptions = {}) {
    if (options.headless && options.connectOverCDPUrl) {
      throw new Error(
        "headless=true tidak bisa dipakai bersama connectOverCDPUrl.",
      );
    }
  }

  async start(): Promise<void> {
    if (this.browser) {
      return;
    }

    const timeoutMs = this.options.timeoutMs ?? 30000;

    if (this.options.connectOverCDPUrl) {
      this.browser = await chromium.connectOverCDP(
        this.options.connectOverCDPUrl,
      );

      const contexts = this.browser.contexts();

      if (contexts.length === 0) {
        throw new Error("Browser CDP tidak memiliki context.");
      }

      this.context = contexts[0];

      const pages = this.context.pages();

      this.page = pages[0] ?? (await this.context.newPage());

      this.page.setDefaultTimeout(timeoutMs);

      return;
    }

    this.browser = await chromium.launch({
      headless: this.options.headless ?? true,
    });

    this.context = await this.browser.newContext({
      storageState: this.options.storageStatePath,
    });

    this.page = await this.context.newPage();

    this.page.setDefaultTimeout(timeoutMs);
  }

  async open(url: string): Promise<BrowserPageResult> {
    const page = this.getPage();

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      throw new Error(`URL tidak didukung: ${url}`);
    }

    await page.goto(url, {
      waitUntil: "domcontentloaded",
    });

    return this.getPageResult();
  }

  async getPageResult(): Promise<BrowserPageResult> {
    const page = this.getPage();

    return {
      url: page.url(),
      title: await page.title(),
      text: await page.locator("body").innerText(),
    };
  }

  async elementExists(selector: string): Promise<boolean> {
    const page = this.getPage();

    return (await page.locator(selector).count()) > 0;
  }

  async click(selector: string): Promise<void> {
    const page = this.getPage();

    await page.locator(selector).click();
  }

  async fill(selector: string, value: string): Promise<void> {
    const page = this.getPage();

    await page.locator(selector).fill(value);
  }

  async press(selector: string, key: string): Promise<void> {
    const page = this.getPage();

    await page.locator(selector).press(key);
  }

  async getText(selector: string): Promise<string> {
    const page = this.getPage();

    return await page.locator(selector).innerText();
  }

  async getAttribute(
    selector: string,
    attribute: string,
  ): Promise<string | null> {
    const page = this.getPage();

    return await page.locator(selector).getAttribute(attribute);
  }

  async evaluate<T = unknown>(script: string): Promise<T> {
    const page = this.getPage();

    return (await page.evaluate(script)) as T;
  }

  async getCurrentUrl(): Promise<string> {
    return this.getPage().url();
  }

  async saveStorageState(path?: string): Promise<string> {
    if (!this.context) {
      throw new Error("Browser belum di-start.");
    }

    const sessionPath = path ?? this.options.storageStatePath;

    if (!sessionPath) {
      throw new Error("Storage state path belum ditentukan.");
    }

    await this.context.storageState({
      path: sessionPath,
    });

    return sessionPath;
  }

  async screenshot(path: string): Promise<void> {
    const page = this.getPage();

    await page.screenshot({
      path,
      fullPage: true,
    });
  }

  getOpenPages(): Page[] {
    if (!this.context) {
      throw new Error("Browser belum di-start.");
    }

    return this.context.pages();
  }

  async waitForNewPage(timeoutMs?: number): Promise<Page | null> {
    if (!this.context) {
      throw new Error("Browser belum di-start.");
    }

    try {
      return await this.context.waitForEvent("page", {
        timeout: timeoutMs ?? this.options.timeoutMs ?? 10000,
      });
    } catch (error) {
      if (error instanceof Error && /Timeout/i.test(error.message)) {
        return null;
      }

      throw error;
    }
  }

  usePage(page: Page): void {
    if (!this.context) {
      throw new Error("Browser belum di-start.");
    }

    if (!this.context.pages().includes(page)) {
      throw new Error("Page bukan bagian dari browser context ini.");
    }

    this.page = page;
  }

  getActivePage(): Page {
    return this.getPage();
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
    }

    this.context = null;
    this.page = null;
    this.browser = null;
  }

  private getPage(): Page {
    if (!this.page) {
      throw new Error("Browser belum di-start.");
    }

    return this.page;
  }
}
