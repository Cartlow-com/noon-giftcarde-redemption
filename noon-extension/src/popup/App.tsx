export default function App() {
  return (
    <div className="w-full min-w-[520px] min-h-full p-5 bg-bg text-slate-100">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-noon">Noon Automation</h1>
        <p className="text-xs text-slate-400 mt-1">Dashboard-controlled automation.</p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-surface/70 p-5">
        <p className="text-base font-semibold text-slate-100">
          Go to dashboard to operate.
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Use http://127.0.0.1:8000/ for uploads, row selection, runs, and stop controls.
        </p>
      </div>
    </div>
  );
}
