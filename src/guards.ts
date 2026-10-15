export interface TransferGateState {
  transferStatus: "pending" | "success" | "error" | null;
  approveStatus: "pending" | "success" | "error" | null;
}

export function canStartTransfer(state: TransferGateState): boolean {
  return state.transferStatus !== "pending" && state.approveStatus !== "pending";
}

export interface RetryState extends TransferGateState {
  approveError: string | null;
  approveTxId: string | null;
  transferError: string | null;
  transferTxId: string | null;
}

export function beginRetryTransfer(state: RetryState): boolean {
  if (!canStartTransfer(state)) return false;
  state.transferStatus = "pending";
  state.transferError = null;
  state.transferTxId = null;
  return true;
}

export function beginRetryApprove(state: RetryState): boolean {
  if (!canStartTransfer(state)) return false;
  state.approveStatus = "pending";
  state.approveError = null;
  state.approveTxId = null;
  state.transferStatus = null;
  state.transferError = null;
  state.transferTxId = null;
  return true;
}
