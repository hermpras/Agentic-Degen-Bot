import readline from "readline";
import { BrowserSessionService } from "../src/browser/browser-session-service.js";

async function askQuestion(question: string): Promise<string> {
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

async function main(): Promise<void> {
  console.log("");
  console.log("======================================");
  console.log("🔐 Browser Session Test");
  console.log("======================================");
  console.log("");

  const accountInput = await askQuestion("Masukkan Account ID (contoh: 1): ");

  const accountId = Number(accountInput);

  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw new Error("Account ID harus berupa angka positif.");
  }

  const sessionService = new BrowserSessionService();

  const session = await sessionService.startManualSession(accountId);

  console.log("");
  console.log(`👤 Account ID: ${session.accountId}`);
  console.log(`🔐 Session path: ${session.sessionPath}`);
  console.log(`📦 Existing session: ${session.hasExistingSession}`);
  console.log("");

  if (!session.hasExistingSession) {
    console.log("👉 Browser sudah terbuka.");
    console.log("👉 Silakan login secara manual.");
    console.log("👉 Jangan masukkan password/OTP/private key ke terminal.");
  } else {
    console.log("👉 Existing browser session sudah dimuat.");
  }

  console.log("");

  await askQuestion("Tekan ENTER setelah selesai menggunakan browser...");

  console.log("");
  console.log("💾 Saving browser session...");

  await sessionService.saveSession(session);

  console.log("");
  console.log("🌐 Closing browser...");

  await sessionService.closeSession(session);

  console.log("");
  console.log("✅ Browser session berhasil disimpan.");
  console.log(`📁 ${session.sessionPath}`);
  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("❌ Browser session test gagal:");
  console.error(error);
  process.exit(1);
});
