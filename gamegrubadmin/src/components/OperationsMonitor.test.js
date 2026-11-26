import axios from "axios";
import { render, screen } from "@testing-library/react";
import OperationsMonitor from "./OperationsMonitor";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

const snapshot = {
  generated_at: "2026-10-25T11:00:00.000Z",
  window_minutes: 5,
  metrics: {
    http: {
      requests: 30,
      server_errors: 2,
      error_rate_percent: 6.67,
      average_duration_ms: 82,
      recent_errors: [
        {
          occurred_at: "2026-10-25T10:59:00.000Z",
          request_id: "req-ops-77",
          method: "POST",
          route: "/api/booking",
          status_code: 500,
        },
      ],
    },
    payments: {
      failed_attempts: 3,
      failed: 2,
      expired: 1,
      recent_failures: [
        {
          attempt_id: "attempt-ops-33",
          booking_id: 91,
          status: "failed",
          failure_code: "BAD_GATEWAY",
          request_id: "req-payment-33",
        },
      ],
    },
    scheduler: {
      status: "degraded",
      engines: {
        session_engine: {
          engine_name: "session_engine",
          health: "failing",
          last_run_id: 887,
        },
      },
    },
  },
  alerts: {
    active: [
      {
        alert_type: "api_server_errors",
        severity: "critical",
        summary: "2 server errors in the last 5 minutes.",
        request_id: "req-ops-77",
      },
      {
        alert_type: "cron_failing",
        severity: "critical",
        summary: "Session Engine is failing.",
        job_run_id: 887,
        engine_name: "session_engine",
      },
    ],
  },
  alert_delivery: { configured: true },
};

beforeEach(() => {
  axios.get.mockReset();
});

test("operations monitor shows service metrics and trace identifiers", async () => {
  axios.get.mockResolvedValue({ data: snapshot });

  render(<OperationsMonitor />);

  expect(await screen.findByText("Service health and alerts")).toBeTruthy();
  expect(screen.getByText("2 / 30")).toBeTruthy();
  expect(screen.getByText("3")).toBeTruthy();
  expect(screen.getByText("HTTP 500 · POST /api/booking")).toBeTruthy();
  expect(screen.getByText("req-ops-77")).toBeTruthy();
  expect(screen.getByText("Job run 887 · session_engine")).toBeTruthy();
  expect(screen.getByText("Attempt attempt-ops-33 · BAD_GATEWAY")).toBeTruthy();
  expect(axios.get).toHaveBeenCalledWith(expect.stringContaining("/admin/operations"));
});

test("operations monitor keeps partial data visible when a source is unavailable", async () => {
  axios.get.mockRejectedValue({
    response: {
      data: {
        message: "Payment metrics unavailable.",
        window_minutes: 5,
        metrics: { http: { requests: 4, server_errors: 0 }, payments: {}, scheduler: {} },
        alerts: { active: [] },
      },
    },
  });

  render(<OperationsMonitor />);

  expect((await screen.findByRole("alert")).textContent).toContain("Payment metrics unavailable.");
  expect(screen.getByText("0 / 4")).toBeTruthy();
});
