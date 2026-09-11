import { ToolRiskLevel } from "../tools/tool.interface.js";

export type PolicyDecision =
  | "ALLOW"
  | "REQUIRE_APPROVAL"
  | "REQUIRE_STRONG_APPROVAL";

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string;
}

export class PolicyEngine {
  evaluate(riskLevel: ToolRiskLevel): PolicyResult {
    switch (riskLevel) {
      case "SAFE":
        return {
          decision: "ALLOW",
          reason: "Tool dikategorikan sebagai SAFE.",
        };

      case "APPROVAL":
        return {
          decision: "REQUIRE_APPROVAL",
          reason: "Tool membutuhkan persetujuan user sebelum dieksekusi.",
        };

      case "STRONG_APPROVAL":
        return {
          decision: "REQUIRE_STRONG_APPROVAL",
          reason:
            "Tool membutuhkan konfirmasi kuat dari user sebelum dieksekusi.",
        };

      default: {
        const exhaustiveCheck: never = riskLevel;

        return {
          decision: "REQUIRE_STRONG_APPROVAL",
          reason: `Risk level tidak dikenali: ${exhaustiveCheck}`,
        };
      }
    }
  }
}
