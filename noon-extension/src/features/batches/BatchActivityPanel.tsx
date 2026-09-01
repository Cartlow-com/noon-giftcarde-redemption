import type { ActivityEntry } from "./activityTypes";

function stageIcon(stage?: ActivityEntry["stage"]) {
  if (stage === "login") return "🔐";
  if (stage === "redeem") return "🎁";
  if (stage === "order") return "🛒";
  return "•";
}

function statusClass(status: ActivityEntry["status"]) {
  if (status === "active") return "text-blue-200 bg-blue-500/10 border-blue-500/30";
  if (status === "done") return "text-green-200 bg-green-500/10 border-green-500/20";
  if (status === "skipped") return "text-amber-200 bg-amber-500/10 border-amber-500/20";
  if (status === "failed") return "text-red-200 bg-red-500/10 border-red-500/20";
  return "text-slate-300 bg-surface/40 border-slate-600/40";
}

type Props = {
  entries: ActivityEntry[];
  running: boolean;
  stopping: boolean;
  onStop: () => void;
};

export default function BatchActivityPanel({ entries, running, stopping, onStop }: Props) {
  const active = [...entries].reverse().find((e) => e.status === "active");

  if (entries.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-600 bg-surface/50 overflow-hidden">
      {(running || stopping) && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-600 bg-slate-900/60">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
          </span>
          <p className="flex-1 text-xs text-blue-100 font-medium">
            {stopping ? "Stopping…" : active ? active.message : "Processing…"}
          </p>
          {running && !stopping && (
            <button
              type="button"
              onClick={onStop}
              className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-[10px] font-semibold uppercase tracking-wide"
            >
              Stop
            </button>
          )}
        </div>
      )}

      {active && active.detail && (
        <div className="px-3 py-2 border-b border-slate-700/80 bg-blue-950/30">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
            {active.stage === "login" && "Account"}
            {active.stage === "redeem" && "Gift card"}
            {active.stage === "order" && "Product"}
            {!active.stage && "Detail"}
          </p>
          <p className="text-xs text-slate-100 font-mono break-all">{active.detail}</p>
        </div>
      )}

      <div className="p-3">
        <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Activity log</p>
        <ul className="space-y-1.5 max-h-40 overflow-y-auto">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={`text-xs font-mono px-2 py-1.5 rounded border ${statusClass(entry.status)}`}
            >
              <span className="mr-1.5">{stageIcon(entry.stage)}</span>
              {entry.message}
              {entry.detail && entry.status !== "active" && (
                <span className="block mt-0.5 text-[10px] opacity-80 truncate">{entry.detail}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
