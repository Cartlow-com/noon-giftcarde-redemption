import type { BatchRow } from "../../lib/api";
import { formatStatus, statusBadge } from "./BatchRowsSelector";

interface BatchRowDetailProps {
  row: BatchRow;
  onClose: () => void;
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div className="grid grid-cols-[90px_1fr] gap-2 py-1 border-b border-slate-700/50 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-200 break-all font-mono text-[11px]">{value}</span>
    </div>
  );
}

export default function BatchRowDetail({ row, onClose }: BatchRowDetailProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-lg border border-slate-600 bg-surface p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-100">Row {row.row_number} details</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1">
          <span className={statusBadge(row.login_status)}>login: {formatStatus(row.login_status)}</span>
          <span className={statusBadge(row.redeem_status)}>redeem: {formatStatus(row.redeem_status)}</span>
          <span className={statusBadge(row.purchase_status)}>order: {formatStatus(row.purchase_status)}</span>
          <span className={statusBadge(row.status)}>{formatStatus(row.status)}</span>
        </div>

        <div className="text-xs space-y-0">
          <DetailRow label="Email" value={row.email} />
          <DetailRow label="Password" value={row.password} />
          <DetailRow label="Gift card" value={row.gift_card_number} />
          <DetailRow label="PIN" value={row.gift_card_pin} />
          <DetailRow label="Product URL" value={row.product_url} />
          <DetailRow label="Quantity" value={row.quantity} />
          <DetailRow label="Order ID" value={row.order_id} />
          <DetailRow label="Login error" value={row.login_error} />
          <DetailRow label="Redeem error" value={row.redeem_error} />
          <DetailRow label="Redeemed at" value={row.redeemed_at} />
          <DetailRow label="Balance before" value={row.balance_before != null ? String(row.balance_before) : null} />
          <DetailRow label="Balance after" value={row.balance_after != null ? String(row.balance_after) : null} />
          <DetailRow label="Balance delta" value={row.balance_delta != null ? String(row.balance_delta) : null} />
          <DetailRow label="Order error" value={row.purchase_error} />
        </div>
      </div>
    </div>
  );
}
