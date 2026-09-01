import { useEffect, useState } from "react";
import { listBatchRows, type BatchRow, type BatchSummary } from "../../lib/api";
import BatchRowsSelector, { statusBadge } from "./BatchRowsSelector";

interface BatchCardProps {
  batch: BatchSummary;
  running: boolean;
  listVersion: number;
  autoExpand: boolean;
  onDelete: (id: string) => void;
  onStart: (batchId: string, rowIds: string[]) => void;
}

export default function BatchCard({
  batch,
  running,
  listVersion,
  autoExpand,
  onDelete,
  onStart,
}: BatchCardProps) {
  const [expanded, setExpanded] = useState(autoExpand);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const left = batch.pending_count + batch.in_progress_count;

  async function loadRows() {
    setLoadingRows(true);
    try {
      const data = await listBatchRows(batch.id);
      setRows(data);
      setExpanded(true);
    } finally {
      setLoadingRows(false);
    }
  }

  useEffect(() => {
    if (autoExpand) loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExpand, batch.id]);

  useEffect(() => {
    if (!expanded) return;
    listBatchRows(batch.id).then(setRows);
  }, [listVersion, expanded, batch.id]);

  function toggleRow(rowId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(rows.map((r) => r.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleStart() {
    if (selectedIds.size === 0) return;
    const ordered = rows.filter((r) => selectedIds.has(r.id)).map((r) => r.id);
    onStart(batch.id, ordered);
  }

  return (
    <div
      className={
        "rounded-lg border bg-surface/50 p-3 " +
        (autoExpand ? "border-noon/50" : "border-slate-600")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-100 truncate">{batch.filename}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {new Date(batch.created_at).toLocaleString()}
          </p>
        </div>
        <span className={statusBadge(running ? "running" : batch.status)}>
          {running ? "running" : batch.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-2 text-[10px] text-slate-400">
        <div>
          <span className="text-slate-200 font-semibold">{batch.total_rows}</span> total
        </div>
        <div>
          <span className="text-amber-200 font-semibold">{left}</span> left
        </div>
        <div>
          <span className="text-green-200 font-semibold">{batch.completed_count}</span> done
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        {!expanded ? (
          <button
            type="button"
            onClick={loadRows}
            disabled={loadingRows}
            className="flex-1 px-2 py-1.5 rounded border border-slate-600 text-xs text-slate-200 hover:bg-slate-700"
          >
            {loadingRows ? "Loading…" : "Show rows"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="px-2 py-1.5 rounded border border-slate-600 text-xs text-slate-400"
          >
            Hide
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(batch.id)}
          disabled={running}
          className="px-2 py-1.5 rounded border border-red-800 text-xs text-red-300 hover:bg-red-900/30 disabled:opacity-40"
        >
          Delete
        </button>
      </div>

      {expanded && rows.length > 0 && (
        <>
          <BatchRowsSelector
            rows={rows}
            selectedIds={selectedIds}
            disabled={running}
            onToggle={toggleRow}
            onSelectAll={selectAll}
            onClear={clearSelection}
          />
          <button
            type="button"
            onClick={handleStart}
            disabled={running || selectedIds.size === 0}
            className="w-full mt-3 px-3 py-2 rounded bg-noon text-slate-900 text-sm font-semibold disabled:opacity-40"
          >
            {running
              ? "Running…"
              : `Start selected (${selectedIds.size})`}
          </button>
        </>
      )}
    </div>
  );
}
