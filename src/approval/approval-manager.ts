import { randomUUID } from "node:crypto";
import { ToolRiskLevel } from "../tools/tool.interface.js";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ApprovalRequest {
  id: string;
  toolName: string;
  args: Record<string, any>;
  riskLevel: ToolRiskLevel;
  status: ApprovalStatus;
  createdAt: string;
}

export class ApprovalManager {
  private requests: Map<string, ApprovalRequest> = new Map();

  createRequest(
    toolName: string,
    args: Record<string, any>,
    riskLevel: ToolRiskLevel,
  ): ApprovalRequest {
    const request: ApprovalRequest = {
      id: randomUUID(),
      toolName,
      args,
      riskLevel,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    };

    this.requests.set(request.id, request);

    console.log(`⏳ [ApprovalManager] Approval request dibuat: ${request.id}`);

    return request;
  }

  getRequest(id: string): ApprovalRequest | undefined {
    return this.requests.get(id);
  }

  getPendingRequests(): ApprovalRequest[] {
    return Array.from(this.requests.values()).filter(
      (request) => request.status === "PENDING",
    );
  }

  approveRequest(id: string): ApprovalRequest | undefined {
    const request = this.requests.get(id);

    if (!request) {
      return undefined;
    }

    if (request.status !== "PENDING") {
      return request;
    }

    request.status = "APPROVED";

    console.log(
      `✅ [ApprovalManager] Approval request disetujui: ${request.id}`,
    );

    return request;
  }

  rejectRequest(id: string): ApprovalRequest | undefined {
    const request = this.requests.get(id);

    if (!request) {
      return undefined;
    }

    if (request.status !== "PENDING") {
      return request;
    }

    request.status = "REJECTED";

    console.log(`❌ [ApprovalManager] Approval request ditolak: ${request.id}`);

    return request;
  }
}
