import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkBackendHealth,
  deleteBatch,
  listBatches,
  uploadBatchCsv,
  type BatchSummary,
} from "../../lib/api";
import type { RuntimeMessage } from "../../types";
import BatchCard from "./BatchCard";
import BatchActivityPanel from "./BatchActivityPanel";
import {
  activityFromBatchMessage,
  type ActivityEntry,
} from "./activityTypes";

export default function BatchesPanel() {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [runningBatchId, setRunningBatchId] = useState<string | null>(null);
  const [focusBatchId, setFocusBatchId] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [stopping, setStopping] = useState(false);
  const [placeOrderEnabled, setPlaceOrderEnabled] = useState(true);
  const [sendRedeemEmails, setSendRedeemEmails] = useState(false);
  const [sendOrderEmails, setSendOrderEmails] = useState(false);
  const [placeOrderConfirm, setPlaceOrderConfirm] = useState<{
    message: string;
    rowNumber?: number;
    productUrl?: string;
  } | null>(null);
  const runningBatchIdRef = useRef<string | null>(null);
  runningBatchIdRef.current = runningBatchId;
  const [listVersion, setListVersion] = useState(0);

  const EMAIL_PREFS_KEY = "noon_email_prefs";

  useEffect(() => {
    chrome.storage.local.get(EMAIL_PREFS_KEY, (data) => {
      const prefs = data[EMAIL_PREFS_KEY] as
        | { sendRedeemEmails?: boolean; sendOrderEmails?: boolean }
        | undefined;
      if (prefs) {
        setSendRedeemEmails(!!prefs.sendRedeemEmails);
        setSendOrderEmails(!!prefs.sendOrderEmails);
      }
    });
  }, []);

  function persistEmailPrefs(nextRedeem: boolean, nextOrder: boolean) {
    chrome.storage.local.set({
      [EMAIL_PREFS_KEY]: {
        sendRedeemEmails: nextRedeem,
        sendOrderEmails: nextOrder,
      },
    });
  }

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const healthy = await checkBackendHealth();
      setOnline(healthy);
      if (!healthy) {
        setError("Backend unreachable — check VITE_API_BASE_URL in noon-extension/.env and rebuild");
        return;
      }
      const data = await listBatches();
      setBatches(data);
      setListVersion((v) => v + 1);
    } catch (err) {
      setOnline(false);
      setError(err instanceof Error ? err.message : "Failed to load batches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function pushActivity(msg: Parameters<typeof activityFromBatchMessage>[0]) {
    setActivity((prev) => {
      const withoutActive =
        msg.status === "active"
          ? prev.map((e) => (e.status === "active" ? { ...e, status: "info" as const } : e))
          : prev;
      return [...withoutActive.slice(-49), activityFromBatchMessage(msg)];
    });
  }

  useEffect(() => {
    function onBatchMessage(msg: RuntimeMessage) {
      if (msg.type === "BATCH_PROGRESS") {
        pushActivity(msg);
        refresh();
      }
      if (msg.type === "BATCH_ROW_DONE") {
        pushActivity(msg);
        refresh();
      }
      if (msg.type === "BATCH_COMPLETE") {
        setRunningBatchId(null);
        setStopping(false);
        setMessage(msg.message);
        pushActivity(msg);
        refresh();
      }
      if (msg.type === "BATCH_ERROR") {
        setRunningBatchId(null);
        setStopping(false);
        setPlaceOrderConfirm(null);
        setError(msg.error);
        pushActivity({ type: "BATCH_ERROR", message: msg.error });
        refresh();
      }
      if (
        msg.type === "CART_AWAITING_CONFIRM" &&
        (msg.batchMode || runningBatchIdRef.current)
      ) {
        setPlaceOrderConfirm({
          message: msg.message,
          rowNumber: msg.rowNumber,
          productUrl: msg.productUrl,
        });
        pushActivity({
          type: "BATCH_PROGRESS",
          message: msg.message,
          stage: "order",
          status: "active",
          rowNumber: msg.rowNumber,
          detail: msg.productUrl,
        });
      }
    }

    const listener = (msg: unknown) => {
      if (msg && typeof msg === "object" && "type" in msg) {
        onBatchMessage(msg as RuntimeMessage);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [refresh]);

  function startSelectedRows(batchId: string, rowIds: string[]) {
    if (rowIds.length === 0) return;
    setRunningBatchId(batchId);
    setStopping(false);
    setError(null);
    setActivity([
      activityFromBatchMessage({
        type: "BATCH_PROGRESS",
        message: `Starting ${rowIds.length} selected row(s)…`,
        stage: "system",
        status: "info",
      }),
    ]);
    chrome.runtime.sendMessage(
      {
        type: "START_BATCH_RUN",
        batchId,
        rowIds,
        placeOrder: placeOrderEnabled,
        sendRedeemEmails,
        sendOrderEmails,
      } satisfies RuntimeMessage,
      (response: { ok?: boolean; error?: string } | undefined) => {
        if (chrome.runtime.lastError || (response && response.ok === false)) {
          setRunningBatchId(null);
          setError(
            chrome.runtime.lastError?.message || response?.error || "Failed to start batch",
          );
        }
      },
    );
  }

  function stopBatchRun() {
    setStopping(true);
    setPlaceOrderConfirm(null);
    chrome.runtime.sendMessage({ type: "STOP_BATCH_RUN" } satisfies RuntimeMessage);
  }

  function handlePlaceOrderConfirm(confirmed: boolean) {
    setPlaceOrderConfirm(null);
    pushActivity({
      type: "BATCH_PROGRESS",
      message: confirmed ? "User confirmed Place Order" : "User skipped Place Order",
      stage: "order",
      status: "info",
    });
    chrome.runtime.sendMessage({
      type: "CONFIRM_PLACE_ORDER",
      confirmed,
    } satisfies RuntimeMessage);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    setMessage(null);
    setActivity([]);
    try {
      const batch = await uploadBatchCsv(file);
      setMessage(`Saved ${batch.total_rows} rows to database — select rows and click Start`);
      setFocusBatchId(batch.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(batchId: string) {
    if (!confirm("Delete this batch and all rows?")) return;
    try {
      await deleteBatch(batchId);
      if (focusBatchId === batchId) setFocusBatchId(null);
      setMessage("Batch deleted");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-4">
      {online === true && (
        <p className="text-[10px] text-green-300">Backend connected</p>
      )}
      {online === false && (
        <p className="text-[10px] text-red-300">Backend offline</p>
      )}

      <label className="flex items-start gap-2 rounded-lg border border-slate-600 bg-surface/40 px-3 py-2 text-xs text-slate-300 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 accent-[#FEEE00]"
          checked={placeOrderEnabled}
          disabled={!!runningBatchId}
          onChange={(e) => setPlaceOrderEnabled(e.target.checked)}
        />
        <span>
          <span className="text-slate-100 font-medium">Place order at checkout</span>
          <span className="block text-[10px] text-slate-400 mt-0.5">
            Applies to all rows in the run. Uncheck to stop at checkout without submitting.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 rounded-lg border border-slate-600 bg-surface/40 px-3 py-2 text-xs text-slate-300 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 accent-[#FEEE00]"
          checked={sendRedeemEmails}
          disabled={!!runningBatchId}
          onChange={(e) => {
            const next = e.target.checked;
            setSendRedeemEmails(next);
            persistEmailPrefs(next, sendOrderEmails);
          }}
        />
        <span>
          <span className="text-slate-100 font-medium">Send redeem emails</span>
          <span className="block text-[10px] text-slate-400 mt-0.5">
            On redeem success / already redeemed — emails the Noon row address with screenshots.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 rounded-lg border border-slate-600 bg-surface/40 px-3 py-2 text-xs text-slate-300 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 accent-[#FEEE00]"
          checked={sendOrderEmails}
          disabled={!!runningBatchId}
          onChange={(e) => {
            const next = e.target.checked;
            setSendOrderEmails(next);
            persistEmailPrefs(sendRedeemEmails, next);
          }}
        />
        <span>
          <span className="text-slate-100 font-medium">Send order emails</span>
          <span className="block text-[10px] text-slate-400 mt-0.5">
            On order success — emails order number, product URL, and confirmation screenshot.
          </span>
        </span>
      </label>

      <div className="rounded-lg border border-dashed border-slate-600 p-4 text-center">
        <p className="text-xs text-slate-400 mb-2">
          Upload CSV — rows saved to database. Select rows, then click Start.
        </p>
        <label className="inline-block px-4 py-2 rounded bg-noon text-slate-900 text-sm font-semibold cursor-pointer hover:brightness-95">
          {uploading ? "Saving…" : "Choose CSV"}
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={uploading || !!runningBatchId}
            onChange={handleUpload}
          />
        </label>
      </div>

      {(runningBatchId || stopping) && (
        <BatchActivityPanel
          entries={activity}
          running={!!runningBatchId}
          stopping={stopping}
          onStop={stopBatchRun}
        />
      )}

      {placeOrderConfirm && (
        <div className="p-3 rounded-lg border border-noon/40 bg-noon/10">
          <p className="text-sm text-slate-100 mb-1">{placeOrderConfirm.message}</p>
          {placeOrderConfirm.productUrl && (
            <p className="text-[10px] text-slate-400 font-mono break-all mb-3">
              {placeOrderConfirm.productUrl}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handlePlaceOrderConfirm(true)}
              className="flex-1 px-3 py-2 rounded bg-noon text-slate-900 font-semibold text-sm"
            >
              Place Order
            </button>
            <button
              type="button"
              onClick={() => handlePlaceOrderConfirm(false)}
              className="flex-1 px-3 py-2 rounded border border-slate-500 text-slate-200 text-sm"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {activity.length > 0 && !runningBatchId && !stopping && (
        <BatchActivityPanel entries={activity} running={false} stopping={false} onStop={stopBatchRun} />
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Batches</h2>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="text-xs text-noon hover:underline disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {message && (
        <p className="p-2 rounded text-xs bg-green-500/15 text-green-200">{message}</p>
      )}
      {error && <p className="p-2 rounded text-xs bg-red-500/15 text-red-200">{error}</p>}

      {batches.length === 0 && !loading && (
        <p className="text-xs text-slate-500 text-center py-4">No batches yet</p>
      )}

      <div className="space-y-3">
        {batches.map((batch) => (
          <BatchCard
            key={batch.id}
            batch={batch}
            running={runningBatchId === batch.id}
            listVersion={listVersion}
            autoExpand={batch.id === focusBatchId}
            onDelete={handleDelete}
            onStart={startSelectedRows}
          />
        ))}
      </div>
    </div>
  );
}
