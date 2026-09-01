import { useEffect, useState } from "react";
import {
  clearStoredCredentials,
  getStoredCredentials,
  setStoredCredentials,
} from "../lib/storage";
import type { LoginLogEntry, LoginStatus, RuntimeMessage } from "../types";

function makeLog(message: string): LoginLogEntry {
  return { id: crypto.randomUUID(), message, ts: Date.now() };
}

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [giftCardNumber, setGiftCardNumber] = useState("");
  const [giftCardPin, setGiftCardPin] = useState("");
  const [status, setStatus] = useState<LoginStatus>("idle");
  const [logs, setLogs] = useState<LoginLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStoredCredentials().then((creds) => {
      setEmail(creds.email);
      setPassword(creds.password);
      setGiftCardNumber(creds.giftCardNumber);
      setGiftCardPin(creds.giftCardPin);
    });
  }, []);

  useEffect(() => {
    function onMessage(message: RuntimeMessage) {
      if (message.type === "LOGIN_PROGRESS") {
        setLogs((prev) => [...prev, makeLog(message.message)]);
      }
      if (message.type === "LOGIN_SUCCESS") {
        setStatus("success");
        setLogs((prev) => [...prev, makeLog(message.message)]);
        setError(null);
      }
      if (message.type === "LOGIN_ERROR") {
        setStatus("error");
        setError(message.error);
        setLogs((prev) => [...prev, makeLog("Error: " + message.error)]);
      }
      if (message.type === "LOGIN_CANCELLED") {
        setStatus("cancelled");
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
    });
    setLogs((prev) => [...prev, makeLog("Settings saved locally")]);
  }

  async function handleRun() {
    const trimmedEmail = email.trim();
    const trimmedCard = giftCardNumber.trim();
    const trimmedPin = giftCardPin.trim();

    if (!trimmedEmail || !password) {
      setError("Enter email and password.");
      setStatus("error");
      return;
    }
    if (!trimmedCard || !trimmedPin) {
      setError("Enter gift card number and PIN.");
      setStatus("error");
      return;
    }

    await setStoredCredentials({
      email: trimmedEmail,
      password,
      giftCardNumber: trimmedCard,
      giftCardPin: trimmedPin,
    });
    setStatus("running");
    setError(null);
    setLogs([makeLog("Starting automation…")]);

    chrome.runtime.sendMessage(
      {
        type: "START_NOON_LOGIN",
        email: trimmedEmail,
        password,
        giftCardNumber: trimmedCard,
        giftCardPin: trimmedPin,
      } satisfies RuntimeMessage,
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
    setLogs([]);
    setError(null);
    setStatus("idle");
  }

  const panelClass = "w-full min-h-full p-4 overflow-y-auto bg-bg text-slate-100";

  return (
    <div className={panelClass}>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-noon">Noon Automation</h1>
        <p className="text-xs text-slate-400 mt-1">
          Login if needed, then redeem gift card on noon Credits.
        </p>
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
        <div>
          <label className="block text-xs text-slate-400 mb-1" htmlFor="giftCardNumber">
            Gift card number
          </label>
          <input
            id="giftCardNumber"
            type="text"
            required
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
            required
            value={giftCardPin}
            onChange={(e) => setGiftCardPin(e.target.value)}
            className="w-full px-3 py-2 rounded border border-slate-600 bg-surface text-slate-100 focus:border-noon focus:outline-none"
            placeholder="4 digit pin"
            maxLength={4}
          />
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleRun}
            disabled={status === "running"}
            className="px-4 py-2 rounded bg-noon hover:brightness-95 disabled:opacity-50 text-slate-900 font-semibold"
          >
            {status === "running" ? "Running…" : "Run automation"}
          </button>
          {status === "running" && (
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

      {status === "cancelled" && (
        <p className="mb-3 p-2 rounded text-sm bg-amber-500/15 text-amber-200">
          Automation cancelled.
        </p>
      )}
      {status === "success" && (
        <p className="mb-3 p-2 rounded text-sm bg-green-500/15 text-green-200">
          Done — login skipped if already signed in, gift card submitted.
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
    </div>
  );
}
