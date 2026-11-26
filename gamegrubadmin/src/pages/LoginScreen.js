import { useState } from "react";
import axios from "axios";

import { setAdminSession } from "../config/adminSession";
import { API_BASE_URL } from "../config/api";

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    login();
  };

  const login = async () => {
    if (!email || !password) {
      setError("Enter your admin email and password.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await axios.post(`${API_BASE_URL}/admin/login`, { email, password });

      setAdminSession({
        token: res.data.token,
        admin: res.data.admin,
      });
      window.location.href = "/dashboard";
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          "Access denied. Check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-auth-page">
      <div className="admin-auth-grid">
        <section className="admin-auth-showcase admin-auth-card">
          <div className="admin-auth-mark">GG</div>
          <div className="admin-auth-eyebrow">GameGrub Control Room</div>
          <h1 className="admin-auth-title">Run the cafe without the clutter.</h1>
          <p className="admin-auth-copy">
            One focused admin workspace for bookings, stations, kitchen flow, billing, and player support.
          </p>
        </section>

        <section className="admin-auth-card admin-auth-card--form">
          <div className="admin-auth-card-kicker">Secure sign in</div>
          <h2 className="admin-auth-card-title">Welcome back</h2>
          <p className="admin-auth-card-copy">
            Use your assigned admin credentials to enter the GameGrub control panel.
          </p>

          <form className="admin-auth-form" onSubmit={handleSubmit}>
            <label className="admin-auth-field">
              <span className="admin-auth-field__label">Admin email</span>
              <input
                type="email"
                autoComplete="username"
                placeholder="admin@gamegrub.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <label className="admin-auth-field">
              <span className="admin-auth-field__label">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            <div className="admin-auth-actions">
              <button type="submit" className="admin-action-button admin-auth-submit" disabled={loading}>
                {loading ? "Signing in..." : "Enter admin panel"}
              </button>
              <div className="admin-auth-hint">Press Enter to sign in faster.</div>
            </div>
          </form>

          {error ? <div className="admin-auth-error">{error}</div> : null}
        </section>
      </div>
    </div>
  );
}

export default LoginScreen;
