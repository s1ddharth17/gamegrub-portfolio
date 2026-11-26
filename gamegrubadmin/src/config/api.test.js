import {
  API_BASE_URL,
  API_ROOT_URL,
  resolveApiConfig,
  resolveUploadUrl,
} from "./api";

test("exposes normalized root and api URLs", () => {
  expect(API_ROOT_URL.endsWith("/")).toBe(false);
  expect(API_BASE_URL).toBe(`${API_ROOT_URL}/api`);
});

test("resolveUploadUrl preserves absolute URLs and builds relative uploads", () => {
  expect(resolveUploadUrl("menu/burger.png")).toBe(
    `${API_ROOT_URL}/uploads/menu/burger.png`
  );
  expect(resolveUploadUrl("/menu/burger.png")).toBe(
    `${API_ROOT_URL}/uploads/menu/burger.png`
  );
  expect(resolveUploadUrl("uploads/menu/burger.png")).toBe(
    `${API_ROOT_URL}/uploads/menu/burger.png`
  );
  expect(resolveUploadUrl("https://cdn.example.com/menu/burger.png")).toBe(
    "https://cdn.example.com/menu/burger.png"
  );
  expect(resolveUploadUrl("data:image/png;base64,aGVsbG8=")).toBe(
    "data:image/png;base64,aGVsbG8="
  );
});

test("resolveApiConfig prefers same-origin fallback for hosted admin builds", () => {
  const config = resolveApiConfig({
    apiBaseUrl: "",
    apiRootUrl: "",
    browserOrigin: "https://admin.gamegrub.app",
    browserHostname: "admin.gamegrub.app",
  });

  expect(config.apiRootUrl).toBe("https://admin.gamegrub.app");
  expect(config.apiBaseUrl).toBe("https://admin.gamegrub.app/api");
});
