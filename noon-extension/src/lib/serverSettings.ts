export interface ServerPreset {
  id: string;
  label: string;
  url: string;
}

export interface ServerSettings {
  ok: boolean;
  error?: string;
  apiBaseUrl: string;
  defaultBase: string;
  pinned: boolean;
  runActive: boolean;
  hasToken: boolean;
  presets: ServerPreset[];
  changed?: boolean;
}

function send<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "Extension not reachable"));
        return;
      }
      resolve(response);
    });
  });
}

export function loadServerSettings(): Promise<ServerSettings> {
  return send<ServerSettings>({ type: "GET_SERVER_SETTINGS" });
}

export function saveServerSettings(apiBaseUrl: string, pinned: boolean): Promise<ServerSettings> {
  return send<ServerSettings>({ type: "SET_SERVER_SETTINGS", apiBaseUrl, pinned });
}
