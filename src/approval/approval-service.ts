import { ApprovalManager, ApprovalRequest } from "./approval-manager.js";
import { ToolRegistry } from "../tools/tool-registry.js";

export class ApprovalService {
  constructor(
    private readonly approvalManager: ApprovalManager,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  getPendingRequests(): ApprovalRequest[] {
    return this.approvalManager.getPendingRequests();
  }

  getRequest(id: string): ApprovalRequest | undefined {
    return this.approvalManager.getRequest(id);
  }

  approve(id: string): ApprovalRequest | undefined {
    return this.approvalManager.approveRequest(id);
  }

  reject(id: string): ApprovalRequest | undefined {
    return this.approvalManager.rejectRequest(id);
  }

  async approveAndExecute(id: string, chatId: number): Promise<string> {
    const request = this.approvalManager.getRequest(id);

    if (!request) {
      return JSON.stringify({
        success: false,
        error: `Approval request "${id}" tidak ditemukan.`,
      });
    }

    if (request.chatId !== chatId) {
      return JSON.stringify({
        success: false,
        error: "Approval request bukan milik chat Telegram ini.",
      });
    }

    if (request.status !== "PENDING") {
      return JSON.stringify({
        success: false,
        error: "Approval request sudah diproses.",
        status: request.status,
      });
    }

    const approvedRequest = this.approvalManager.approveRequest(id);

    if (!approvedRequest) {
      return JSON.stringify({
        success: false,
        error: "Gagal menyetujui approval request.",
      });
    }

    return this.toolRegistry.executeApprovedTool(id);
  }

  rejectForChat(id: string, chatId: number): ApprovalRequest | undefined {
    const request = this.approvalManager.getRequest(id);

    if (!request || request.chatId !== chatId) {
      return undefined;
    }

    return this.approvalManager.rejectRequest(id);
  }
}
