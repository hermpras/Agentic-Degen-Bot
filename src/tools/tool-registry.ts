import { PolicyEngine } from "../policy/policy-engine.js";
import { Tool } from "./tool.interface.js";

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private policyEngine: PolicyEngine;

  constructor(policyEngine: PolicyEngine = new PolicyEngine()) {
    this.policyEngine = policyEngine;
  }

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(
        `⚠️ Tool dengan nama "${tool.name}" sudah terdaftar. Mengganti...`,
      );
    }

    this.tools.set(tool.name, tool);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  async executeTool(name: string, args: Record<string, any>): Promise<string> {
    const tool = this.getTool(name);

    if (!tool) {
      return `Error: Tool dengan nama "${name}" tidak ditemukan di ToolRegistry.`;
    }

    const policy = this.policyEngine.evaluate(tool.riskLevel);

    console.log(
      `🛡️ [PolicyEngine] Tool "${name}" | Risk: ${tool.riskLevel} | Decision: ${policy.decision}`,
    );

    if (policy.decision !== "ALLOW") {
      console.warn(
        `⛔ [ToolRegistry] Tool "${name}" ditahan oleh policy: ${policy.reason}`,
      );

      return JSON.stringify({
        success: false,
        blocked: true,
        tool: name,
        riskLevel: tool.riskLevel,
        decision: policy.decision,
        reason: policy.reason,
      });
    }

    try {
      console.log(
        `🔧 [ToolRegistry] Memanggil tool: ${name} dengan argumen:`,
        args,
      );

      const result = await tool.execute(args);

      return typeof result === "string" ? result : JSON.stringify(result);
    } catch (error: any) {
      console.error(
        `❌ [ToolRegistry] Error saat eksekusi tool ${name}:`,
        error,
      );

      return `Error saat eksekusi tool "${name}": ${
        error.message || String(error)
      }`;
    }
  }
}
