import { FieldMapper } from "../src/tasks/field-mapper.js";
import type { InspectedField } from "../src/tasks/form-inspector.js";

function createField(
  index: number,
  label: string,
  overrides: Partial<InspectedField> = {},
): InspectedField {
  return {
    index,
    kind: "INPUT",
    type: "text",
    name: null,
    id: null,
    label,
    placeholder: null,
    ariaLabel: null,
    required: false,
    selector: `#mock-${index}`,
    ...overrides,
  };
}

async function main(): Promise<void> {
  console.log("🧪 FieldMapper mock test");

  const mapper = new FieldMapper();

  const fields: InspectedField[] = [
    createField(0, "X Username"),
    createField(1, "Twitter Handle"),
    createField(2, "Wallet Address"),
    createField(3, "EVM Address"),
    createField(4, "ETH Address"),
    createField(5, "Email Address"),
    createField(6, "Discord Username"),
    createField(7, "Telegram Username"),
    createField(8, "Tweet URL"),
    createField(9, "Random Information"),
  ];

  console.log("");
  console.log("▶️ Mapping fields...");

  const mappings = mapper.mapFields(fields);

  console.log("");
  console.log("📊 Mapping results:");

  for (const mapping of mappings) {
    console.log(
      [
        `#${mapping.field.index}`,
        `"${mapping.field.label}"`,
        "→",
        mapping.mappedType,
        `(confidence=${mapping.confidence})`,
      ].join(" "),
    );
  }

  console.log("");

  const expectedMappings = [
    {
      label: "X Username",
      type: "TWITTER_HANDLE",
    },
    {
      label: "Twitter Handle",
      type: "TWITTER_HANDLE",
    },
    {
      label: "Wallet Address",
      type: "WALLET_ADDRESS",
    },
    {
      label: "EVM Address",
      type: "WALLET_ADDRESS",
    },
    {
      label: "ETH Address",
      type: "WALLET_ADDRESS",
    },
    {
      label: "Email Address",
      type: "EMAIL",
    },
    {
      label: "Discord Username",
      type: "DISCORD",
    },
    {
      label: "Telegram Username",
      type: "TELEGRAM",
    },
    {
      label: "Tweet URL",
      type: "OWN_TWEET_URL",
    },
  ] as const;

  for (const expected of expectedMappings) {
    const mapping = mappings.find(
      (item) => item.field.label === expected.label,
    );

    if (!mapping) {
      throw new Error(`Field "${expected.label}" tidak berhasil di-map.`);
    }

    if (mapping.mappedType !== expected.type) {
      throw new Error(
        `Field "${expected.label}" salah mapping: ` +
          `${mapping.mappedType}, expected ${expected.type}`,
      );
    }

    if (mapping.confidence <= 0) {
      throw new Error(
        `Field "${expected.label}" memiliki confidence tidak valid.`,
      );
    }
  }

  const randomMapping = mappings.find(
    (item) => item.field.label === "Random Information",
  );

  if (randomMapping) {
    throw new Error(
      `Field "Random Information" seharusnya tidak berhasil di-map, ` +
        `tetapi mendapat ${randomMapping.mappedType}.`,
    );
  }

  if (mappings.length !== expectedMappings.length) {
    throw new Error(
      `Expected ${expectedMappings.length} mappings, ` +
        `got ${mappings.length}.`,
    );
  }

  console.log("✅ X Username → TWITTER_HANDLE");
  console.log("✅ Twitter Handle → TWITTER_HANDLE");
  console.log("✅ Wallet Address → WALLET_ADDRESS");
  console.log("✅ EVM Address → WALLET_ADDRESS");
  console.log("✅ ETH Address → WALLET_ADDRESS");
  console.log("✅ Email Address → EMAIL");
  console.log("✅ Discord Username → DISCORD");
  console.log("✅ Telegram Username → TELEGRAM");
  console.log("✅ Tweet URL → OWN_TWEET_URL");
  console.log("✅ Unknown field tidak di-map");

  console.log("");
  console.log("🎉 FieldMapper mock test passed.");
}

main().catch((error) => {
  console.error("");
  console.error("❌ FieldMapper mock test failed.");
  console.error(error);
  process.exit(1);
});
