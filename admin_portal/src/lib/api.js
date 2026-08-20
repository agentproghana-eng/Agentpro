import axios from 'axios';

import {
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
} from './authStorage.js';

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || '/api'
).replace(/\/+$/, '');

const REQUEST_TIMEOUT_MS = 30000;

const API = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
});

// Refresh deliberately bypasses the normal response interceptor.
// Otherwise a rejected refresh request could recursively refresh itself.
const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
});

let refreshPromise = null;

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();

  if (!refreshToken) {
    throw new Error(
      'No refresh credential is available',
    );
  }

  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post('/auth/refresh', {
        refresh_token: refreshToken,
      })
      .then((response) => {
        const accessToken =
          response.data?.data?.access_token;

        if (!accessToken) {
          throw new Error(
            'Refresh response did not contain an access token',
          );
        }

        setAccessToken(accessToken);

        return accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

function redirectToLogin() {
  clearAuthSession();

  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

API.interceptors.request.use((config) => {
  const accessToken = getAccessToken();

  if (
    accessToken &&
    !config.headers.Authorization
  ) {
    config.headers.Authorization =
      `Bearer ${accessToken}`;
  }

  return config;
});

API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const requestUrl = String(
      originalRequest?.url || '',
    );

    const isLoginRequest =
      requestUrl.includes('/auth/login');

    const isRefreshRequest =
      requestUrl.includes('/auth/refresh');

    // A rejected login is an ordinary form error, not a session
    // expiration event.
    if (status !== 401 || isLoginRequest) {
      return Promise.reject(error);
    }

    if (
      originalRequest &&
      !originalRequest._agentProRetried &&
      !isRefreshRequest &&
      getRefreshToken()
    ) {
      originalRequest._agentProRetried = true;

      try {
        const accessToken =
          await refreshAccessToken();

        originalRequest.headers =
          originalRequest.headers || {};

        originalRequest.headers.Authorization =
          `Bearer ${accessToken}`;

        return API(originalRequest);
      } catch (refreshError) {
        const refreshStatus =
          refreshError.response?.status;

        // 5xx/network failures are temporary. Preserve credentials so
        // the user can retry instead of converting an outage into an
        // unnecessary forced logout.
        if (
          !refreshStatus ||
          refreshStatus >= 500
        ) {
          return Promise.reject(refreshError);
        }

        redirectToLogin();

        return Promise.reject(refreshError);
      }
    }

    redirectToLogin();

    return Promise.reject(error);
  },
);

export default API;
