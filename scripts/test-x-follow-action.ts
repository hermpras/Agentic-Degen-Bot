import { AccountBrowser } from "../src/browser/account-browser.js";
import { XActionExecutor } from "../src/tasks/x-action-executor.js";

async function main() {
  const accountId = Number(process.argv[2]);

  if (!Number.isInteger(accountId) || accountId <= 0) {
    console.error("Usage: npx tsx scripts/test-x-follow-action.ts <accountId>");
    process.exit(1);
  }

  const targetUrl = "https://x.com/arcwargg";

  console.log("========================================");
  console.log("REAL X FOLLOW ACTION TEST");
  console.log("========================================");
  console.log(`Account : ${accountId}`);
  console.log(`Target  : ${targetUrl}`);
  console.log("");

  const accountBrowser = new AccountBrowser(undefined, {
    headless: true,
  });

  const executor = new XActionExecutor(accountBrowser);

  try {
    const result = await executor.execute({
      planTaskId: "manual-test-x-follow",
      projectName: "ARCWAR",
      accountId,
      accountName: `Account ${accountId}`,
      twitterHandle: "",
      walletAddress: "",
      taskType: "X_FOLLOW",
      targetUrl,
      description: "Manual X follow test",
      dependsOn: [],
      outputKey: undefined,
      inputFrom: undefined,
    });

    console.log("");
    console.log("========================================");
    console.log("TEST RESULT");
    console.log("========================================");
    console.log(`Success : ${result.success}`);
    console.log(`Action  : ${result.action}`);
    console.log(`Account : ${result.accountId}`);
    console.log(`Target  : ${result.targetUrl}`);
    console.log(`Message : ${result.message}`);
    console.log(`Output  : ${result.output ?? "null"}`);
    console.log(`Proof   : ${result.proof ?? "null"}`);
    console.log("");

    if (!result.success) {
      console.error("TEST FAILED");
      process.exitCode = 1;
      return;
    }

    console.log("========================================");
    console.log("TEST PASSED");
    console.log("========================================");
  } catch (error) {
    console.error("");
    console.error("========================================");
    console.error("TEST FAILED");
    console.error("========================================");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await executor.close();
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
