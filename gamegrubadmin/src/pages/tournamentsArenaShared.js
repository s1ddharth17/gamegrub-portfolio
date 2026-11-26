export const INITIAL_FORM = {
  title: "",
  game_title: "",
  skill_level: "open",
  slug: "",
  format: "solo",
  team_size: "1",
  max_participants: "16",
  entry_fee: "0",
  prize_pool: "0",
  is_sponsored: false,
  sponsor_name: "",
  sponsor_tagline: "",
  sponsor_prize_contribution: "0",
  is_premium: false,
  premium_label: "Premium access",
  premium_entry_fee: "0",
  premium_perks: "",
  refund_policy: "no_refunds",
  refund_cutoff_hours: "24",
  refund_percentage: "100",
  location_label: "GameGrub Arena",
  summary: "",
  description: "",
  rules: "",
  cover_image: "",
  status: "draft",
  is_featured: false,
  start_at: "",
  end_at: "",
  registration_open_at: "",
  registration_close_at: "",
};

export const INITIAL_NOTIFICATION_FORM = {
  title: "",
  message: "",
  recipient_scope: "all_registered",
  send_email: false,
};

export const STATUS_LABELS = {
  draft: "Draft",
  published: "Published",
  cancelled: "Cancelled",
  completed: "Completed",
};

export const STATUS_STYLES = {
  draft: {
    background: "var(--tone-info-bg)",
    border: "var(--tone-info-border)",
    color: "var(--tone-info-text)",
  },
  published: {
    background: "var(--tone-success-bg)",
    border: "var(--tone-success-border)",
    color: "var(--tone-success-text)",
  },
  cancelled: {
    background: "var(--tone-danger-bg)",
    border: "var(--tone-danger-border)",
    color: "var(--tone-danger-text)",
  },
  completed: {
    background: "var(--tone-gold-bg)",
    border: "var(--tone-gold-border)",
    color: "var(--tone-gold-text)",
  },
};

export const PARTICIPANT_STATUS_LABELS = {
  registered: "Registered",
  waitlisted: "Waitlisted",
  cancelled: "Cancelled",
};

export const PARTICIPANT_STATUS_STYLES = {
  registered: {
    background: "var(--tone-success-bg)",
    border: "var(--tone-success-border)",
    color: "var(--tone-success-text)",
  },
  waitlisted: {
    background: "var(--tone-warning-bg)",
    border: "var(--tone-warning-border)",
    color: "var(--tone-warning-text)",
  },
  cancelled: {
    background: "var(--tone-danger-bg)",
    border: "var(--tone-danger-border)",
    color: "var(--tone-danger-text)",
  },
};

export const ATTENDANCE_STATUS_LABELS = {
  pending: "Pending",
  checked_in: "Checked in",
  no_show: "No-show",
  cleared: "Attendance cleared",
};

export const ATTENDANCE_STATUS_STYLES = {
  pending: {
    background: "var(--tone-info-bg)",
    border: "var(--tone-info-border)",
    color: "var(--tone-info-text)",
  },
  checked_in: {
    background: "var(--tone-success-bg)",
    border: "var(--tone-success-border)",
    color: "var(--tone-success-text)",
  },
  no_show: {
    background: "var(--tone-warning-bg)",
    border: "var(--tone-warning-border)",
    color: "var(--tone-warning-text)",
  },
  cleared: {
    background: "var(--tone-neutral-bg)",
    border: "var(--tone-neutral-border)",
    color: "var(--tone-neutral-text)",
  },
};

export const PAYMENT_STATUS_LABELS = {
  pending: "Pending",
  paid: "Paid",
  waived: "Waived",
  not_due: "Not due",
  refunded: "Refunded",
  partially_refunded: "Partial refund",
};

