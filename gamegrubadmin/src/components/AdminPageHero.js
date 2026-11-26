function AdminPageHero({
  eyebrow,
  title,
  subtitle,
  chips = [],
  badge = null,
  actions = null,
}) {
  return (
    <section className="admin-page-hero admin-surface-hover">
      <div className="admin-page-hero__backdrop" aria-hidden="true" />
      <div className="admin-page-hero__main">
        <div className="admin-page-hero__copy">
          {eyebrow ? <div className="admin-page-hero__eyebrow">{eyebrow}</div> : null}
          <div className="admin-page-hero__title-row">
            <h1 className="admin-page-hero__title">{title}</h1>
            {badge?.label ? (
              <div className="admin-page-hero__badge-chip">{badge.label}</div>
            ) : null}
          </div>
          {subtitle ? <p className="admin-page-hero__subtitle">{subtitle}</p> : null}
          {chips.length ? (
            <div className="admin-page-hero__chips">
              {chips.map((chip) => (
                <div key={chip} className="admin-page-hero__chip">
                  {chip}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="admin-page-hero__aside">
          {actions ? <div className="admin-page-hero__actions">{actions}</div> : null}
          {badge ? (
            <div className="admin-page-hero__badge">
              {badge.title ? <div className="admin-page-hero__badge-label">{badge.title}</div> : null}
              {badge.value !== undefined ? (
                <div className="admin-page-hero__badge-value">{badge.value}</div>
              ) : null}
              {badge.meta ? <div className="admin-page-hero__badge-meta">{badge.meta}</div> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default AdminPageHero;
