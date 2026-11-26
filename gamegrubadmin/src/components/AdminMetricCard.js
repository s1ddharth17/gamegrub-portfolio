function toneClass(tone) {
  switch (tone) {
    case "cool":
    case "success":
      return "success";
    case "warm":
      return "warm";
    case "danger":
      return "danger";
    case "gold":
    case "warning":
      return "warning";
    case "info":
      return "info";
    default:
      return "neutral";
  }
}

function AdminMetricCard({ icon, label, value, hint, tone = "neutral" }) {
  const resolvedTone = toneClass(tone);

  return (
    <article className={`admin-stat-card admin-surface-hover admin-metric-card admin-metric-card--${resolvedTone}`}>
      <div className="admin-metric-card__top">
        <div className={`admin-metric-card__icon admin-metric-card__icon--${resolvedTone}`}>{icon}</div>
        {hint ? <div className="admin-metric-card__hint">{hint}</div> : null}
      </div>
      <div className="admin-metric-card__label">{label}</div>
      <div className="admin-metric-card__value">{value}</div>
    </article>
  );
}

export default AdminMetricCard;
