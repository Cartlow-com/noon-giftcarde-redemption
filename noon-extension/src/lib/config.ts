export function getApiBaseUrl(): string {
  const url = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "") || "";
  if (!url) {
    throw new Error("VITE_API_BASE_URL is not set — configure noon-extension/.env and rebuild");
  }
  return url;
}
