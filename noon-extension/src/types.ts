export type LoginStatus =
  | "idle"
  | "running"
  | "success"
  | "error"
  | "cancelled"
  | "awaiting_confirm";

export type FlowMode = "giftcard" | "cart";

export type PanelMode = "manual" | "batches";

export interface LoginLogEntry {
  id: string;
  message: string;
  ts: number;
}

export type RuntimeMessage =
  | {
      type: "START_NOON_LOGIN";
      email: string;
      password: string;
      giftCardNumber: string;
      giftCardPin: string;
    }
  | {
      type: "START_NOON_CART";
      email: string;
      password: string;
      productUrl: string;
    }
  | { type: "CANCEL_NOON_LOGIN" }
  | { type: "CONFIRM_PLACE_ORDER"; confirmed: boolean }
  | { type: "LOGIN_PROGRESS"; message: string }
  | { type: "LOGIN_SUCCESS"; message: string }
  | { type: "LOGIN_ERROR"; error: string }
  | { type: "LOGIN_CANCELLED"; message: string }
  | {
      type: "CART_AWAITING_CONFIRM";
      message: string;
      batchMode?: boolean;
      rowNumber?: number;
      productUrl?: string;
    }
  | { type: "START_BATCH_RUN"; batchId: string; rowIds: string[] }
  | { type: "STOP_BATCH_RUN" }
  | { type: "OPEN_WIDE_WINDOW" }
  | {
      type: "BATCH_PROGRESS";
      batchId: string;
      rowId?: string;
      rowNumber?: number;
      message: string;
      stage?: "login" | "redeem" | "order" | "system";
      status?: "active" | "done" | "skipped" | "failed" | "info";
      detail?: string;
    }
  | {
      type: "BATCH_ROW_DONE";
      batchId: string;
      rowId: string;
      rowNumber: number;
      success: boolean;
      message: string;
      stage?: "login" | "redeem" | "order";
      detail?: string;
    }
  | {
      type: "BATCH_COMPLETE";
      batchId: string;
      processed: number;
      cancelled?: boolean;
      message: string;
    }
  | { type: "BATCH_ERROR"; batchId: string; error: string };
