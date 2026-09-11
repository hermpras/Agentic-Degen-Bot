import { ApprovalManager } from "../approval/approval-manager.js";
import { PolicyEngine } from "../policy/policy-engine.js";
import { Tool } from "./tool.interface.js";

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private policyEngine: PolicyEngine;
  private approvalManager: ApprovalManager;

  constructor(
    policyEngine: PolicyEngine = new PolicyEngine(),
    approvalManager: ApprovalManager = new ApprovalManager(),
  ) {
    this.policyEngine = policyEngine;
    this.approvalManager = approvalManager;
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

  getApprovalManager(): ApprovalManager {
    return this.approvalManager;
  }

  async executeTool(
    name: string,
    args: Record<string, any>,
    chatId?: string | number,
  ): Promise<string> {
    const tool = this.getTool(name);

    if (!tool) {
      return `Error: Tool dengan nama "${name}" tidak ditemukan di ToolRegistry.`;
    }

    const policy = this.policyEngine.evaluate(tool.riskLevel);

    console.log(
      `🛡️ [PolicyEngine] Tool "${name}" | Risk: ${tool.riskLevel} | Decision: ${policy.decision}`,
    );

    if (policy.decision !== "ALLOW") {
      if (chatId === undefined) {
        return JSON.stringify({
          success: false,
          blocked: true,
          requiresApproval: true,
          tool: name,
          riskLevel: tool.riskLevel,
          decision: policy.decision,
          reason: "Approval membutuhkan chatId Telegram.",
        });
      }

      const approvalRequest = this.approvalManager.createRequest(
        Number(chatId),
        name,
        args,
        tool.riskLevel,
      );

      console.warn(
        `⛔ [ToolRegistry] Tool "${name}" ditahan. Approval ID: ${approvalRequest.id}`,
      );

      return JSON.stringify({
        success: false,
        blocked: true,
        requiresApproval: true,
        approvalId: approvalRequest.id,
        tool: name,
        riskLevel: tool.riskLevel,
        decision: policy.decision,
        reason: policy.reason,
      });
    }

    return this.executeToolDirect(name, args);
  }

  async executeApprovedTool(approvalId: string): Promise<string> {
    const request = this.approvalManager.getRequest(approvalId);

    if (!request) {
      return JSON.stringify({
        success: false,
        error: `Approval request "${approvalId}" tidak ditemukan.`,
      });
    }

    if (request.status !== "APPROVED") {
      return JSON.stringify({
        success: false,
        error: `Approval request "${approvalId}" belum berstatus APPROVED.`,
        status: request.status,
      });
    }

    const tool = this.getTool(request.toolName);

    if (!tool) {
      return JSON.stringify({
        success: false,
        error: `Tool "${request.toolName}" tidak ditemukan di ToolRegistry.`,
      });
    }

    if (tool.riskLevel !== request.riskLevel) {
      return JSON.stringify({
        success: false,
        error: `Risk level tool "${request.toolName}" berubah setelah approval dibuat.`,
      });
    }

    console.log(
      `✅ [ToolRegistry] Menjalankan approved tool "${request.toolName}" dengan approval ID ${approvalId}`,
    );

    return this.executeToolDirect(request.toolName, request.args);
  }

  private async executeToolDirect(
    name: string,
    args: Record<string, any>,
  ): Promise<string> {
    const tool = this.getTool(name);

    if (!tool) {
      return `Error: Tool dengan nama "${name}" tidak ditemukan di ToolRegistry.`;
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
