const API_BASE_KEY = "noon_api_base_url";
const DEFAULT_API_BASE = "http://127.0.0.1:8000";

export function getApiBaseUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(API_BASE_KEY, (data) => {
      const stored = data[API_BASE_KEY];
      resolve(typeof stored === "string" && stored.trim() ? stored.trim() : DEFAULT_API_BASE);
    });
  });
}

export function setApiBaseUrl(url: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [API_BASE_KEY]: url.trim() }, () => resolve());
  });
}
