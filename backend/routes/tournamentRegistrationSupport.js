const { query } = require("../utils/db");
const {
  createTournamentNotificationCampaignWithDeliveries,
  buildTournamentNotificationRecipientsFromRegistrations,
} = require("./tournamentRouteSupport");
const { sortRegistrationsForBracketOps } = require("./tournamentBracketSupport");
const {
  TOURNAMENT_NOTIFICATION_EVENT_ANNOUNCEMENT,
  TOURNAMENT_NOTIFICATION_EVENT_WAITLIST_PROMOTED,
  TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED,
  TOURNAMENT_NOTIFICATION_SCOPE_WAITLISTED,
} = require("../utils/tournamentNotifications");
const {
  TOURNAMENT_ATTENDANCE_STATUS_PENDING,
  TOURNAMENT_FORMAT_SOLO,
  TOURNAMENT_OPERATIONS_STAGE_REGISTRATIONS,
  TOURNAMENT_OPERATIONS_STAGE_SEEDING,
  TOURNAMENT_REGISTRATION_STATUS_CANCELLED,
  TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
  TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
  canPromoteWaitlistedTournamentRegistration,
  hasTournamentAvailableSlots,
  normalizeBooleanFlag,
  normalizeTournamentRegistrationStatus,
  serializeTournamentRegistration,
  serializeTournamentRosterMember,
} = require("../utils/tournaments");
const {
  TOURNAMENT_PAYMENT_STATUS_NOT_DUE,
  TOURNAMENT_PAYMENT_STATUS_PAID,
  TOURNAMENT_PAYMENT_STATUS_PENDING,
  TOURNAMENT_PAYMENT_STATUS_WAIVED,
  TOURNAMENT_REFUND_STATUS_NOT_APPLICABLE,
  TOURNAMENT_REFUND_STATUS_REQUESTED,
  buildTournamentPaymentSnapshot,
  buildTournamentRegistrationCharge,
  normalizeTournamentPaymentMethod,
  normalizeTournamentPaymentReference,
  normalizeTournamentPaymentStatus,
} = require("../utils/tournamentPayments");
const {
  serializePersistentTournamentTeamMember,
} = require("../utils/tournamentTeams");

function buildRegistrationMembersFromSavedTeam({ tournament, user, teamMembers = [] }) {
  const errors = [];
  const format = String(tournament.format || "").trim().toLowerCase();
  const teamSize = Math.max(1, Number(tournament.team_size || 1));
  const rosterMembers = (Array.isArray(teamMembers) ? teamMembers : [])
    .map(serializePersistentTournamentTeamMember)
    .sort((left, right) => left.slot_number - right.slot_number);

  if (format === TOURNAMENT_FORMAT_SOLO) {
    errors.push("Solo tournaments cannot use saved teams.");
    return {
      errors,
      members: [],
    };
  }

  if (rosterMembers.length !== teamSize) {
    errors.push(
      `Saved team roster has ${rosterMembers.length} players, but this tournament requires ${teamSize}.`
    );
    return {
      errors,
      members: [],
    };
  }

  const teammates = rosterMembers.filter((member) => !member.is_captain);
  if (teammates.length !== teamSize - 1) {
    errors.push("The saved team roster is missing teammate slots for this tournament.");
    return {
      errors,
      members: [],
    };
  }

  const members = [
    {
      slot_number: 1,
      member_name: user.name,
      member_email: user.email,
      member_mobile: user.mobile || null,
      is_captain: 1,
    },
  ];

  teammates.forEach((member, index) => {
    if (!member.member_name) {
      errors.push(`Saved teammate ${index + 2} name is required.`);
      return;
    }

    members.push({
      slot_number: index + 2,
      member_name: member.member_name,
      member_email: member.member_email || null,
      member_mobile: member.member_mobile || null,
      is_captain: 0,
    });
  });

  return {
    errors,
    members,
  };
}

