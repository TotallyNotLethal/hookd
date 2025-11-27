export const LOGIN_REDIRECT_STORAGE_KEY = 'hookd:auth:loginRedirect';

type RedirectStorage = {
  storage: Storage;
  label: string;
};

const TEST_SUFFIX = ':test';

function isStorageUsable(storage: Storage, label: string): boolean {
  const testKey = `${LOGIN_REDIRECT_STORAGE_KEY}${TEST_SUFFIX}`;
  try {
    storage.setItem(testKey, '1');
    storage.removeItem(testKey);
    return true;
  } catch (err) {
    console.warn(`[Auth] ${label} unavailable for redirect flow:`, err);
    return false;
  }
}

export function resolveLoginRedirectStorage(): RedirectStorage | null {
  if (typeof window === 'undefined') return null;

  const candidates: Array<RedirectStorage> = [];
  try {
    candidates.push({ storage: window.localStorage, label: 'localStorage' });
  } catch (err) {
    console.warn('[Auth] Unable to access localStorage:', err);
  }
  try {
    candidates.push({ storage: window.sessionStorage, label: 'sessionStorage' });
  } catch (err) {
    console.warn('[Auth] Unable to access sessionStorage:', err);
  }

  for (const candidate of candidates) {
    if (isStorageUsable(candidate.storage, candidate.label)) {
      return candidate;
    }
  }

  console.warn('[Auth] No usable web storage found for redirect handling.');
  return null;
}

export function readLoginRedirectFlag(resolved?: RedirectStorage | null): boolean {
  if (typeof window === 'undefined') return false;
  const target = resolved ?? resolveLoginRedirectStorage();
  if (!target) {
    console.warn('[Auth] Redirect flag unavailable because storage is missing.');
    return false;
  }
  try {
    return target.storage.getItem(LOGIN_REDIRECT_STORAGE_KEY) === '1';
  } catch (err) {
    console.warn('[Auth] Failed to read redirect flag from storage:', err);
    return false;
  }
}

export function setLoginRedirectFlag(resolved?: RedirectStorage | null): boolean {
  if (typeof window === 'undefined') return false;
  const target = resolved ?? resolveLoginRedirectStorage();
  if (!target) {
    console.warn('[Auth] Cannot persist redirect flag — storage unavailable.');
    return false;
  }
  try {
    target.storage.setItem(LOGIN_REDIRECT_STORAGE_KEY, '1');
    return true;
  } catch (err) {
    console.warn('[Auth] Failed to write redirect flag to storage:', err);
    return false;
  }
}

export function clearLoginRedirectFlag(resolved?: RedirectStorage | null) {
  if (typeof window === 'undefined') return;
  const target = resolved ?? resolveLoginRedirectStorage();
  if (!target) {
    return;
  }
  try {
    target.storage.removeItem(LOGIN_REDIRECT_STORAGE_KEY);
  } catch (err) {
    console.warn('[Auth] Failed to clear redirect flag from storage:', err);
  }
}
