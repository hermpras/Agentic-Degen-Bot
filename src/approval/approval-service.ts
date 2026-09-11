import { ApprovalManager, ApprovalRequest } from "./approval-manager.js";

export class ApprovalService {
  constructor(private readonly approvalManager: ApprovalManager) {}

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
}
