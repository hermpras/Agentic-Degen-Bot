import { spawn, ChildProcess } from "child_process";
import readline from "readline";
import fs from "fs";
import path from "path";

import { BrowserExecutor } from "../src/browser/browser-executor.js";
import { BrowserSessionManager } from "../src/browser/browser-session-manager.js";

function getCdpPort(accountId: number): number {
  return 9222 + (accountId - 1) * 2;
}

function getUserDataDir(accountId: number): string {
  return path.resolve(
    process.cwd(),
    "playwright",
    "chrome-profiles",
    `account-${accountId}`,
  );
}

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

function removeDirectoryIfExists(directory: string): void {
  if (!fs.existsSync(directory)) {
    return;
  }

  console.log("");
  console.log(`🧹 Membersihkan Chrome profile: ${directory}`);

  fs.rmSync(directory, {
    recursive: true,
    force: true,
  });

  console.log("✅ Chrome profile berhasil dibersihkan.");
}

function startChrome(accountId: number): {
  process: ChildProcess;
  userDataDir: string;
  cdpPort: number;
} {
  const cdpPort = getCdpPort(accountId);
  const userDataDir = getUserDataDir(accountId);

  fs.mkdirSync(userDataDir, {
    recursive: true,
  });

  const chromePath =
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

  if (!fs.existsSync(chromePath)) {
    throw new Error(`Google Chrome tidak ditemukan di:\n${chromePath}`);
  }

  console.log("");
  console.log("🌐 Membuka Google Chrome dengan profile account-specific...");
  console.log(`👤 Account : ${accountId}`);
  console.log(`👤 Profile : ${userDataDir}`);
  console.log(`🔗 CDP port: ${cdpPort}`);

  const chromeProcess = spawn(
    chromePath,
    [
      `--remote-debugging-port=${cdpPort}`,
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
    cdpPort,
  };
}

async function main(): Promise<void> {
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
  const userDataDir = getUserDataDir(accountId);
  const cdpPort = getCdpPort(accountId);

  console.log("");
  console.log("🔐 Account Session Setup");
  console.log("========================");
  console.log(`Account ID : ${accountId}`);
  console.log(`Session    : ${sessionInfo.sessionPath}`);
  console.log(`Existing   : ${sessionInfo.exists ? "YA" : "TIDAK"}`);
  console.log(`CDP Port   : ${cdpPort}`);
  console.log(`Chrome     : ${userDataDir}`);
  console.log("");

  if (sessionInfo.exists) {
    const answer = await ask(
      "⚠️ Session sudah ada. Timpa dengan login baru? (y/n): ",
    );

    if (answer.toLowerCase() !== "y") {
      console.log("❌ Setup dibatalkan.");
      return;
    }

    console.log("");
    console.log(`🗑️ Menghapus session file Account ${accountId}...`);

    sessionManager.deleteSession(accountId);

    console.log("✅ Session file dihapus.");

    // Penting:
    // StorageState hanya menghapus file session.
    // Cookie/session X yang tersimpan di Chrome profile
    // harus ikut dibersihkan agar login benar-benar fresh.
    removeDirectoryIfExists(userDataDir);
  } else if (fs.existsSync(userDataDir)) {
    const answer = await ask(
      `⚠️ Chrome profile Account ${accountId} sudah ada tetapi session file tidak ada.\n` +
        "Bersihkan profile dan mulai login baru? (y/n): ",
    );

    if (answer.toLowerCase() !== "y") {
      console.log("❌ Setup dibatalkan.");
      return;
    }

    removeDirectoryIfExists(userDataDir);
  }

  const chrome = startChrome(accountId);

  try {
    const cdpUrl = `http://127.0.0.1:${chrome.cdpPort}`;

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
      console.log(`Account ID : ${accountId}`);
      console.log("");
      console.log("Login ke X menggunakan account yang sesuai.");
      console.log("");
      console.log("Jangan berikan password/credential ke agent.");
      console.log("");
      console.log("Pastikan username X yang tampil adalah account");
      console.log(`yang memang ditujukan untuk Account #${accountId}.`);
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
      console.log(`Chrome  : ${userDataDir}`);
      console.log(`CDP     : ${cdpUrl}`);
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
