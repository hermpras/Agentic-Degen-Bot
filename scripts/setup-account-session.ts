import { spawn, ChildProcess } from "child_process";
import readline from "readline";
import fs from "fs";
import path from "path";

import { BrowserExecutor } from "../src/browser/browser-executor.js";
import { BrowserSessionManager } from "../src/browser/browser-session-manager.js";

const CDP_PORT = 9222;

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCdp(url: string, timeoutMs = 15_000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${url}/json/version`);

      if (response.ok) {
        return;
      }
    } catch {
      // Chrome belum siap.
    }

    await wait(500);
  }

  throw new Error(
    `Chrome CDP tidak tersedia pada ${url} setelah ${timeoutMs}ms.`,
  );
}

function startChrome(): {
  process: ChildProcess;
  userDataDir: string;
} {
  const userDataDir = path.resolve(
    process.cwd(),
    "playwright",
    "chrome-profiles",
    "manual-login",
  );

  fs.mkdirSync(userDataDir, {
    recursive: true,
  });

  const chromePath =
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

  if (!fs.existsSync(chromePath)) {
    throw new Error(`Google Chrome tidak ditemukan di:\n${chromePath}`);
  }

  console.log("");
  console.log("🌐 Membuka Google Chrome dengan profile automation khusus...");
  console.log(`👤 Profile: ${userDataDir}`);
  console.log(`🔗 CDP port: ${CDP_PORT}`);

  const chromeProcess = spawn(
    chromePath,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "https://x.com/",
    ],
    {
      detached: false,
      stdio: "ignore",
    },
  );

  return {
    process: chromeProcess,
    userDataDir,
  };
}

async function main() {
  const rawAccountId = process.argv[2];

  if (!rawAccountId) {
    throw new Error(
      "Account ID wajib diberikan.\n" +
        "Contoh: npx tsx scripts/setup-account-session.ts 1",
    );
  }

  const accountId = Number(rawAccountId);

  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw new Error("Account ID harus berupa integer positif.");
  }

  const sessionManager = new BrowserSessionManager();
  const sessionInfo = sessionManager.getSessionInfo(accountId);

  console.log("");
  console.log("🔐 Account Session Setup");
  console.log("========================");
  console.log(`Account ID : ${accountId}`);
  console.log(`Session    : ${sessionInfo.sessionPath}`);
  console.log(`Existing   : ${sessionInfo.exists ? "YA" : "TIDAK"}`);
  console.log("");

  if (sessionInfo.exists) {
    const answer = await ask(
      "⚠️ Session sudah ada. Timpa dengan login baru? (y/n): ",
    );

    if (answer.toLowerCase() !== "y") {
      console.log("❌ Setup dibatalkan.");
      return;
    }

    sessionManager.deleteSession(accountId);
  }

  const chrome = startChrome();

  try {
    const cdpUrl = `http://127.0.0.1:${CDP_PORT}`;

    console.log("");
    console.log("⏳ Menunggu Chrome siap...");
    await waitForCdp(cdpUrl);

    const browser = new BrowserExecutor({
      headless: false,
      connectOverCDPUrl: cdpUrl,
    });

    try {
      await browser.start();

      await browser.open("https://x.com/");

      console.log("");
      console.log("==========================================");
      console.log("🔑 LOGIN MANUAL");
      console.log("==========================================");
      console.log("Login ke X menggunakan account yang sesuai.");
      console.log("");
      console.log("Jangan berikan password/credential ke agent.");
      console.log("");
      console.log("Setelah login berhasil dan halaman X sudah normal,");
      console.log("kembali ke terminal ini.");
      console.log("==========================================");
      console.log("");

      await ask("Tekan ENTER setelah login X berhasil... ");

      console.log("");
      console.log(`🌐 Current URL: ${browser.getCurrentUrl()}`);

      const pageResult = await browser.getPageResult();

      console.log(`📄 Title: ${pageResult.title}`);

      const sessionPath = await browser.saveStorageState(
        sessionInfo.sessionPath,
      );

      console.log("");
      console.log("==========================================");
      console.log("✅ SESSION BERHASIL DISIMPAN");
      console.log("==========================================");
      console.log(`Account : ${accountId}`);
      console.log(`Session : ${sessionPath}`);
      console.log("");
      console.log("Account ini sekarang bisa digunakan TaskExecutor.");
      console.log("==========================================");
    } finally {
      await browser.close();
    }
  } finally {
    if (chrome.process && !chrome.process.killed) {
      chrome.process.kill();
    }
  }
}

main().catch((error) => {
  console.error("");
  console.error("❌ Session setup gagal:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
