export type LoginStatus = "idle" | "running" | "success" | "error" | "cancelled";

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
  | { type: "CANCEL_NOON_LOGIN" }
  | { type: "LOGIN_PROGRESS"; message: string }
  | { type: "LOGIN_SUCCESS"; message: string }
  | { type: "LOGIN_ERROR"; error: string }
  | { type: "LOGIN_CANCELLED"; message: string };
