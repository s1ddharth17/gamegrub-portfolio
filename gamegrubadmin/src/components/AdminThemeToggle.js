import { useAdminTheme } from "../theme/AdminThemeContext";

function AdminThemeToggle() {
  const { isDark, toggleTheme } = useAdminTheme();

  return (
    <button
      type="button"
      className="admin-theme-toggle"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={isDark}
    >
      <span className={`admin-theme-toggle__thumb${isDark ? " is-dark" : ""}`}>
        {isDark ? "Dark" : "Light"}
      </span>
      <span className="admin-theme-toggle__icon" aria-hidden="true">
        {isDark ? "DM" : "LM"}
      </span>
    </button>
  );
}

export default AdminThemeToggle;
