import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from "axios";

import App from './App';
import {
  clearAdminSession,
  getAdminToken,
  setAdminSession,
} from "./config/adminSession";
import { API_BASE_URL } from "./config/api";
import "./theme.css";
import "./adminTheme.css";

let adminRefreshPromise = null;

function isNgrokUrl(value) {
  return /ngrok(-free)?\.(app|dev)$/i.test(new URL(String(value || "")).hostname);
}

async function refreshAdminSession() {
  if (adminRefreshPromise) {
    return adminRefreshPromise;
  }

  adminRefreshPromise = axios
    .post(
      `${API_BASE_URL}/admin/refresh`,
      {},
      { _skipAdminRefreshHandler: true, withCredentials: true }
    )
    .then((response) => {
      const nextToken = response.data?.token;

      if (!nextToken) {
        throw new Error("Invalid refresh response.");
      }

      setAdminSession({
        token: nextToken,
        admin: response.data?.admin,
      });

      return nextToken;
    })
    .finally(() => {
      adminRefreshPromise = null;
    });

  return adminRefreshPromise;
}

axios.interceptors.request.use((config) => {
  const token = getAdminToken();
  const requestUrl = String(config.url || "");
  config.withCredentials = true;

  if (token) {
    config.headers = config.headers || {};
    if (!config.headers.Authorization && !config.headers.authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  // ngrok free endpoints return a browser warning page unless this header is present.
  if (requestUrl) {
    try {
      if (isNgrokUrl(requestUrl)) {
        config.headers = config.headers || {};
        config.headers["ngrok-skip-browser-warning"] = "true";
      }
    } catch (_) {
      // Ignore malformed URLs and leave the request untouched.
    }
  }

  return config;
});

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalConfig = error.config || {};
    const requestUrl = String(originalConfig.url || "");
    const isLoginRequest = requestUrl.includes("/api/admin/login");
    const isRefreshRequest = requestUrl.includes("/api/admin/refresh");

    if (
      error.response?.status === 401 &&
      !originalConfig._retry &&
      !originalConfig._skipAdminRefreshHandler &&
      !isLoginRequest &&
      !isRefreshRequest
    ) {
      try {
        originalConfig._retry = true;
        const nextToken = await refreshAdminSession();
        originalConfig.headers = originalConfig.headers || {};
        originalConfig.headers.Authorization = `Bearer ${nextToken}`;
        return axios(originalConfig);
      } catch (_) {
        clearAdminSession();
        if (window.location.pathname !== "/") {
          window.location.href = "/";
        }
      }
    } else if (error.response?.status === 401 && !isLoginRequest) {
      clearAdminSession();
      if (window.location.pathname !== "/") {
        window.location.href = "/";
      }
    }

    return Promise.reject(error);
  }
);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
