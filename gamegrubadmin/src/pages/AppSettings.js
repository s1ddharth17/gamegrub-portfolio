import AdminLayout from "../layout/AdminLayout";
import AdminPageHero from "../components/AdminPageHero";
import AdminThemeToggle from "../components/AdminThemeToggle";
import { useAdminTheme } from "../theme/AdminThemeContext";

function AppSettings() {
  const { theme, isDark, setTheme } = useAdminTheme();

  return (
    <AdminLayout>
      <AdminPageHero
        eyebrow="App settings"
        title="Settings"
        subtitle="Manage interface preferences for the admin workspace."
        chips={[
          isDark ? "Dark theme active" : "Light theme active",
          "Theme persists for this browser",
        ]}
        badge={{
          title: "Appearance",
          value: isDark ? "Dark" : "Light",
          meta: "Theme changes apply instantly across the control room.",
          label: "Preference",
        }}
      />

      <section className="dashboard-panel dashboard-panel--wide admin-surface-hover">
        <div className="dashboard-panel__header">
          <div>
            <div className="dashboard-panel__eyebrow">Appearance</div>
            <div className="dashboard-panel__title">Theme mode</div>
            <div className="dashboard-panel__subtitle">
              Switch between light and dark mode from inside app settings instead of the sidebar.
            </div>
          </div>
          <AdminThemeToggle />
        </div>

        <div className="settings-grid">
          <button
            type="button"
            className={`settings-option${theme === "dark" ? " is-active" : ""}`}
            onClick={() => setTheme("dark")}
            aria-pressed={theme === "dark"}
          >
            <span className="settings-option__eyebrow">Dark</span>
            <strong className="settings-option__title">Focused floor control</strong>
            <span className="settings-option__copy">
              Best for long admin sessions with higher contrast panels and reduced glare.
            </span>
          </button>

          <button
            type="button"
            className={`settings-option${theme === "light" ? " is-active" : ""}`}
            onClick={() => setTheme("light")}
            aria-pressed={theme === "light"}
          >
            <span className="settings-option__eyebrow">Light</span>
            <strong className="settings-option__title">Bright ops workspace</strong>
            <span className="settings-option__copy">
              Cleaner for daytime use with softer surfaces and lighter analytics panels.
            </span>
          </button>
        </div>
      </section>
    </AdminLayout>
  );
}

export default AppSettings;
