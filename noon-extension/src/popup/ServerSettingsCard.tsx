import { useEffect, useState } from "react";
import {
  loadServerSettings,
  saveServerSettings,
  type ServerSettings,
} from "../lib/serverSettings";

const CUSTOM = "custom";

function presetIdFor(settings: ServerSettings, url: string): string {
  const match = settings.presets.find((p) => p.url === url);
  return match ? match.id : CUSTOM;
}

export default function ServerSettingsCard() {
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [choice, setChoice] = useState<string>("");
  const [customUrl, setCustomUrl] = useState<string>("");
  const [pinned, setPinned] = useState<boolean>(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function apply(next: ServerSettings) {
    setSettings(next);
    const id = presetIdFor(next, next.apiBaseUrl);
    setChoice(id);
    setCustomUrl(id === CUSTOM ? next.apiBaseUrl : "");
    setPinned(next.pinned);
  }

  useEffect(() => {
    loadServerSettings()
      .then(apply)
      .catch((error: Error) => setMessage({ kind: "error", text: error.message }));
  }, []);

  if (!settings) {
    return (
      <div className="rounded-xl border border-slate-700 bg-surface/70 p-5 text-sm text-slate-400">
        {message ? message.text : "Loading server settings…"}
      </div>
    );
  }

  const selectedUrl =
    choice === CUSTOM ? customUrl.trim() : settings.presets.find((p) => p.id === choice)?.url || "";
  const dirty = selectedUrl !== settings.apiBaseUrl || pinned !== settings.pinned;
  const locked = settings.runActive;

  async function onSave() {
    setSaving(true);
    setMessage(null);
    try {
      const next = await saveServerSettings(selectedUrl, pinned);
      if (!next.ok) {
        setMessage({ kind: "error", text: next.error || "Could not save" });
        return;
      }
      apply(next);
      setMessage({
        kind: "ok",
        text: next.changed
          ? "Server changed — open its dashboard and click Connect extension."
          : "Saved.",
      });
    } catch (error) {
      setMessage({ kind: "error", text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-surface/70 p-5">
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold text-slate-100">Server</p>
        <span
          className={
            "rounded-full px-2 py-0.5 text-xs " +
            (settings.hasToken ? "bg-emerald-900/60 text-emerald-300" : "bg-slate-700 text-slate-300")
          }
        >
          {settings.hasToken ? "Connected" : "Not connected"}
        </span>
      </div>
      <p className="mt-1 break-all text-xs text-slate-400">
        Current: <span className="text-slate-200">{settings.apiBaseUrl || "—"}</span>
        {settings.pinned ? " · pinned" : ""}
      </p>

      {locked && (
        <p className="mt-3 rounded-md bg-amber-900/40 px-3 py-2 text-xs text-amber-200">
          A run is in progress — the server is locked until it finishes or is stopped.
        </p>
      )}

      <fieldset className="mt-4 space-y-2" disabled={locked || saving}>
        {settings.presets.map((preset) => (
          <label key={preset.id} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="server"
              checked={choice === preset.id}
              onChange={() => setChoice(preset.id)}
            />
            <span className="text-slate-100">{preset.label}</span>
            <span className="text-xs text-slate-500">{preset.url}</span>
          </label>
        ))}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="radio" name="server" checked={choice === CUSTOM} onChange={() => setChoice(CUSTOM)} />
          <span className="text-slate-100">Custom</span>
        </label>
        {choice === CUSTOM && (
          <input
            type="url"
            placeholder="https://your-server.example.com"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            className="w-full rounded-md border border-slate-600 bg-bg px-3 py-1.5 text-sm text-slate-100"
          />
        )}

        <label className="flex cursor-pointer items-start gap-2 pt-2 text-sm">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          <span>
            <span className="text-slate-100">Pin this server</span>
            <span className="block text-xs text-slate-500">
              Only this server's dashboard can connect the extension (other open dashboards are ignored).
            </span>
          </span>
        </label>
      </fieldset>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={locked || saving || !dirty || !selectedUrl}
          className="rounded-md bg-noon px-4 py-1.5 text-sm font-semibold text-slate-900 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {settings.apiBaseUrl && (
          <a
            href={settings.apiBaseUrl + "/"}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-noon underline-offset-2 hover:underline"
          >
            Open dashboard
          </a>
        )}
      </div>

      {message && (
        <p className={"mt-3 text-xs " + (message.kind === "ok" ? "text-emerald-300" : "text-red-300")}>
          {message.text}
        </p>
      )}
    </div>
  );
}
