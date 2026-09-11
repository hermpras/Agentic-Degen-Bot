import { AgentDatabase } from "../src/database/agent-database.js";
import { TaskManager } from "../src/tasks/task-manager.js";

const database = new AgentDatabase("data/test-task-proof.db");

const taskManager = new TaskManager(database);

const db = database.getDb();

// Bersihkan data test sebelumnya.
db.exec(`
  DELETE FROM tasks;
  DELETE FROM projects;
  DELETE FROM accounts;
`);

// Buat project test.
db.prepare(
  `
  INSERT INTO projects (
    name,
    website_url
  )
  VALUES (?, ?)
`,
).run("Proof Test Project", "https://example.com");

// Buat account test.
db.prepare(
  `
  INSERT INTO accounts (
    name,
    twitter_handle,
    wallet_address
  )
  VALUES (?, ?, ?)
`,
).run("Proof Test Account", "@proof_test", "0x1234567890abcdef");

// Buat task.
const task = taskManager.createTask({
  projectName: "Proof Test Project",
  accountName: "Proof Test Account",
  taskType: "FORM_SUBMIT",
  targetUrl: "https://example.com/form",
  description: "Test execution proof persistence",
});

console.log(`📋 Task dibuat: #${task.id}`);

const proof = JSON.stringify(
  {
    version: 1,
    createdAt: new Date().toISOString(),
    url: "https://example.com/form",
    formType: "WEBSITE",
    executionStatus: "READY_TO_SUBMIT",
    submitAttempted: false,
    fieldsFilled: 2,
    checkboxesChecked: 1,
    fields: [
      {
        index: 0,
        type: "TWITTER_HANDLE",
        label: "Twitter Username",
        valueProvided: true,
        status: "FILLED",
      },
      {
        index: 1,
        type: "WALLET_ADDRESS",
        label: "Wallet Address",
        valueProvided: true,
        status: "FILLED",
      },
    ],
    summary: "Form berhasil diisi. Submit belum dilakukan.",
  },
  null,
  2,
);

// Simpan proof.
const updated = taskManager.saveTaskProof(task.id, proof);

if (!updated) {
  throw new Error("Task tidak ditemukan setelah saveTaskProof.");
}

console.log(`💾 Proof tersimpan untuk task #${updated.id}`);

// Baca ulang dari database.
const loaded = taskManager.getTaskById(task.id);

if (!loaded) {
  throw new Error("Task gagal dibaca kembali dari database.");
}

if (!loaded.proof) {
  throw new Error("Proof tidak ditemukan di database.");
}

// Pastikan JSON valid.
const parsedProof = JSON.parse(loaded.proof);

if (parsedProof.version !== 1) {
  throw new Error("Proof version tidak sesuai.");
}

if (parsedProof.executionStatus !== "READY_TO_SUBMIT") {
  throw new Error("Execution status tidak sesuai.");
}

if (parsedProof.fieldsFilled !== 2) {
  throw new Error("fieldsFilled tidak sesuai.");
}

if (parsedProof.checkboxesChecked !== 1) {
  throw new Error("checkboxesChecked tidak sesuai.");
}

if (parsedProof.submitAttempted !== false) {
  throw new Error("submitAttempted seharusnya false.");
}

console.log("🔍 Proof berhasil dibaca ulang dari SQLite.");
console.log(`   executionStatus: ${parsedProof.executionStatus}`);
console.log(`   fieldsFilled: ${parsedProof.fieldsFilled}`);
console.log(`   checkboxesChecked: ${parsedProof.checkboxesChecked}`);

console.log("🎉 Task proof persistence test passed.");
