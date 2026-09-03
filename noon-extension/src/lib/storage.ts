export interface NoonCredentials {
  email: string;
  password: string;
  giftCardNumber: string;
  giftCardPin: string;
  productUrl: string;
}

const CREDS_KEY = "noon_credentials";
const AUTH_ACCESS_KEY = "noon_access_token";
const AUTH_REFRESH_KEY = "noon_refresh_token";

export interface NoonAuthTokens {
  accessToken: string;
  refreshToken: string;
}

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
        productUrl: typeof stored?.productUrl === "string" ? stored.productUrl : "",
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

export function getStoredAuthTokens(): Promise<NoonAuthTokens> {
  return new Promise((resolve) => {
    chrome.storage.local.get([AUTH_ACCESS_KEY, AUTH_REFRESH_KEY], (data) => {
      resolve({
        accessToken: typeof data[AUTH_ACCESS_KEY] === "string" ? data[AUTH_ACCESS_KEY] : "",
        refreshToken: typeof data[AUTH_REFRESH_KEY] === "string" ? data[AUTH_REFRESH_KEY] : "",
      });
    });
  });
}

export function setStoredAuthTokens(tokens: NoonAuthTokens): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        [AUTH_ACCESS_KEY]: tokens.accessToken,
        [AUTH_REFRESH_KEY]: tokens.refreshToken,
      },
      () => resolve(),
    );
  });
}

export function clearStoredAuthTokens(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove([AUTH_ACCESS_KEY, AUTH_REFRESH_KEY], () => resolve());
  });
}
