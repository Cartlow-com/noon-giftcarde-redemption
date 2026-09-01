import { useEffect, useState } from "react";
import BatchesPanel from "../features/batches/BatchesPanel";
import {
  clearStoredCredentials,
  getStoredCredentials,
  setStoredCredentials,
} from "../lib/storage";
import { openWidePanelWindow } from "../lib/window";
import type { FlowMode, LoginLogEntry, LoginStatus, PanelMode, RuntimeMessage } from "../types";

function makeLog(message: string): LoginLogEntry {
  return { id: crypto.randomUUID(), message, ts: Date.now() };
}

export default function App() {
  const [panelMode, setPanelMode] = useState<PanelMode>("manual");
  const [flowMode, setFlowMode] = useState<FlowMode>("giftcard");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [giftCardNumber, setGiftCardNumber] = useState("");
  const [giftCardPin, setGiftCardPin] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [status, setStatus] = useState<LoginStatus>("idle");
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<LoginLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStoredCredentials().then((creds) => {
      setEmail(creds.email);
      setPassword(creds.password);
      setGiftCardNumber(creds.giftCardNumber);
      setGiftCardPin(creds.giftCardPin);
      setProductUrl(creds.productUrl);
    });
  }, []);

  useEffect(() => {
    function onMessage(message: RuntimeMessage) {
      if (message.type === "LOGIN_PROGRESS") {
        setLogs((prev) => [...prev, makeLog(message.message)]);
      }
      if (message.type === "CART_AWAITING_CONFIRM") {
        setStatus("awaiting_confirm");
        setConfirmMessage(message.message);
        setLogs((prev) => [...prev, makeLog(message.message)]);
      }
      if (message.type === "LOGIN_SUCCESS") {
        setStatus("success");
        setConfirmMessage(null);
        setLogs((prev) => [...prev, makeLog(message.message)]);
        setError(null);
      }
      if (message.type === "LOGIN_ERROR") {
        setStatus("error");
        setConfirmMessage(null);
        setError(message.error);
        setLogs((prev) => [...prev, makeLog("Error: " + message.error)]);
      }
      if (message.type === "LOGIN_CANCELLED") {
        setStatus("cancelled");
        setConfirmMessage(null);
        setError(null);
        setLogs((prev) => [...prev, makeLog(message.message || "Cancelled")]);
      }
    }

    const listener = (msg: unknown) => {
      if (msg && typeof msg === "object" && "type" in msg) {
        onMessage(msg as RuntimeMessage);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await setStoredCredentials({
      email: email.trim(),
      password,
      giftCardNumber: giftCardNumber.trim(),
      giftCardPin: giftCardPin.trim(),
      productUrl: productUrl.trim(),
    });
    setLogs((prev) => [...prev, makeLog("Settings saved locally")]);
  }

  async function handleRun() {
    const trimmedEmail = email.trim();
    const trimmedCard = giftCardNumber.trim();
    const trimmedPin = giftCardPin.trim();
    const trimmedUrl = productUrl.trim();

    if (!trimmedEmail || !password) {
      setError("Enter email and password.");
      setStatus("error");
      return;
    }

    if (flowMode === "giftcard") {
      if (!trimmedCard || !trimmedPin) {
        setError("Enter gift card number and PIN.");
        setStatus("error");
        return;
      }
    } else if (!trimmedUrl || !trimmedUrl.includes("noon.com")) {
      setError("Enter a valid Noon product URL.");
      setStatus("error");
      return;
    }

    await setStoredCredentials({
      email: trimmedEmail,
      password,
      giftCardNumber: trimmedCard,
      giftCardPin: trimmedPin,
      productUrl: trimmedUrl,
    });
    setStatus("running");
    setError(null);
    setConfirmMessage(null);
    setLogs([makeLog("Starting automation…")]);

    const message: RuntimeMessage =
      flowMode === "cart"
        ? {
            type: "START_NOON_CART",
            email: trimmedEmail,
            password,
            productUrl: trimmedUrl,
          }
        : {
            type: "START_NOON_LOGIN",
            email: trimmedEmail,
            password,
            giftCardNumber: trimmedCard,
            giftCardPin: trimmedPin,
          };

    chrome.runtime.sendMessage(
      message,
      (response: { ok?: boolean; error?: string } | undefined) => {
        if (chrome.runtime.lastError) {
          setStatus("error");
          setError(chrome.runtime.lastError.message || "Extension error");
          return;
        }
        if (response && response.ok === false) {
          setStatus("error");
          setError(response.error || "Automation failed");
        }
      },
    );
  }

  async function handleConfirmPlaceOrder(confirmed: boolean) {
    setLogs((prev) => [
      ...prev,
      makeLog(confirmed ? "User confirmed Place Order" : "User skipped Place Order"),
    ]);
    setConfirmMessage(null);
    setStatus("running");
    chrome.runtime.sendMessage({
      type: "CONFIRM_PLACE_ORDER",
      confirmed,
    } satisfies RuntimeMessage);
  }

  async function handleCancel() {
    setLogs((prev) => [...prev, makeLog("Cancelling…")]);
    chrome.runtime.sendMessage({ type: "CANCEL_NOON_LOGIN" } satisfies RuntimeMessage);
  }

  async function handleClear() {
    await clearStoredCredentials();
    setEmail("");
    setPassword("");
    setGiftCardNumber("");
    setGiftCardPin("");
    setProductUrl("");
    setLogs([]);
    setError(null);
    setConfirmMessage(null);
    setStatus("idle");
  }

  const panelClass = "w-full min-w-[520px] min-h-full p-5 overflow-y-auto bg-bg text-slate-100";
  const isBusy = status === "running" || status === "awaiting_confirm";

  return (
    <div className={panelClass}>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-noon">Noon Automation</h1>
          <p className="text-xs text-slate-400 mt-1">
            Login if needed, then run gift card or cart checkout flow.
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            Drag the panel edge to resize, or pop out for a wider view.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openWidePanelWindow().catch(() => {})}
          className="shrink-0 px-2 py-1 rounded border border-slate-600 text-[10px] text-slate-300 hover:bg-slate-700 whitespace-nowrap"
          title="Open in a wider popup window (560px)"
        >
          Pop out ↗
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setPanelMode("manual")}
          className={
            "flex-1 px-3 py-2 rounded text-sm font-medium " +
            (panelMode === "manual"
              ? "bg-noon text-slate-900"
              : "border border-slate-600 text-slate-300")
          }
        >
          Manual
        </button>
        <button
          type="button"
          onClick={() => setPanelMode("batches")}
          className={
            "flex-1 px-3 py-2 rounded text-sm font-medium " +
            (panelMode === "batches"
              ? "bg-noon text-slate-900"
              : "border border-slate-600 text-slate-300")
          }
        >
          Batches
        </button>
      </div>

      {panelMode === "batches" ? (
        <BatchesPanel />
      ) : (
        <>
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setFlowMode("giftcard")}
          className={
            "flex-1 px-3 py-2 rounded text-sm font-medium " +
            (flowMode === "giftcard"
              ? "bg-noon text-slate-900"
              : "border border-slate-600 text-slate-300")
          }
        >
          Gift card
        </button>
        <button
          type="button"
          onClick={() => setFlowMode("cart")}
          className={
            "flex-1 px-3 py-2 rounded text-sm font-medium " +
            (flowMode === "cart"
              ? "bg-noon text-slate-900"
              : "border border-slate-600 text-slate-300")
          }
        >
          Cart
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-3 mb-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded border border-slate-600 bg-surface text-slate-100 focus:border-noon focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded border border-slate-600 bg-surface text-slate-100 focus:border-noon focus:outline-none"
          />
        </div>

        {flowMode === "giftcard" && (
          <>
            <div>
              <label className="block text-xs text-slate-400 mb-1" htmlFor="giftCardNumber">
                Gift card number
              </label>
              <input
                id="giftCardNumber"
                type="text"
                value={giftCardNumber}
                onChange={(e) => setGiftCardNumber(e.target.value)}
                className="w-full px-3 py-2 rounded border border-slate-600 bg-surface text-slate-100 focus:border-noon focus:outline-none"
                placeholder="16 character code"
                maxLength={16}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1" htmlFor="giftCardPin">
                PIN
              </label>
              <input
                id="giftCardPin"
                type="password"
                value={giftCardPin}
                onChange={(e) => setGiftCardPin(e.target.value)}
                className="w-full px-3 py-2 rounded border border-slate-600 bg-surface text-slate-100 focus:border-noon focus:outline-none"
                placeholder="4 digit pin"
                maxLength={4}
              />
            </div>
          </>
        )}

        {flowMode === "cart" && (
          <div>
            <label className="block text-xs text-slate-400 mb-1" htmlFor="productUrl">
              Product URL
            </label>
            <input
              id="productUrl"
              type="url"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              className="w-full px-3 py-2 rounded border border-slate-600 bg-surface text-slate-100 focus:border-noon focus:outline-none text-xs"
              placeholder="https://www.noon.com/uae-en/..."
            />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleRun}
            disabled={isBusy}
            className="px-4 py-2 rounded bg-noon hover:brightness-95 disabled:opacity-50 text-slate-900 font-semibold"
          >
            {status === "running"
              ? "Running…"
              : status === "awaiting_confirm"
                ? "Waiting for you…"
                : "Run automation"}
          </button>
          {isBusy && (
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white font-semibold"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="px-4 py-2 rounded border border-slate-600 bg-surface hover:bg-slate-700 text-slate-200"
          >
            Save settings
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="px-4 py-2 rounded border border-slate-700 text-slate-400 hover:text-slate-200 text-xs"
          >
            Clear all
          </button>
        </div>
      </form>

      {status === "awaiting_confirm" && confirmMessage && (
        <div className="mb-3 p-3 rounded-lg border border-noon/40 bg-noon/10">
          <p className="text-sm text-slate-100 mb-3">{confirmMessage}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleConfirmPlaceOrder(true)}
              className="flex-1 px-3 py-2 rounded bg-noon text-slate-900 font-semibold text-sm"
            >
              Place Order
            </button>
            <button
              type="button"
              onClick={() => handleConfirmPlaceOrder(false)}
              className="flex-1 px-3 py-2 rounded border border-slate-500 text-slate-200 text-sm"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {status === "cancelled" && (
        <p className="mb-3 p-2 rounded text-sm bg-amber-500/15 text-amber-200">
          Automation cancelled.
        </p>
      )}
      {status === "success" && (
        <p className="mb-3 p-2 rounded text-sm bg-green-500/15 text-green-200">
          {flowMode === "cart" ? "Cart flow complete." : "Gift card flow complete."}
        </p>
      )}
      {error && (
        <p className="mb-3 p-2 rounded text-sm bg-red-500/15 text-red-200">{error}</p>
      )}

      {logs.length > 0 && (
        <div className="rounded-lg border border-slate-600 bg-surface/50 p-3">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Activity</p>
          <ul className="space-y-1 max-h-64 overflow-y-auto">
            {logs.map((entry) => (
              <li key={entry.id} className="text-xs text-slate-300 font-mono">
                {entry.message}
              </li>
            ))}
          </ul>
        </div>
      )}
        </>
      )}
    </div>
  );
}
