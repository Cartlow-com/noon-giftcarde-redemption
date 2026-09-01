import type { RuntimeMessage } from "../types";

export function openWidePanelWindow(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "OPEN_WIDE_WINDOW" } satisfies RuntimeMessage,
      (response: { ok?: boolean; error?: string } | undefined) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.ok === false) {
          reject(new Error(response.error || "Failed to open window"));
          return;
        }
        resolve();
      },
    );
  });
}
