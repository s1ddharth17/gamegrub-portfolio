const DEFAULT_LOCAL_ROOT_URL = "http://localhost:3001";

function getBuildEnvValue(viteKey, legacyKey) {
  const viteEnv = import.meta.env || {};
  const processEnv =
    typeof process !== "undefined" && process.env ? process.env : {};

  return viteEnv[viteKey] || processEnv[legacyKey] || "";
}

function normalizeRootUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeApiBaseUrl(value) {
  const normalized = normalizeRootUrl(value);
  return normalized.endsWith("/api") ? normalized : `${normalized}/api`;
}

function isLocalHostname(hostname) {
  const normalized = String(hostname || "").trim().toLowerCase();
  return (
    !normalized ||
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".local")
  );
}

export function resolveApiConfig({
  apiBaseUrl = getBuildEnvValue("VITE_API_BASE_URL", "REACT_APP_API_BASE_URL"),
  apiRootUrl = getBuildEnvValue("VITE_API_ROOT_URL", "REACT_APP_API_ROOT_URL"),
  browserOrigin = typeof window !== "undefined" ? window.location.origin : "",
  browserHostname = typeof window !== "undefined" ? window.location.hostname : "",
} = {}) {
  const normalizedBaseUrl = normalizeRootUrl(apiBaseUrl);
  const normalizedRootUrl = normalizeRootUrl(apiRootUrl);
  const normalizedBrowserOrigin = normalizeRootUrl(browserOrigin);
  const sameOriginFallback =
    normalizedBrowserOrigin && !isLocalHostname(browserHostname)
      ? normalizedBrowserOrigin
      : DEFAULT_LOCAL_ROOT_URL;

  const resolvedRootUrl = normalizedRootUrl
    ? normalizedRootUrl
    : normalizedBaseUrl
      ? normalizeApiBaseUrl(normalizedBaseUrl).replace(/\/api$/, "")
      : sameOriginFallback;

  return {
    apiRootUrl: resolvedRootUrl,
    apiBaseUrl: normalizedBaseUrl
      ? normalizeApiBaseUrl(normalizedBaseUrl)
      : `${resolvedRootUrl}/api`,
  };
}

const resolvedConfig = resolveApiConfig();

export const API_BASE_URL = resolvedConfig.apiBaseUrl;
export const API_ROOT_URL = resolvedConfig.apiRootUrl;

export function resolveUploadUrl(image) {
  if (!image) {
    return "";
  }

  const normalized = String(image).trim();

  if (/^(https?:\/\/|data:|blob:)/i.test(normalized)) {
    return normalized;
  }

  const sanitized = normalized.replace(/^\/+/, "");
  if (/^uploads\//i.test(sanitized)) {
    return `${API_ROOT_URL}/${sanitized}`;
  }

  return `${API_ROOT_URL}/uploads/${sanitized}`;
}