function buildRegistrationMembers({ tournament, user, roster }) {
  const errors = [];
  const format = String(tournament.format || "").trim().toLowerCase();
  const teamSize = Math.max(1, Number(tournament.team_size || 1));
  const teammates = Array.isArray(roster) ? roster : [];
  const members = [
    {
      slot_number: 1,
      member_name: user.name,
      member_email: user.email,
      member_mobile: user.mobile || null,
      is_captain: 1,
    },
  ];

  if (format === TOURNAMENT_FORMAT_SOLO) {
    if (teammates.length) {
      errors.push("Solo tournaments do not accept teammate roster entries.");
    }

    return {
      errors,
      members,
    };
  }

  const expectedTeammates = Math.max(0, teamSize - 1);
  if (teammates.length !== expectedTeammates) {
    errors.push(`This tournament requires exactly ${expectedTeammates} teammate slots.`);
    return {
      errors,
      members: [],
    };
  }

  teammates.forEach((entry, index) => {
    const memberName = String(entry?.member_name || entry?.name || "").trim();
    const memberEmail = String(entry?.member_email || entry?.email || "").trim();
    const memberMobile = String(entry?.member_mobile || entry?.mobile || "").trim();

    if (!memberName) {
      errors.push(`Teammate ${index + 2} name is required.`);
      return;
    }

    members.push({
      slot_number: index + 2,
      member_name: memberName.slice(0, 120),
      member_email: memberEmail.slice(0, 191),
      member_mobile: memberMobile.slice(0, 32) || null,
      is_captain: 0,
    });
  });

  return {
    errors,
    members,
  };
}