export const PAYMENT_STATUS_STYLES = {
  pending: {
    background: "var(--tone-warning-bg)",
    border: "var(--tone-warning-border)",
    color: "var(--tone-warning-text)",
  },
  paid: {
    background: "var(--tone-success-bg)",
    border: "var(--tone-success-border)",
    color: "var(--tone-success-text)",
  },
  waived: {
    background: "var(--tone-info-bg)",
    border: "var(--tone-info-border)",
    color: "var(--tone-info-text)",
  },
  not_due: {
    background: "var(--tone-neutral-bg)",
    border: "var(--tone-neutral-border)",
    color: "var(--tone-neutral-text)",
  },
  refunded: {
    background: "var(--tone-success-bg)",
    border: "var(--tone-success-border)",
    color: "var(--tone-success-text)",
  },
  partially_refunded: {
    background: "var(--tone-gold-bg)",
    border: "var(--tone-gold-border)",
    color: "var(--tone-gold-text)",
  },
};

export const REFUND_STATUS_LABELS = {
  not_applicable: "Not applicable",
  requested: "Requested",
  processing: "Processing",
  refunded: "Refunded",
  rejected: "Rejected",
};

export const REFUND_STATUS_STYLES = {
  not_applicable: {
    background: "var(--tone-neutral-bg)",
    border: "var(--tone-neutral-border)",
    color: "var(--tone-neutral-text)",
  },
  requested: {
    background: "var(--tone-warning-bg)",
    border: "var(--tone-warning-border)",
    color: "var(--tone-warning-text)",
  },
  processing: {
    background: "var(--tone-gold-bg)",
    border: "var(--tone-gold-border)",
    color: "var(--tone-gold-text)",
  },
  refunded: {
    background: "var(--tone-success-bg)",
    border: "var(--tone-success-border)",
    color: "var(--tone-success-text)",
  },
  rejected: {
    background: "var(--tone-danger-bg)",
    border: "var(--tone-danger-border)",
    color: "var(--tone-danger-text)",
  },
};

export const OPERATIONS_STAGE_LABELS = {
  registrations: "Registrations",
  seeding: "Seeding",
  ready_for_brackets: "Ready for brackets",
};

export const OPERATIONS_STAGE_STYLES = {
  registrations: {
    background: "var(--tone-info-bg)",
    border: "var(--tone-info-border)",
    color: "var(--tone-info-text)",
  },
  seeding: {
    background: "var(--tone-warning-bg)",
    border: "var(--tone-warning-border)",
    color: "var(--tone-warning-text)",
  },
  ready_for_brackets: {
    background: "var(--tone-success-bg)",
    border: "var(--tone-success-border)",
    color: "var(--tone-success-text)",
  },
};

export const BRACKET_MATCH_STATUS_LABELS = {
  pending: "Pending",
  completed: "Completed",
  walkover: "Walkover",
};

export const BRACKET_MATCH_STATUS_STYLES = {
  pending: {
    background: "var(--tone-info-bg)",
    border: "var(--tone-info-border)",
    color: "var(--tone-info-text)",
  },
  completed: {
    background: "var(--tone-success-bg)",
    border: "var(--tone-success-border)",
    color: "var(--tone-success-text)",
  },
  walkover: {
    background: "var(--tone-warning-bg)",
    border: "var(--tone-warning-border)",
    color: "var(--tone-warning-text)",
  },
};

export const NOTIFICATION_SCOPE_LABELS = {
  all_registered: "All registered",
  checked_in: "Checked in",
  eligible_bracket: "Bracket eligible",
  match_players: "Match players",
  waitlisted: "Waitlisted",
};

export const NOTIFICATION_EVENT_LABELS = {
  announcement: "Manual update",
  tournament_published: "Published",
  tournament_cancelled: "Cancelled",
  bracket_ready: "Bracket live",
  match_result: "Match result",
  champion_declared: "Champion",
  waitlist_joined: "Waitlist joined",
  waitlist_promoted: "Waitlist promoted",
};

export function formatCurrency(value) {
  const numeric = Number(value || 0);
  return `Rs ${numeric % 1 === 0 ? numeric.toFixed(0) : numeric.toFixed(2)}`;
}

