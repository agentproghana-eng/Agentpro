const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user';

const AUTH_KEYS = [
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  USER_KEY,
];

export function getAccessToken() {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  return sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getStoredUser() {
  const raw = sessionStorage.getItem(USER_KEY);

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (_) {
    clearAuthSession();
    return null;
  }
}

export function saveAuthSession({
  accessToken,
  refreshToken,
  user,
}) {
  if (!accessToken || !refreshToken || !user) {
    throw new Error(
      'Complete authentication credentials are required',
    );
  }

  sessionStorage.setItem(
    ACCESS_TOKEN_KEY,
    accessToken,
  );

  sessionStorage.setItem(
    REFRESH_TOKEN_KEY,
    refreshToken,
  );

  sessionStorage.setItem(
    USER_KEY,
    JSON.stringify(user),
  );
}

export function setAccessToken(accessToken) {
  if (!accessToken) {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    return;
  }

  sessionStorage.setItem(
    ACCESS_TOKEN_KEY,
    accessToken,
  );
}

export function clearAuthSession() {
  for (const key of AUTH_KEYS) {
    sessionStorage.removeItem(key);

    // Remove credentials written by the previous persistent-storage
    // implementation without clearing unrelated site preferences.
    localStorage.removeItem(key);
  }
}

export function discardLegacyPersistentAuth() {
  for (const key of AUTH_KEYS) {
    localStorage.removeItem(key);
  }
}
