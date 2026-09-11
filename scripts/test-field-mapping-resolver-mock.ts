import { FieldMapper } from "../src/tasks/field-mapper.js";
import { FieldMappingResolver } from "../src/tasks/field-mapping-resolver.js";
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
  console.log("🧪 FieldMappingResolver mock test");

  const mapper = new FieldMapper();

  const resolver = new FieldMappingResolver(mapper);

  /*
   * ============================================================
   * TEST 1
   * Satu kandidat wallet yang jelas.
   * Expected: MATCH
   * ============================================================
   */

  console.log("");
  console.log("▶️ Test 1: single strong candidate");

  const singleCandidateFields = [
    createField(0, "Username"),
    createField(1, "Wallet Address"),
    createField(2, "Email Address"),
  ];

  const singleResult = resolver.resolve(
    "WALLET_ADDRESS",
    singleCandidateFields,
  );

  console.log(JSON.stringify(singleResult, null, 2));

  if (singleResult.status !== "MATCH") {
    throw new Error(`Expected MATCH, got ${singleResult.status}`);
  }

  if (singleResult.mapping.field.label !== "Wallet Address") {
    throw new Error(
      `Wrong field selected: ${singleResult.mapping.field.label}`,
    );
  }

  if (singleResult.mapping.confidence < 80) {
    throw new Error(
      `Expected confidence >= 80, got ${singleResult.mapping.confidence}`,
    );
  }

  console.log("✅ Single strong candidate → MATCH");

  /*
   * ============================================================
   * TEST 2
   * Dua wallet dengan confidence sama.
   * Expected: AMBIGUOUS
   * ============================================================
   */

  console.log("");
  console.log("▶️ Test 2: ambiguous candidates");

  const ambiguousFields = [
    createField(0, "Primary Wallet Address"),
    createField(1, "Backup Wallet Address"),
  ];

  const ambiguousResult = resolver.resolve("WALLET_ADDRESS", ambiguousFields);

  console.log(JSON.stringify(ambiguousResult, null, 2));

  if (ambiguousResult.status !== "AMBIGUOUS") {
    throw new Error(`Expected AMBIGUOUS, got ${ambiguousResult.status}`);
  }

  if (ambiguousResult.candidates.length !== 2) {
    throw new Error(
      `Expected 2 ambiguous candidates, got ${ambiguousResult.candidates.length}`,
    );
  }

  console.log("✅ Multiple equally strong candidates → AMBIGUOUS");

  /*
   * ============================================================
   * TEST 3
   * Confidence rendah.
   *
   * "Username" sebenarnya mapper memberi score 60.
   * Untuk WALLET_ADDRESS tidak ada match.
   *
   * Kita gunakan field "Address" yang mapper mengenali
   * sebagai wallet hanya jika keyword scoring berubah.
   *
   * Supaya benar-benar menguji LOW_CONFIDENCE,
   * kita override mapper dengan fake mapper.
   * ============================================================
   */

  console.log("");
  console.log("▶️ Test 3: low confidence candidate");

  const lowConfidenceMapper = {
    mapFields(fields: InspectedField[]) {
      return fields.map((field) => ({
        field,
        mappedType: "WALLET_ADDRESS" as const,
        confidence: 60,
        reason: "Weak wallet indicator.",
      }));
    },
  };

  const lowConfidenceResolver = new FieldMappingResolver(
    lowConfidenceMapper as any,
  );

  const lowConfidenceFields = [createField(0, "Address")];

  const lowConfidenceResult = lowConfidenceResolver.resolve(
    "WALLET_ADDRESS",
    lowConfidenceFields,
  );

  console.log(JSON.stringify(lowConfidenceResult, null, 2));

  if (lowConfidenceResult.status !== "LOW_CONFIDENCE") {
    throw new Error(
      `Expected LOW_CONFIDENCE, got ${lowConfidenceResult.status}`,
    );
  }

  console.log("✅ Weak candidate → LOW_CONFIDENCE");

  /*
   * ============================================================
   * TEST 4
   * Candidate yang sudah dipakai harus dilewati.
   * ============================================================
   */

  console.log("");
  console.log("▶️ Test 4: used field is excluded");

  const reusedFields = [
    createField(0, "Wallet Address"),
    createField(1, "Backup Wallet Address"),
  ];

  const usedIndexes = new Set<number>([0]);

  const reusedResult = resolver.resolve(
    "WALLET_ADDRESS",
    reusedFields,
    usedIndexes,
  );

  console.log(JSON.stringify(reusedResult, null, 2));

  if (reusedResult.status !== "MATCH") {
    throw new Error(
      `Expected MATCH after excluding used field, got ${reusedResult.status}`,
    );
  }

  if (reusedResult.mapping.field.index !== 1) {
    throw new Error(
      `Expected field index 1, got ${reusedResult.mapping.field.index}`,
    );
  }

  console.log("✅ Already-used field excluded correctly");

  console.log("");
  console.log("🎉 FieldMappingResolver mock test passed.");
}

main().catch((error) => {
  console.error("");
  console.error("❌ FieldMappingResolver mock test failed.");
  console.error(error);
  process.exit(1);
});