export function formatDateTime(value) {
  if (!value) {
    return "Not scheduled";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatRefundPolicy(tournament) {
  if (!tournament || Number(tournament.entry_fee || 0) <= 0) {
    return "No entry fee";
  }

  const refundPolicy = String(tournament.refund_policy || "no_refunds")
    .trim()
    .toLowerCase();

  if (refundPolicy === "full_before_cutoff") {
    return `Full refund until ${Number(tournament.refund_cutoff_hours || 24)}h before start`;
  }

  if (refundPolicy === "partial_before_cutoff") {
    return `${Number(tournament.refund_percentage || 0)}% refund until ${Number(
      tournament.refund_cutoff_hours || 24
    )}h before start`;
  }

  return "No automatic refunds";
}

export function toDateTimeInputValue(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export function toFormState(tournament) {
  return {
    title: tournament.title || "",
    game_title: tournament.game_title || "",
    skill_level: tournament.skill_level || "open",
    slug: tournament.slug || "",
    format: tournament.format || "solo",
    team_size: String(tournament.team_size || 1),
    max_participants: String(tournament.max_participants || 16),
    entry_fee: String(tournament.entry_fee ?? 0),
    prize_pool: String(tournament.prize_pool ?? 0),
    is_sponsored: Boolean(tournament.is_sponsored),
    sponsor_name: tournament.sponsor_name || "",
    sponsor_tagline: tournament.sponsor_tagline || "",
    sponsor_prize_contribution: String(tournament.sponsor_prize_contribution ?? 0),
    is_premium: Boolean(tournament.is_premium),
    premium_label: tournament.premium_label || "Premium access",
    premium_entry_fee: String(tournament.premium_entry_fee ?? 0),
    premium_perks: tournament.premium_perks || "",
    refund_policy: tournament.refund_policy || "no_refunds",
    refund_cutoff_hours: String(tournament.refund_cutoff_hours ?? 24),
    refund_percentage: String(tournament.refund_percentage ?? 100),
    location_label: tournament.location_label || "GameGrub Arena",
    summary: tournament.summary || "",
    description: tournament.description || "",
    rules: tournament.rules || "",
    cover_image: tournament.cover_image || "",
    status: tournament.status || "draft",
    is_featured: Boolean(tournament.is_featured),
    start_at: toDateTimeInputValue(tournament.start_at),
    end_at: toDateTimeInputValue(tournament.end_at),
    registration_open_at: toDateTimeInputValue(tournament.registration_open_at),
    registration_close_at: toDateTimeInputValue(tournament.registration_close_at),
  };
}

export function buildPayload(form) {
  return {
    ...form,
    team_size: Number(form.team_size || 0),
    max_participants: Number(form.max_participants || 0),
    entry_fee: Number(form.entry_fee || 0),
    prize_pool: Number(form.prize_pool || 0),
    is_sponsored: Boolean(form.is_sponsored),
    sponsor_name: form.sponsor_name.trim(),
    sponsor_tagline: form.sponsor_tagline.trim(),
    sponsor_prize_contribution: Number(form.sponsor_prize_contribution || 0),
    is_premium: Boolean(form.is_premium),
    premium_label: form.premium_label.trim(),
    premium_entry_fee: Number(form.premium_entry_fee || 0),
    premium_perks: form.premium_perks.trim(),
    refund_policy: form.refund_policy,
    refund_cutoff_hours: Number(form.refund_cutoff_hours || 0),
    refund_percentage: Number(form.refund_percentage || 0),
    cover_image: form.cover_image.trim(),
    slug: form.slug.trim(),
    title: form.title.trim(),
    game_title: form.game_title.trim(),
    skill_level: form.skill_level,
    location_label: form.location_label.trim(),
    summary: form.summary.trim(),
    description: form.description.trim(),
    rules: form.rules.trim(),
    start_at: form.start_at || null,
    end_at: form.end_at || null,
    registration_open_at: form.registration_open_at || null,
    registration_close_at: form.registration_close_at || null,
    is_featured: Boolean(form.is_featured),
  };
}
