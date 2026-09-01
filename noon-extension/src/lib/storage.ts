export interface NoonCredentials {
  email: string;
  password: string;
  giftCardNumber: string;
  giftCardPin: string;
}

const CREDS_KEY = "noon_credentials";

export function getStoredCredentials(): Promise<NoonCredentials> {
  return new Promise((resolve) => {
    chrome.storage.local.get(CREDS_KEY, (data) => {
      const stored = data[CREDS_KEY] as Partial<NoonCredentials> | undefined;
      resolve({
        email: typeof stored?.email === "string" ? stored.email : "",
        password: typeof stored?.password === "string" ? stored.password : "",
        giftCardNumber:
          typeof stored?.giftCardNumber === "string" ? stored.giftCardNumber : "",
        giftCardPin: typeof stored?.giftCardPin === "string" ? stored.giftCardPin : "",
      });
    });
  });
}

export function setStoredCredentials(creds: NoonCredentials): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CREDS_KEY]: creds }, () => resolve());
  });
}

export function clearStoredCredentials(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(CREDS_KEY, () => resolve());
  });
}
