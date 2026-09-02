import { useState } from "react";
import type { BatchRow } from "../../lib/api";
import BatchRowDetail from "./BatchRowDetail";

function formatStatus(status: string): string {
  if (status === "already_redeemed") return "already redeemed";
  return status.replace(/_/g, " ");
}

function statusBadge(status: string): string {
  const base = "inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ";
  switch (status) {
    case "completed":
    case "success":
      return base + "bg-green-500/20 text-green-200";
    case "failed":
      return base + "bg-red-500/20 text-red-200";
    case "already_redeemed":
      return base + "bg-amber-500/20 text-amber-200";
    case "skipped":
      return base + "bg-slate-500/25 text-slate-300";
    case "payment_issue":
      return base + "bg-orange-500/20 text-orange-200";
    case "partial":
      return base + "bg-amber-500/20 text-amber-200";
    case "in_progress":
    case "running":
      return base + "bg-blue-500/20 text-blue-200";
    default:
      return base + "bg-slate-600/40 text-slate-300";
  }
}

interface BatchRowsSelectorProps {
  rows: BatchRow[];
  selectedIds: Set<string>;
  disabled: boolean;
  onToggle: (rowId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}

export default function BatchRowsSelector({
  rows,
  selectedIds,
  disabled,
  onToggle,
  onSelectAll,
  onClear,
}: BatchRowsSelectorProps) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const [detailRow, setDetailRow] = useState<BatchRow | null>(null);

  return (
    <div className="mt-3">
      {detailRow && <BatchRowDetail row={detailRow} onClose={() => setDetailRow(null)} />}

      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-slate-400">
          {selectedIds.size} of {rows.length} selected — click row or checkbox
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled || rows.length === 0}
            onClick={allSelected ? onClear : onSelectAll}
            className="text-[10px] text-noon hover:underline disabled:opacity-40"
          >
            {allSelected ? "Clear" : "Select all"}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto max-h-64 overflow-y-auto rounded border border-slate-700">
        <table className="w-full min-w-[480px] text-[11px] border-collapse">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-slate-400 border-b border-slate-700">
              <th className="py-1 px-1 w-6" />
              <th className="text-left py-1 pr-2">#</th>
              <th className="text-left py-1 pr-2">Email</th>
              <th className="text-left py-1 pr-2">Login</th>
              <th className="text-left py-1 pr-2">Redeem</th>
              <th className="text-left py-1 pr-2">Order</th>
              <th className="text-left py-1 pr-2">Status</th>
              <th className="py-1 px-1 w-8" aria-label="Details" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = selectedIds.has(row.id);
              return (
                <tr
                  key={row.id}
                  onClick={() => !disabled && onToggle(row.id)}
                  className={
                    "border-b border-slate-800 cursor-pointer " +
                    (selected ? "bg-noon/10 text-slate-100" : "text-slate-300 hover:bg-slate-800/50")
                  }
                >
                  <td className="py-1 px-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => onToggle(row.id)}
                      className="accent-[#feee00]"
                    />
                  </td>
                  <td className="py-1 pr-2">{row.row_number}</td>
                  <td className="py-1 pr-2 truncate max-w-[120px]" title={row.email}>
                    {row.email.split("@")[0]}
                  </td>
                  <td className="py-1 pr-2">
                    <span className={statusBadge(row.login_status)}>{formatStatus(row.login_status)}</span>
                  </td>
                  <td className="py-1 pr-2">
                    <span className={statusBadge(row.redeem_status)}>{formatStatus(row.redeem_status)}</span>
                  </td>
                  <td className="py-1 pr-2">
                    <span className={statusBadge(row.purchase_status)}>{formatStatus(row.purchase_status)}</span>
                  </td>
                  <td className="py-1 pr-2">
                    <span className={statusBadge(row.status)}>{formatStatus(row.status)}</span>
                  </td>
                  <td className="py-1 px-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setDetailRow(row)}
                      className="p-1 rounded text-slate-400 hover:text-noon hover:bg-slate-700"
                      title="View row details"
                      aria-label={`View details for row ${row.row_number}`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="w-4 h-4"
                        aria-hidden
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { statusBadge, formatStatus };