async function replaceTournamentRegistrationMembers(connection, registrationId, members) {
  await connection.query(
    `
      DELETE FROM tournament_registration_members
      WHERE registration_id = ?
    `,
    [registrationId]
  );

  for (const member of members) {
    await connection.query(
      `
        INSERT INTO tournament_registration_members (
          registration_id,
          slot_number,
          member_name,
          member_email,
          member_mobile,
          is_captain,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        registrationId,
        member.slot_number,
        member.member_name,
        member.member_email || null,
        member.member_mobile || null,
        member.is_captain ? 1 : 0,
      ]
    );
  }
}

async function resetTournamentRegistrationAttendance(connection, registrationId) {
  await connection.query(
    `
      UPDATE tournament_registrations
      SET
        attendance_status = ?,
        checked_in_at = NULL,
        checked_in_by = NULL,
        no_show_marked_at = NULL,
        no_show_marked_by = NULL,
        updated_at = NOW()
      WHERE registration_id = ?
    `,
    [TOURNAMENT_ATTENDANCE_STATUS_PENDING, registrationId]
  );
}

async function getTournamentRegistrationPayment(connection, registrationId) {
  const [rows] = await connection.query(
    `
      SELECT *
      FROM tournament_registration_payments
      WHERE registration_id = ?
      LIMIT 1
    `,
    [registrationId]
  );

  return rows[0] || null;
}

function buildTournamentPaymentResetFields({
  tournament,
  registration = {},
  payment = null,
  paymentStatus,
  paymentNotes = "",
}) {
  const charge = buildTournamentRegistrationCharge({
    tournament,
    registration,
    payment,
  });

  return {
    premium_access: charge.premium_access ? 1 : 0,
    amount_due: charge.amount_due,
    premium_access_fee: charge.premium_access_fee,
    premium_access_label: charge.premium_access_label || null,
    amount_paid: 0,
    payment_status: paymentStatus,
    payment_method: null,
    payment_reference: null,
    payment_notes: paymentNotes || null,
    paid_at: null,
    refund_status: TOURNAMENT_REFUND_STATUS_NOT_APPLICABLE,
    refund_requested_amount: 0,
    refund_processed_amount: 0,
    refund_requested_at: null,
    refund_processed_at: null,
    refund_notes: null,
  };
}

async function ensureTournamentRegistrationPaymentRecord(
  connection,
  { tournament, registration, premiumAccess = undefined }
) {
  const registrationId = Number(registration?.registration_id || 0);
  const tournamentId = Number(tournament?.tournament_id || registration?.tournament_id || 0);
  const userId = Number(registration?.user_id || 0);

  if (!registrationId || !tournamentId || !userId) {
    return null;
  }

  const registrationStatus = normalizeTournamentRegistrationStatus(
    registration?.status || registration?.registration_status
  );
  let payment = await getTournamentRegistrationPayment(connection, registrationId);
  const charge = buildTournamentRegistrationCharge({
    tournament,
    registration,
    payment,
    premiumAccess,
  });

  if (!payment) {
    const defaultStatus =
      charge.amount_due <= 0
        ? TOURNAMENT_PAYMENT_STATUS_WAIVED
        : registrationStatus === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED ||
            registrationStatus === TOURNAMENT_REGISTRATION_STATUS_CANCELLED
          ? TOURNAMENT_PAYMENT_STATUS_NOT_DUE
          : TOURNAMENT_PAYMENT_STATUS_PENDING;

    await connection.query(
      `
        INSERT INTO tournament_registration_payments (
          registration_id,
          tournament_id,
          user_id,
          premium_access,
          amount_due,
          premium_access_fee,
          premium_access_label,
          amount_paid,
          payment_status,
          refund_status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NOW(), NOW())
      `,
      [
        registrationId,
        tournamentId,
        userId,
        charge.premium_access ? 1 : 0,
        charge.amount_due,
        charge.premium_access_fee,
        charge.premium_access_label || null,
        defaultStatus,
        TOURNAMENT_REFUND_STATUS_NOT_APPLICABLE,
      ]
    );

    payment = await getTournamentRegistrationPayment(connection, registrationId);
    return payment;
  }

  const currentPaymentStatus = normalizeTournamentPaymentStatus(payment.payment_status);
  let nextPaymentStatus = currentPaymentStatus;
  const hasCapturedPayment = Number(payment.amount_paid || 0) > 0;

  if (charge.amount_due <= 0 && !hasCapturedPayment) {
    nextPaymentStatus = TOURNAMENT_PAYMENT_STATUS_WAIVED;
  } else if (
    (registrationStatus === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED ||
      registrationStatus === TOURNAMENT_REGISTRATION_STATUS_CANCELLED) &&
    !hasCapturedPayment &&
    currentPaymentStatus !== TOURNAMENT_PAYMENT_STATUS_WAIVED
  ) {
    nextPaymentStatus = TOURNAMENT_PAYMENT_STATUS_NOT_DUE;
  } else if (
    registrationStatus === TOURNAMENT_REGISTRATION_STATUS_REGISTERED &&
    !hasCapturedPayment &&
    (currentPaymentStatus === TOURNAMENT_PAYMENT_STATUS_NOT_DUE ||
      currentPaymentStatus === TOURNAMENT_PAYMENT_STATUS_PENDING)
  ) {
    nextPaymentStatus = TOURNAMENT_PAYMENT_STATUS_PENDING;
  }

  if (
    nextPaymentStatus !== currentPaymentStatus ||
    Number(payment.amount_due || 0) !== Number(charge.amount_due || 0) ||
    normalizeBooleanFlag(payment.premium_access, false) !== charge.premium_access ||
    Number(payment.premium_access_fee || 0) !== Number(charge.premium_access_fee || 0) ||
    String(payment.premium_access_label || "") !== String(charge.premium_access_label || "")
  ) {
    await connection.query(
      `
        UPDATE tournament_registration_payments
        SET
          premium_access = ?,
          amount_due = ?,
          premium_access_fee = ?,
          premium_access_label = ?,
          payment_status = ?,
          updated_at = NOW()
        WHERE registration_id = ?
      `,
      [
        charge.premium_access ? 1 : 0,
        charge.amount_due,
        charge.premium_access_fee,
        charge.premium_access_label || null,
        nextPaymentStatus,
        registrationId,
      ]
    );

    payment = await getTournamentRegistrationPayment(connection, registrationId);
  }

  return payment;
}

async function updateTournamentRegistrationPaymentRecord(
  connection,
  registrationId,
  fields = {}
) {
  const updates = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (!updates.length) {
    return getTournamentRegistrationPayment(connection, registrationId);
  }

  await connection.query(
    `
      UPDATE tournament_registration_payments
      SET
        ${updates.map(([key]) => `${key} = ?`).join(", ")},
        updated_at = NOW()
      WHERE registration_id = ?
    `,
    [...updates.map(([, value]) => value), registrationId]
  );

  return getTournamentRegistrationPayment(connection, registrationId);
}

async function markTournamentRegistrationPaid(
  connection,
  { tournament, registrationId, paymentMethod, paymentReference = "", paymentNotes = "" }
) {
  const normalizedMethod = normalizeTournamentPaymentMethod(paymentMethod);
  const normalizedReference = normalizeTournamentPaymentReference(paymentReference);

  if (!normalizedMethod) {
    const error = new Error("A valid tournament payment method is required.");
    error.statusCode = 400;
    throw error;
  }

  if (normalizedMethod !== "cash" && !normalizedReference) {
    const error = new Error("Payment reference is required for non-cash tournament payments.");
    error.statusCode = 400;
    throw error;
  }

  const payment = await getTournamentRegistrationPayment(connection, registrationId);
  const charge = buildTournamentRegistrationCharge({
    tournament,
    payment,
  });

  return updateTournamentRegistrationPaymentRecord(connection, registrationId, {
    premium_access: charge.premium_access ? 1 : 0,
    amount_due: charge.amount_due,
    premium_access_fee: charge.premium_access_fee,
    premium_access_label: charge.premium_access_label || null,
    amount_paid: charge.amount_due,
    payment_status: TOURNAMENT_PAYMENT_STATUS_PAID,
    payment_method: normalizedMethod,
    payment_reference: normalizedReference || null,
    payment_notes: String(paymentNotes || "").trim().slice(0, 500) || null,
    paid_at: new Date(),
  });
}

async function requestTournamentRegistrationRefundIfEligible(
  connection,
  { tournament, registration, payment = null, notes = "" }
) {
  const resolvedPayment =
    payment || (await getTournamentRegistrationPayment(connection, registration.registration_id));
  const snapshot = buildTournamentPaymentSnapshot({
    tournament,
    registration,
    payment: resolvedPayment,
  });

  if (!snapshot.refund_eligible || Number(snapshot.refundable_amount || 0) <= 0) {
    return {
      payment: resolvedPayment,
      refundRequested: false,
      refundableAmount: 0,
    };
  }

  const updatedPayment = await updateTournamentRegistrationPaymentRecord(
    connection,
    registration.registration_id,
    {
      refund_status: TOURNAMENT_REFUND_STATUS_REQUESTED,
      refund_requested_amount: Number(snapshot.refundable_amount || 0),
      refund_requested_at: new Date(),
      refund_notes: String(notes || "").trim().slice(0, 500) || null,
    }
  );

  return {
    payment: updatedPayment,
    refundRequested: true,
    refundableAmount: Number(snapshot.refundable_amount || 0),
  };
}

function formatTournamentPaymentAmount(value) {
  const numeric = Number(value || 0);
  return Number.isInteger(numeric) ? `${numeric}` : numeric.toFixed(2);
}

function normalizeTournamentPaymentAmountInput(value, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(0, Math.round(numeric * 100) / 100);
}

async function createTournamentRegistrationPaymentNotifications(
  connection,
  tournament,
  registrations = [],
  {
    title,
    message,
    sendEmail = false,
    buildRecipientNotification = null,
  } = {}
) {
  const recipients = buildTournamentNotificationRecipientsFromRegistrations(
    tournament,
    registrations
  );

  if (!recipients.length || !String(title || "").trim() || !String(message || "").trim()) {
    return {
      campaign: null,
      notifications: [],
      emailJobs: [],
    };
  }

  return createTournamentNotificationCampaignWithDeliveries(connection, {
    tournamentId: Number(tournament?.tournament_id || 0),
    eventType: TOURNAMENT_NOTIFICATION_EVENT_ANNOUNCEMENT,
    recipientScope: TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED,
    title,
    message,
    sendEmail,
    recipients,
    buildRecipientNotification,
  });
}

async function requestTournamentCancellationRefunds(
  connection,
  tournament,
  { notes = "" } = {}
) {
  const tournamentId = Number(tournament?.tournament_id || 0);
  if (!tournamentId) {
    return {
      registrations: [],
      notificationBatch: {
        campaign: null,
        notifications: [],
        emailJobs: [],
      },
    };
  }

  const [registrationRows] = await connection.query(
    `
      SELECT *
      FROM tournament_registrations
      WHERE tournament_id = ?
      ORDER BY registration_id ASC
    `,
    [tournamentId]
  );

  const refundRegistrationIds = [];

  for (const registration of registrationRows) {
    const payment = await getTournamentRegistrationPayment(
      connection,
      Number(registration.registration_id || 0)
    );
    if (!payment) {
      continue;
    }

    const refundResult = await requestTournamentRegistrationRefundIfEligible(connection, {
      tournament,
      registration,
      payment,
      notes,
    });

    if (refundResult.refundRequested) {
      refundRegistrationIds.push(Number(registration.registration_id || 0));
    }
  }

  if (!refundRegistrationIds.length) {
    return {
      registrations: [],
      notificationBatch: {
        campaign: null,
        notifications: [],
        emailJobs: [],
      },
    };
  }

  const registrations = await hydrateTournamentRegistrations(connection, refundRegistrationIds);
  const notificationBatch = await createTournamentRegistrationPaymentNotifications(
    connection,
    tournament,
    registrations,
    {
      title: `${tournament.title} refund request opened`,
      message:
        "Your tournament entry refund is now queued for review after the event cancellation.",
      sendEmail: true,
      buildRecipientNotification: (recipient) => ({
        title: `${tournament.title} refund request opened`,
        message: `${
          recipient.team_name || recipient.participant_name || "Your entry"
        } is queued for a refund review after the tournament cancellation.`,
      }),
    }
  );

  return {
    registrations,
    notificationBatch,
  };
}

async function attachRegistrationPayments(rows, connection = null) {
  if (!Array.isArray(rows) || !rows.length) {
    return [];
  }

  const registrationIds = rows
    .map((row) => Number(row.registration_id || 0))
    .filter((value) => value > 0);

  if (!registrationIds.length) {
    return rows.map((row) => ({
      ...row,
      ...buildTournamentPaymentSnapshot({
        tournament: row,
        registration: row,
        payment: null,
      }),
    }));
  }

  const tournamentIds = [...new Set(
    rows.map((row) => Number(row.tournament_id || 0)).filter((value) => value > 0)
  )];
  const executor = connection
    ? async (sql, params) => {
        const [resultRows] = await connection.query(sql, params);
        return resultRows;
      }
    : query;
  const registrationPlaceholders = registrationIds.map(() => "?").join(", ");
  const paymentRows = await executor(
    `
      SELECT *
      FROM tournament_registration_payments
      WHERE registration_id IN (${registrationPlaceholders})
    `,
    registrationIds
  );
  const paymentByRegistrationId = new Map(
    paymentRows.map((row) => [Number(row.registration_id || 0), row])
  );
  const tournamentPlaceholders = tournamentIds.map(() => "?").join(", ");
  const tournamentRows = tournamentIds.length
    ? await executor(
        `
          SELECT
            tournament_id,
            status,
            start_at,
            entry_fee,
            is_premium,
            premium_entry_fee,
            premium_label,
            refund_policy,
            refund_cutoff_hours,
            refund_percentage
          FROM tournaments
          WHERE tournament_id IN (${tournamentPlaceholders})
        `,
        tournamentIds
      )
    : [];
  const tournamentById = new Map(
    tournamentRows.map((row) => [Number(row.tournament_id || 0), row])
  );

  return rows.map((row) => ({
    ...row,
    ...buildTournamentPaymentSnapshot({
      tournament: {
        ...tournamentById.get(Number(row.tournament_id || 0)),
        ...row,
      },
      registration: row,
      payment: paymentByRegistrationId.get(Number(row.registration_id || 0)) || null,
    }),
  }));
}

async function attachRegistrationRoster(rows, connection = null) {
  if (!Array.isArray(rows) || !rows.length) {
    return [];
  }

  const registrationIds = rows
    .map((row) => Number(row.registration_id || 0))
    .filter((value) => value > 0);

  if (!registrationIds.length) {
    return rows.map((row) => ({
      ...row,
      roster: [],
    }));
  }

  const executor = connection
    ? async (sql, params) => {
        const [resultRows] = await connection.query(sql, params);
        return resultRows;
      }
    : query;

  const placeholders = registrationIds.map(() => "?").join(", ");
  const rosterRows = await executor(
    `
      SELECT *
      FROM tournament_registration_members
      WHERE registration_id IN (${placeholders})
      ORDER BY registration_id ASC, slot_number ASC, member_id ASC
    `,
    registrationIds
  );

  const rosterByRegistrationId = new Map();

  rosterRows.forEach((row) => {
    const registrationId = Number(row.registration_id || 0);
    if (!rosterByRegistrationId.has(registrationId)) {
      rosterByRegistrationId.set(registrationId, []);
    }

    rosterByRegistrationId.get(registrationId).push(serializeTournamentRosterMember(row));
  });

  return rows.map((row) => ({
    ...row,
    roster: rosterByRegistrationId.get(Number(row.registration_id || 0)) || [],
  }));
}

async function attachRegistrationSeeds(rows, connection = null) {
  if (!Array.isArray(rows) || !rows.length) {
    return [];
  }

  const registrationIds = rows
    .map((row) => Number(row.registration_id || 0))
    .filter((value) => value > 0);

  if (!registrationIds.length) {
    return rows.map((row) => ({
      ...row,
      seed_number: null,
    }));
  }

  const executor = connection
    ? async (sql, params) => {
        const [resultRows] = await connection.query(sql, params);
        return resultRows;
      }
    : query;

  const placeholders = registrationIds.map(() => "?").join(", ");
  const seedRows = await executor(
    `
      SELECT registration_id, seed_number
      FROM tournament_bracket_seeds
      WHERE registration_id IN (${placeholders})
    `,
    registrationIds
  );

  const seedByRegistrationId = new Map(
    seedRows.map((row) => [Number(row.registration_id || 0), Number(row.seed_number || 0)])
  );

  return rows.map((row) => ({
    ...row,
    seed_number: seedByRegistrationId.get(Number(row.registration_id || 0)) || null,
  }));
}

async function attachRegistrationRelations(rows, connection = null) {
  const withRoster = await attachRegistrationRoster(rows, connection);
  const withSeeds = await attachRegistrationSeeds(withRoster, connection);
  return attachRegistrationPayments(withSeeds, connection);
}

async function hydrateTournamentRegistrations(connection, registrationIds = []) {
  const normalizedIds = [...new Set(
    (Array.isArray(registrationIds) ? registrationIds : [])
      .map((value) => Number(value || 0))
      .filter((value) => value > 0)
  )];

  if (!normalizedIds.length) {
    return [];
  }

  const placeholders = normalizedIds.map(() => "?").join(", ");
  const [rows] = await connection.query(
    `
      SELECT *
      FROM tournament_registrations
      WHERE registration_id IN (${placeholders})
    `,
    normalizedIds
  );

  const withRelations = await attachRegistrationRelations(rows, connection);
  return sortRegistrationsForBracketOps(withRelations).map(serializeTournamentRegistration);
}

async function promoteTournamentWaitlistIfPossible(
  connection,
  tournamentId,
  { excludeRegistrationIds = [] } = {}
) {
  const excludedIds = [...new Set(
    (Array.isArray(excludeRegistrationIds) ? excludeRegistrationIds : [])
      .map((value) => Number(value || 0))
      .filter((value) => value > 0)
  )];

  const [tournamentRows] = await connection.query(
    `
      SELECT *
      FROM tournaments
      WHERE tournament_id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [tournamentId]
  );

  const tournament = tournamentRows[0];
  if (!tournament) {
    return [];
  }

  const promotedRegistrationIds = [];

  while (true) {
    const [countRows] = await connection.query(
      `
        SELECT COUNT(*) AS total
        FROM tournament_registrations
        WHERE tournament_id = ?
        AND status = ?
      `,
      [tournamentId, TOURNAMENT_REGISTRATION_STATUS_REGISTERED]
    );

    const activeRegistrationCount = Number(countRows[0]?.total || 0);
    if (!hasTournamentAvailableSlots({ ...tournament, registered_count: activeRegistrationCount })) {
      break;
    }

    const excludedClause = excludedIds.length
      ? `AND registration_id NOT IN (${excludedIds.map(() => "?").join(", ")})`
      : "";
    const [waitlistRows] = await connection.query(
      `
        SELECT *
        FROM tournament_registrations
        WHERE tournament_id = ?
        AND status = ?
        ${excludedClause}
        ORDER BY COALESCE(waitlisted_at, created_at) ASC, registration_id ASC
        LIMIT 1
        FOR UPDATE
      `,
      [
        tournamentId,
        TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
        ...excludedIds,
      ]
    );

    const nextWaitlistedRegistration = waitlistRows[0];
    if (!nextWaitlistedRegistration) {
      break;
    }

    const promotionCandidate = {
      ...tournament,
      registration_status: nextWaitlistedRegistration.status,
    };

    if (
      !canPromoteWaitlistedTournamentRegistration(
        promotionCandidate,
        activeRegistrationCount
      )
    ) {
      break;
    }

    await connection.query(
      `
        UPDATE tournament_registrations
        SET
          status = ?,
          attendance_status = ?,
          checked_in_at = NULL,
          checked_in_by = NULL,
          no_show_marked_at = NULL,
          no_show_marked_by = NULL,
          cancelled_at = NULL,
          waitlist_promoted_at = NOW(),
          updated_at = NOW()
        WHERE registration_id = ?
      `,
      [
        TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
        TOURNAMENT_ATTENDANCE_STATUS_PENDING,
        Number(nextWaitlistedRegistration.registration_id || 0),
      ]
    );

    await ensureTournamentRegistrationPaymentRecord(connection, {
      tournament,
      registration: {
        ...nextWaitlistedRegistration,
        status: TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
      },
    });

    promotedRegistrationIds.push(Number(nextWaitlistedRegistration.registration_id || 0));
    excludedIds.push(Number(nextWaitlistedRegistration.registration_id || 0));
  }

  return hydrateTournamentRegistrations(connection, promotedRegistrationIds);
}

async function createWaitlistPromotionNotifications(connection, tournament, registrations = []) {
  const recipients = buildTournamentNotificationRecipientsFromRegistrations(
    tournament,
    registrations
  );

  if (!recipients.length) {
    return {
      campaign: null,
      notifications: [],
      emailJobs: [],
    };
  }

  return createTournamentNotificationCampaignWithDeliveries(connection, {
    tournamentId: Number(tournament?.tournament_id || 0),
    eventType: TOURNAMENT_NOTIFICATION_EVENT_WAITLIST_PROMOTED,
    recipientScope: TOURNAMENT_NOTIFICATION_SCOPE_WAITLISTED,
    title: `${tournament.title} slot confirmed`,
    message:
      "A tournament slot opened up and your waitlist entry has been promoted into the active field.",
    sendEmail: true,
    recipients,
    buildRecipientNotification: (recipient) => ({
      title: `${tournament.title} slot confirmed`,
      message: `${
        recipient.team_name || recipient.participant_name || "Your entry"
      } is now in the active tournament field. Review the event details and be ready for check-in.`,
    }),
  });
}

async function getTournamentRegistrations(tournamentId) {
  const rows = await query(
    `
      SELECT *
      FROM tournament_registrations
      WHERE tournament_id = ?
      ORDER BY
        CASE WHEN status = ? THEN 0 ELSE 1 END ASC,
        created_at ASC,
        registration_id ASC
    `,
    [tournamentId, TOURNAMENT_REGISTRATION_STATUS_REGISTERED]
  );

  const withRelations = await attachRegistrationRelations(rows);
  return sortRegistrationsForBracketOps(withRelations).map(serializeTournamentRegistration);
}

async function syncTournamentOperationsStageForRegistrationChanges(
  connection,
  tournamentId,
  actorAdminId = null
) {
  await connection.query(
    `
      DELETE tbs
      FROM tournament_bracket_seeds tbs
      LEFT JOIN tournament_registrations tr
        ON tr.registration_id = tbs.registration_id
        AND tr.tournament_id = tbs.tournament_id
      WHERE tbs.tournament_id = ?
      AND (tr.registration_id IS NULL OR tr.status <> ?)
    `,
    [tournamentId, TOURNAMENT_REGISTRATION_STATUS_REGISTERED]
  );

  const [seedCountRows] = await connection.query(
    `
      SELECT COUNT(*) AS total
      FROM tournament_bracket_seeds
      WHERE tournament_id = ?
    `,
    [tournamentId]
  );

  const seededCount = Number(seedCountRows[0]?.total || 0);

  await connection.query(
    `
      UPDATE tournaments
      SET
        operations_stage = ?,
        bracket_handoff_at = NULL,
        bracket_handoff_by = NULL,
        updated_by = COALESCE(?, updated_by),
        updated_at = NOW()
      WHERE tournament_id = ?
    `,
    [
      seededCount > 0
        ? TOURNAMENT_OPERATIONS_STAGE_SEEDING
        : TOURNAMENT_OPERATIONS_STAGE_REGISTRATIONS,
      actorAdminId,
      tournamentId,
    ]
  );
}

module.exports = {
  attachRegistrationPayments,
  attachRegistrationRelations,
  buildRegistrationMembers,
  buildRegistrationMembersFromSavedTeam,
  buildTournamentPaymentResetFields,
  createTournamentRegistrationPaymentNotifications,
  createWaitlistPromotionNotifications,
  ensureTournamentRegistrationPaymentRecord,
  formatTournamentPaymentAmount,
  getTournamentRegistrationPayment,
  getTournamentRegistrations,
  hydrateTournamentRegistrations,
  markTournamentRegistrationPaid,
  normalizeTournamentPaymentAmountInput,
  promoteTournamentWaitlistIfPossible,
  replaceTournamentRegistrationMembers,
  requestTournamentCancellationRefunds,
  requestTournamentRegistrationRefundIfEligible,
  resetTournamentRegistrationAttendance,
  syncTournamentOperationsStageForRegistrationChanges,
  updateTournamentRegistrationPaymentRecord,
};
