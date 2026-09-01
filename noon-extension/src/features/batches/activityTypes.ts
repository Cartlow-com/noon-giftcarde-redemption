export type ActivityStage = "login" | "redeem" | "order" | "system";
export type ActivityStatus = "active" | "done" | "skipped" | "failed" | "info";

export type ActivityEntry = {
  id: string;
  rowNumber?: number;
  stage?: ActivityStage;
  status: ActivityStatus;
  message: string;
  detail?: string;
};

export function activityFromBatchMessage(msg: {
  type: string;
  message: string;
  rowNumber?: number;
  stage?: ActivityStage;
  status?: ActivityStatus;
  detail?: string;
  success?: boolean;
}): ActivityEntry {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (msg.stage || msg.status) {
    return {
      id,
      rowNumber: msg.rowNumber,
      stage: msg.stage,
      status: msg.status || "info",
      message: msg.message,
      detail: msg.detail,
    };
  }
  if (msg.type === "BATCH_ROW_DONE") {
    return {
      id,
      rowNumber: msg.rowNumber,
      status: msg.success ? "done" : "failed",
      message: msg.message,
      detail: msg.detail,
    };
  }
  if (msg.type === "BATCH_COMPLETE") {
    return { id, stage: "system", status: "info", message: msg.message };
  }
  if (msg.type === "BATCH_ERROR") {
    return { id, stage: "system", status: "failed", message: msg.message };
  }
  return { id, rowNumber: msg.rowNumber, status: "info", message: msg.message };
}
