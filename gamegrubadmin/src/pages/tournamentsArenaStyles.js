export const sectionHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
  marginBottom: 18,
  flexWrap: "wrap",
};

export const sectionTitle = {
  color: "var(--text)",
  fontSize: 24,
  fontWeight: 800,
  marginBottom: 6,
};

export const sectionCopy = {
  color: "var(--text-secondary)",
  lineHeight: 1.6,
  maxWidth: 720,
};

export const errorBanner = {
  marginBottom: 18,
  padding: 16,
  borderRadius: 18,
  background: "var(--tone-danger-bg)",
  border: "1px solid var(--tone-danger-border)",
  color: "var(--tone-danger-text)",
};

export const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
  gap: 18,
};

export const participantGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
  gap: 16,
};

export const card = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: 20,
  borderRadius: 24,
  background: "linear-gradient(180deg, var(--surface), var(--surface-elevated))",
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow-md)",
};

export const participantCard = {
  ...card,
  gap: 14,
  padding: 18,
};

export const cardHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

export const cardTitle = {
  color: "var(--text)",
  fontSize: 22,
  fontWeight: 800,
};

export const cardSubtitle = {
  color: "var(--text-secondary)",
  marginTop: 6,
  lineHeight: 1.5,
};

export const statusPill = {
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid transparent",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

export const chipRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

export const participantToolbar = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

export const chip = (background, borderColor, color) => ({
  padding: "8px 12px",
  borderRadius: 999,
  background,
  border: `1px solid ${borderColor}`,
  color,
  fontSize: 12,
  fontWeight: 700,
});

export const metaGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
  gap: 10,
};

export const metaTile = {
  padding: "14px 16px",
  borderRadius: 18,
  background: "var(--surface-elevated)",
  border: "1px solid var(--border)",
};

export const metaLabel = {
  color: "var(--text-secondary)",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

export const metaValue = {
  color: "var(--text)",
  marginTop: 8,
  lineHeight: 1.55,
  fontWeight: 600,
};

export const copyBlock = {
  padding: "16px 18px",
  borderRadius: 18,
  background: "var(--surface-elevated)",
  border: "1px solid var(--border)",
};

export const copyTitle = {
  color: "var(--text)",
  fontWeight: 700,
  marginBottom: 8,
};

export const copyText = {
  color: "var(--text-secondary)",
  lineHeight: 1.65,
};

export const operationsPanel = {
  marginBottom: 18,
  padding: 18,
  borderRadius: 22,
  background: "var(--surface-elevated)",
  border: "1px solid var(--border)",
};

export const bracketRoundsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
  gap: 16,
};

export const bracketRoundColumn = {
  display: "grid",
  gap: 12,
  alignContent: "start",
};

export const bracketRoundHeader = {
  padding: "14px 16px",
  borderRadius: 18,
  background: "var(--surface-elevated)",
  border: "1px solid var(--border)",
};

export const bracketMatchList = {
  display: "grid",
  gap: 12,
};

export const bracketMatchCard = {
  display: "grid",
  gap: 12,
  padding: "16px 18px",
  borderRadius: 20,
  background: "var(--surface)",
  border: "1px solid var(--border)",
};

export const bracketMatchHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

export const bracketCompetitorList = {
  display: "grid",
  gap: 10,
};

export const bracketCompetitorRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  padding: "12px 14px",
  borderRadius: 16,
  background: "var(--surface-elevated)",
  border: "1px solid var(--border)",
};

export const bracketCompetitorWinner = {
  background: "var(--tone-success-bg)",
  border: "1px solid var(--tone-success-border)",
};

export const bracketCompetitorName = {
  color: "var(--text)",
  fontWeight: 700,
  marginBottom: 4,
};

export const bracketResultComposer = {
  display: "grid",
  gap: 10,
};

export const bracketScoreRow = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
  gap: 10,
};

export const scoreInput = {
  minHeight: 42,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 14,
  fontWeight: 700,
};

export const operationsStageRow = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: 18,
};

export const operationsCopy = {
  color: "var(--text-secondary)",
  lineHeight: 1.6,
  maxWidth: 680,
};

export const seedingBoard = {
  display: "grid",
  gap: 12,
};

export const seedingRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  alignItems: "center",
  padding: "14px 16px",
  borderRadius: 18,
  background: "var(--surface-elevated)",
  border: "1px solid var(--border)",
};

export const seedingTitle = {
  color: "var(--text)",
  fontWeight: 700,
  fontSize: 16,
};

export const seedingControls = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

export const seedInput = {
  width: 88,
  minHeight: 42,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 15,
  fontWeight: 700,
};

export const participantRosterList = {
  display: "grid",
  gap: 10,
};

export const participantRosterItem = {
  padding: "10px 12px",
  borderRadius: 14,
  background: "var(--surface)",
  border: "1px solid var(--border)",
};

export const participantRosterName = {
  color: "var(--text)",
  fontWeight: 700,
  marginBottom: 4,
};

export const notificationCampaignList = {
  display: "grid",
  gap: 12,
};

export const notificationCampaignCard = {
  padding: "16px 18px",
  borderRadius: 20,
  background: "var(--surface-elevated)",
  border: "1px solid var(--border)",
  display: "grid",
  gap: 12,
};

export const footerRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 16,
  flexWrap: "wrap",
  marginTop: "auto",
};

export const footerStats = {
  minWidth: 0,
};

export const footerStatLabel = {
  color: "var(--text-secondary)",
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

export const footerStatValue = {
  color: "var(--text)",
  fontSize: 24,
  fontWeight: 800,
  marginTop: 6,
};

export const participantIdValue = {
  color: "var(--text)",
  fontSize: 20,
  fontWeight: 800,
  marginTop: 6,
};

export const actions = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};
