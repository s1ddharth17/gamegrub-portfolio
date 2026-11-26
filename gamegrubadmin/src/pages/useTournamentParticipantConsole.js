import { useEffect, useMemo, useState } from "react";
import axios from "axios";

import { API_BASE_URL } from "../config/api";
import {
  INITIAL_NOTIFICATION_FORM,
  OPERATIONS_STAGE_LABELS,
} from "./tournamentsArenaShared";

function participantLabelFor(registration) {
  return (
    registration.team_name ||
    registration.participant_name ||
    registration.participant_email ||
    "this participant"
  );
}

function createEmptyMatchDraft() {
  return {
    slot_one_score: "",
    slot_two_score: "",
    notes: "",
  };
}

function useTournamentParticipantConsole({ tournaments, loadTournaments }) {
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);
  const [selectedTournamentSnapshot, setSelectedTournamentSnapshot] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [registrationLoading, setRegistrationLoading] = useState(false);
  const [registrationSavingId, setRegistrationSavingId] = useState(null);
  const [registrationFilter, setRegistrationFilter] = useState("all");
  const [attendanceFilter, setAttendanceFilter] = useState("all");
  const [registrationSearch, setRegistrationSearch] = useState("");
  const [registrationError, setRegistrationError] = useState("");
  const [seedDrafts, setSeedDrafts] = useState({});
  const [seedingSaving, setSeedingSaving] = useState(false);
  const [operationsSaving, setOperationsSaving] = useState(false);
  const [bracket, setBracket] = useState(null);
  const [bracketLoading, setBracketLoading] = useState(false);
  const [bracketSaving, setBracketSaving] = useState(false);
  const [matchResultSavingId, setMatchResultSavingId] = useState(null);
  const [matchDrafts, setMatchDrafts] = useState({});
  const [notificationCampaigns, setNotificationCampaigns] = useState([]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationSending, setNotificationSending] = useState(false);
  const [notificationForm, setNotificationForm] = useState(INITIAL_NOTIFICATION_FORM);
  const [mailDeliveryAvailable, setMailDeliveryAvailable] = useState(false);

  const loadRegistrations = async (tournamentId) => {
    try {
      setRegistrationLoading(true);
      setRegistrationError("");
      const response = await axios.get(
        `${API_BASE_URL}/tournament/admin/${tournamentId}/registrations`
      );
      setSelectedTournamentId(tournamentId);
      setSelectedTournamentSnapshot(response.data?.tournament || null);
      setRegistrations(Array.isArray(response.data?.registrations) ? response.data.registrations : []);
    } catch (requestError) {
      setRegistrationError(
        requestError.response?.data?.error || "Unable to load tournament participants."
      );
    } finally {
      setRegistrationLoading(false);
    }
  };

  const loadBracket = async (tournamentId) => {
    try {
      setBracketLoading(true);
      setRegistrationError("");
      const response = await axios.get(`${API_BASE_URL}/tournament/admin/${tournamentId}/bracket`);
      setBracket(response.data?.bracket || null);
      if (response.data?.tournament) {
        setSelectedTournamentSnapshot(response.data.tournament);
      }
    } catch (requestError) {
      setRegistrationError(
        requestError.response?.data?.error || "Unable to load tournament bracket."
      );
      setBracket(null);
    } finally {
      setBracketLoading(false);
    }
  };

  const loadNotificationCampaigns = async (tournamentId) => {
    try {
      setNotificationLoading(true);
      setRegistrationError("");
      const response = await axios.get(
        `${API_BASE_URL}/tournament/admin/${tournamentId}/notifications`
      );
      setNotificationCampaigns(
        Array.isArray(response.data?.campaigns) ? response.data.campaigns : []
      );
      setMailDeliveryAvailable(Boolean(response.data?.mail_delivery_available));
    } catch (requestError) {
      setRegistrationError(
        requestError.response?.data?.error || "Unable to load tournament updates."
      );
      setNotificationCampaigns([]);
    } finally {
      setNotificationLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedTournamentId) {
      setSeedDrafts({});
      return;
    }

    setSeedDrafts(
      registrations.reduce((accumulator, registration) => {
        accumulator[registration.registration_id] =
          registration.seed_number === null || registration.seed_number === undefined
            ? ""
            : String(registration.seed_number);
        return accumulator;
      }, {})
    );
  }, [registrations, selectedTournamentId]);

  useEffect(() => {
    if (!selectedTournamentId || !bracket?.rounds?.length) {
      setMatchDrafts({});
      return;
    }

    const nextDrafts = {};
    bracket.rounds.forEach((round) => {
      round.matches.forEach((match) => {
        nextDrafts[match.match_id] = {
          slot_one_score:
            match.slot_one_score === null || match.slot_one_score === undefined
              ? ""
              : String(match.slot_one_score),
          slot_two_score:
            match.slot_two_score === null || match.slot_two_score === undefined
              ? ""
              : String(match.slot_two_score),
          notes: match.notes || "",
        };
      });
    });

    setMatchDrafts(nextDrafts);
  }, [bracket, selectedTournamentId]);

  const selectedTournament = useMemo(() => {
    if (!selectedTournamentId) {
      return null;
    }

    return (
      tournaments.find((item) => item.tournament_id === selectedTournamentId) ||
      selectedTournamentSnapshot ||
      null
    );
  }, [selectedTournamentId, selectedTournamentSnapshot, tournaments]);

  const participantCounts = useMemo(
    () => ({
      all: registrations.length,
      registered: registrations.filter((item) => item.status === "registered").length,
      waitlisted: registrations.filter((item) => item.status === "waitlisted").length,
      cancelled: registrations.filter((item) => item.status === "cancelled").length,
      pending: registrations.filter(
        (item) => item.status === "registered" && item.attendance_status === "pending"
      ).length,
      checkedIn: registrations.filter(
        (item) => item.status === "registered" && item.attendance_status === "checked_in"
      ).length,
      noShow: registrations.filter(
        (item) => item.status === "registered" && item.attendance_status === "no_show"
      ).length,
      paymentPending: registrations.filter((item) => item.payment_status === "pending").length,
      paid: registrations.filter((item) => item.payment_status === "paid").length,
      refundOpen: registrations.filter((item) =>
        ["requested", "processing"].includes(item.refund_status)
      ).length,
    }),
    [registrations]
  );

  const filteredRegistrations = useMemo(() => {
    const term = registrationSearch.trim().toLowerCase();

    return registrations.filter((registration) => {
      const rosterSearchText = Array.isArray(registration.roster)
        ? registration.roster
            .map((member) =>
              [member.member_name, member.member_email, member.member_mobile]
                .filter(Boolean)
                .join(" ")
            )
            .join(" ")
        : "";
      const matchesFilter =
        registrationFilter === "all" ? true : registration.status === registrationFilter;
      const attendanceKey =
        registration.status === "registered"
          ? registration.attendance_status || "pending"
          : "cleared";
      const matchesAttendance =
        attendanceFilter === "all" ? true : attendanceKey === attendanceFilter;
      const matchesSearch =
        !term ||
        [
          registration.team_name,
          registration.participant_name,
          registration.participant_email,
          registration.participant_mobile,
          registration.registration_type,
          registration.status,
          registration.attendance_status,
          registration.payment_status,
          registration.refund_status,
          rosterSearchText,
        ]
          .join(" ")
          .toLowerCase()
          .includes(term);

      return matchesFilter && matchesAttendance && matchesSearch;
    });
  }, [attendanceFilter, registrationFilter, registrationSearch, registrations]);

  const activeRegistrations = useMemo(
    () => registrations.filter((registration) => registration.status === "registered"),
    [registrations]
  );

  const eligibleBracketRegistrations = useMemo(
    () =>
      activeRegistrations.filter((registration) => registration.attendance_status !== "no_show"),
    [activeRegistrations]
  );

  const seededCount = useMemo(
    () =>
      activeRegistrations.filter((registration) => Number(registration.seed_number || 0) > 0)
        .length,
    [activeRegistrations]
  );

  const bracketRounds = useMemo(
    () => (Array.isArray(bracket?.rounds) ? bracket.rounds : []),
    [bracket]
  );

  const currentBracketRoundLabel = useMemo(() => {
    const firstPendingRound = bracketRounds.find(
      (round) =>
        Array.isArray(round.matches) && round.matches.some((match) => !match.is_decided)
    );

    return firstPendingRound?.label || (bracketRounds.length ? "Bracket complete" : "Not generated");
  }, [bracketRounds]);

  const seedingRegistrations = useMemo(() => {
    return [...activeRegistrations].sort((left, right) => {
      const leftDraft = Number(seedDrafts[left.registration_id] || left.seed_number || 0);
      const rightDraft = Number(seedDrafts[right.registration_id] || right.seed_number || 0);

      if (leftDraft && rightDraft && leftDraft !== rightDraft) {
        return leftDraft - rightDraft;
      }

      if (leftDraft && !rightDraft) {
        return -1;
      }

      if (!leftDraft && rightDraft) {
        return 1;
      }

      return left.registration_id - right.registration_id;
    });
  }, [activeRegistrations, seedDrafts]);

  const refreshParticipantContext = async (
    tournamentId,
    {
      registrations: shouldReloadRegistrations = false,
      bracket: shouldReloadBracket = false,
      notifications: shouldReloadNotifications = false,
    } = {}
  ) => {
    const tasks = [];

    if (shouldReloadRegistrations) {
      tasks.push(loadRegistrations(tournamentId));
    }

    if (shouldReloadBracket) {
      tasks.push(loadBracket(tournamentId));
    }

    if (shouldReloadNotifications) {
      tasks.push(loadNotificationCampaigns(tournamentId));
    }

    if (tasks.length) {
      await Promise.all(tasks);
    }
  };

  const updateSelectedTournamentSnapshot = (response) => {
    if (response.data?.tournament) {
      setSelectedTournamentSnapshot(response.data.tournament);
    }
  };

  const replaceRegistrationEntry = (registrationId, nextRegistration) => {
    setRegistrations((current) =>
      current.map((entry) =>
        entry.registration_id === registrationId ? nextRegistration : entry
      )
    );
  };

  const clearParticipantsPanel = () => {
    setSelectedTournamentId(null);
    setSelectedTournamentSnapshot(null);
    setRegistrations([]);
    setBracket(null);
    setNotificationCampaigns([]);
    setRegistrationFilter("all");
    setAttendanceFilter("all");
    setRegistrationSearch("");
    setRegistrationError("");
    setSeedDrafts({});
    setMatchDrafts({});
    setNotificationForm(INITIAL_NOTIFICATION_FORM);
    setMailDeliveryAvailable(false);
  };

  const handleNotificationFormChange = (event) => {
    const { name, value, type, checked } = event.target;
    setNotificationForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleManageParticipants = async (tournament) => {
    setSelectedTournamentId(tournament.tournament_id);
    setSelectedTournamentSnapshot(tournament);
    await refreshParticipantContext(tournament.tournament_id, {
      registrations: true,
      bracket: true,
      notifications: true,
    });
    window.scrollTo({ top: 520, behavior: "smooth" });
  };

  const resetNotificationForm = () => {
    setNotificationForm(INITIAL_NOTIFICATION_FORM);
  };

  const handleParticipantStatusChange = async (registration, nextStatus) => {
    if (!selectedTournamentId || !selectedTournament) {
      return;
    }

    const isCancelling = nextStatus === "cancelled";
    const isWaitlisting = nextStatus === "waitlisted";
    const isPromoting =
      nextStatus === "registered" && registration.status === "waitlisted";
    const participantLabel = participantLabelFor(registration);

    const confirmMessage = isCancelling
      ? `Cancel ${participantLabel} from ${selectedTournament.title}?`
      : isWaitlisting
        ? `Move ${participantLabel} to the waitlist for ${selectedTournament.title}?`
        : isPromoting
          ? `Promote ${participantLabel} into the active field for ${selectedTournament.title}?`
          : `Reinstate ${participantLabel} into ${selectedTournament.title}?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setRegistrationSavingId(registration.registration_id);
      setRegistrationError("");
      const response = await axios.post(
        `${API_BASE_URL}/tournament/admin/${selectedTournamentId}/registrations/${registration.registration_id}/status`,
        { status: nextStatus }
      );

      updateSelectedTournamentSnapshot(response);

      await loadTournaments();
      await refreshParticipantContext(selectedTournamentId, {
        registrations: true,
        bracket: true,
        notifications: true,
      });
    } catch (requestError) {
      setRegistrationError(
        requestError.response?.data?.error || "Unable to update participant status."
      );
    } finally {
      setRegistrationSavingId(null);
    }
  };

  const handleAttendanceStatusChange = async (registration, nextAttendanceStatus) => {
    if (!selectedTournamentId || !selectedTournament) {
      return;
    }

    const participantLabel = participantLabelFor(registration);
    const actionLabel =
      nextAttendanceStatus === "checked_in"
        ? "check in"
        : nextAttendanceStatus === "no_show"
          ? "mark as no-show"
          : "reset attendance for";

    if (
      !window.confirm(
        nextAttendanceStatus === "pending"
          ? `Reset attendance for ${participantLabel} in ${selectedTournament.title}?`
          : `Do you want to ${actionLabel} ${participantLabel} in ${selectedTournament.title}?`
      )
    ) {
      return;
    }

    try {
      setRegistrationSavingId(registration.registration_id);
      setRegistrationError("");
      const response = await axios.post(
        `${API_BASE_URL}/tournament/admin/${selectedTournamentId}/registrations/${registration.registration_id}/attendance`,
        { attendance_status: nextAttendanceStatus }
      );

      updateSelectedTournamentSnapshot(response);

      if (response.data?.registration) {
        replaceRegistrationEntry(registration.registration_id, response.data.registration);
      } else {
        await loadRegistrations(selectedTournamentId);
      }

      await loadTournaments();
      await refreshParticipantContext(selectedTournamentId, {
        bracket: true,
        notifications: true,
      });
    } catch (requestError) {
      setRegistrationError(
        requestError.response?.data?.error || "Unable to update participant attendance."
      );
    } finally {
      setRegistrationSavingId(null);
    }
  };

  const handlePaymentAction = async (registration, action) => {
    if (!selectedTournamentId || !selectedTournament) {
      return;
    }

    const participantLabel = participantLabelFor(registration);
    const paymentMethod =
      action === "mark_paid"
        ? window.prompt(
            `Record payment for ${participantLabel}.\n\nEnter payment method: cash / upi / card / wallet`,
            registration.payment_method || "cash"
          )
        : "";

    if (action === "mark_paid" && paymentMethod === null) {
      return;
    }

    const normalizedPaymentMethod = String(paymentMethod || "").trim().toLowerCase();
    let paymentReference = "";
    if (
      action === "mark_paid" &&
      normalizedPaymentMethod &&
      normalizedPaymentMethod !== "cash"
    ) {
      const promptedReference = window.prompt(
        `Enter the payment reference for ${participantLabel}.`,
        registration.payment_reference || ""
      );
      if (promptedReference === null) {
        return;
      }
      paymentReference = promptedReference.trim();
    }

    const paymentNotes = window.prompt(
      action === "mark_paid"
        ? `Optional payment note for ${participantLabel}.`
        : `Optional note for ${participantLabel}.`,
      registration.payment_notes || ""
    );
    if (paymentNotes === null) {
      return;
    }

    const confirmMessage =
      action === "mark_paid"
        ? `Mark ${participantLabel} as paid for ${selectedTournament.title}?`
        : action === "waive"
          ? `Waive the entry fee for ${participantLabel} in ${selectedTournament.title}?`
          : action === "set_pending"
            ? `Move ${participantLabel} back to pending payment for ${selectedTournament.title}?`
            : `Mark ${participantLabel} as not due for ${selectedTournament.title}?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setRegistrationSavingId(registration.registration_id);
      setRegistrationError("");
      const response = await axios.post(
        `${API_BASE_URL}/tournament/admin/${selectedTournamentId}/registrations/${registration.registration_id}/payment`,
        {
          action,
          payment_method: normalizedPaymentMethod,
          payment_reference: paymentReference,
          payment_notes: paymentNotes.trim(),
        }
      );

      updateSelectedTournamentSnapshot(response);

      if (response.data?.registration) {
        replaceRegistrationEntry(registration.registration_id, response.data.registration);
      } else {
        await loadRegistrations(selectedTournamentId);
      }

      await loadTournaments();
      await refreshParticipantContext(selectedTournamentId, {
        notifications: true,
      });
    } catch (requestError) {
      setRegistrationError(
        requestError.response?.data?.error || "Unable to update tournament payment."
      );
    } finally {
      setRegistrationSavingId(null);
    }
  };

  const handleRefundAction = async (registration, action) => {
    if (!selectedTournamentId || !selectedTournament) {
      return;
    }

    const participantLabel = participantLabelFor(registration);
    let processedAmount = "";

    if (action === "refund") {
      const promptedAmount = window.prompt(
        `How much refund should be processed for ${participantLabel}?`,
        String(
          registration.refundable_amount ||
            registration.refund_requested_amount ||
            registration.amount_paid ||
            0
        )
      );
      if (promptedAmount === null) {
        return;
      }
      processedAmount = promptedAmount.trim();
    }

    const notes = window.prompt(
      `Optional refund note for ${participantLabel}.`,
      registration.refund_notes || ""
    );
    if (notes === null) {
      return;
    }

    const confirmMessage =
      action === "request"
        ? `Open a refund request for ${participantLabel} in ${selectedTournament.title}?`
        : action === "processing"
          ? `Mark the refund for ${participantLabel} as processing?`
          : action === "refund"
            ? `Record a refund for ${participantLabel} in ${selectedTournament.title}?`
            : `Reject the refund request for ${participantLabel}?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setRegistrationSavingId(registration.registration_id);
      setRegistrationError("");
      const response = await axios.post(
        `${API_BASE_URL}/tournament/admin/${selectedTournamentId}/registrations/${registration.registration_id}/refund`,
        {
          action,
          notes: notes.trim(),
          processed_amount: processedAmount ? Number(processedAmount) : undefined,
        }
      );

      updateSelectedTournamentSnapshot(response);

      if (response.data?.registration) {
        replaceRegistrationEntry(registration.registration_id, response.data.registration);
      } else {
        await loadRegistrations(selectedTournamentId);
      }

      await loadTournaments();
      await refreshParticipantContext(selectedTournamentId, {
        notifications: true,
      });
    } catch (requestError) {
      setRegistrationError(
        requestError.response?.data?.error || "Unable to update tournament refund."
      );
    } finally {
      setRegistrationSavingId(null);
    }
  };

  const handleSeedChange = (registrationId, value) => {
    const normalizedValue = String(value || "").replace(/[^0-9]/g, "");
    setSeedDrafts((current) => ({
      ...current,
      [registrationId]: normalizedValue,
    }));
  };

  const handleAutoSeed = () => {
    const nextDrafts = {};
    [...activeRegistrations]
      .sort((left, right) => left.registration_id - right.registration_id)
      .forEach((registration, index) => {
        nextDrafts[registration.registration_id] = String(index + 1);
      });
    setSeedDrafts(nextDrafts);
  };

  const handleSaveSeeding = async () => {
    if (!selectedTournamentId) {
      return;
    }

    try {
      setSeedingSaving(true);
      setRegistrationError("");

      const response = await axios.post(
        `${API_BASE_URL}/tournament/admin/${selectedTournamentId}/seeding`,
        {
          seeds: activeRegistrations.map((registration) => ({
            registration_id: registration.registration_id,
            seed_number: seedDrafts[registration.registration_id]
              ? Number(seedDrafts[registration.registration_id])
              : null,
          })),
        }
      );

      updateSelectedTournamentSnapshot(response);

      if (Array.isArray(response.data?.registrations)) {
        setRegistrations(response.data.registrations);
      } else {
        await loadRegistrations(selectedTournamentId);
      }

      await loadTournaments();
      await refreshParticipantContext(selectedTournamentId, {
        bracket: true,
        notifications: true,
      });
    } catch (requestError) {
      setRegistrationError(
        requestError.response?.data?.error || "Unable to save bracket seeding."
      );
    } finally {
      setSeedingSaving(false);
    }
  };

  const handleOperationsStageChange = async (nextStage) => {
    if (!selectedTournamentId || !selectedTournament) {
      return;
    }

    const confirmMessage =
      nextStage === "ready_for_brackets"
        ? `Hand off ${selectedTournament.title} to brackets with the current seeding board?`
        : `Move ${selectedTournament.title} back to ${OPERATIONS_STAGE_LABELS[nextStage] || nextStage}?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setOperationsSaving(true);
      setRegistrationError("");

      const response = await axios.post(
        `${API_BASE_URL}/tournament/admin/${selectedTournamentId}/operations-stage`,
        {
          operations_stage: nextStage,
        }
      );

      updateSelectedTournamentSnapshot(response);

      await loadTournaments();
      await refreshParticipantContext(selectedTournamentId, {
        bracket: true,
        notifications: true,
      });
    } catch (requestError) {
      setRegistrationError(
        requestError.response?.data?.error || "Unable to update tournament operations stage."
      );
    } finally {
      setOperationsSaving(false);
    }
  };

  const handleMatchDraftChange = (matchId, field, value) => {
    const nextValue =
      field === "notes" ? value : String(value || "").replace(/[^0-9]/g, "");

    setMatchDrafts((current) => ({
      ...current,
      [matchId]: {
        ...(current[matchId] || createEmptyMatchDraft()),
        [field]: nextValue,
      },
    }));
  };

  const handleGenerateBracket = async () => {
    if (!selectedTournamentId || !selectedTournament) {
      return;
    }

    const confirmMessage = bracket?.has_bracket
      ? `Rebuild the live bracket for ${selectedTournament.title}? Any pending or walkover-only tree will be regenerated from the current seeded field.`
      : `Generate a live bracket for ${selectedTournament.title} from the current seeded field?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setBracketSaving(true);
      setRegistrationError("");

      const response = await axios.post(
        `${API_BASE_URL}/tournament/admin/${selectedTournamentId}/bracket/generate`
      );

      updateSelectedTournamentSnapshot(response);

      if (response.data?.bracket) {
        setBracket(response.data.bracket);
      } else {
        await loadBracket(selectedTournamentId);
      }

      await loadTournaments();
      await refreshParticipantContext(selectedTournamentId, {
        notifications: true,
      });
    } catch (requestError) {
      setRegistrationError(
        requestError.response?.data?.error || "Unable to generate tournament bracket."
      );
    } finally {
      setBracketSaving(false);
    }
  };

  const handleReportMatchWinner = async (match, winnerRegistrationId) => {
    if (!selectedTournamentId || !selectedTournament) {
      return;
    }

    const winner =
      Number(match?.slot_one?.registration_id || 0) === Number(winnerRegistrationId)
        ? match.slot_one
        : match.slot_two;
    const winnerLabel =
      winner?.display_name || winner?.team_name || winner?.participant_name || "this side";

    if (
      !window.confirm(
        `Record ${winnerLabel} as the winner of ${match.round_label} match ${match.match_number} in ${selectedTournament.title}?`
      )
    ) {
      return;
    }

    try {
      setMatchResultSavingId(match.match_id);
      setRegistrationError("");
      const draft = matchDrafts[match.match_id] || createEmptyMatchDraft();

      const response = await axios.post(
        `${API_BASE_URL}/tournament/admin/${selectedTournamentId}/bracket/matches/${match.match_id}/result`,
        {
          winner_registration_id: winnerRegistrationId,
          slot_one_score: draft.slot_one_score === "" ? null : Number(draft.slot_one_score),
          slot_two_score: draft.slot_two_score === "" ? null : Number(draft.slot_two_score),
          notes: draft.notes?.trim() || null,
        }
      );

      updateSelectedTournamentSnapshot(response);

      if (response.data?.bracket) {
        setBracket(response.data.bracket);
      } else {
        await loadBracket(selectedTournamentId);
      }

      await loadTournaments();
      await refreshParticipantContext(selectedTournamentId, {
        notifications: true,
      });
    } catch (requestError) {
      setRegistrationError(
        requestError.response?.data?.error || "Unable to record the match result."
      );
    } finally {
      setMatchResultSavingId(null);
    }
  };

  const handleSendNotification = async (event) => {
    event.preventDefault();

    if (!selectedTournamentId || !selectedTournament) {
      return;
    }

    if (!notificationForm.title.trim() || !notificationForm.message.trim()) {
      setRegistrationError("Notification title and message are required.");
      return;
    }

    try {
      setNotificationSending(true);
      setRegistrationError("");

      const response = await axios.post(
        `${API_BASE_URL}/tournament/admin/${selectedTournamentId}/notifications`,
        {
          title: notificationForm.title.trim(),
          message: notificationForm.message.trim(),
          recipient_scope: notificationForm.recipient_scope,
          send_email: notificationForm.send_email,
        }
      );

      setMailDeliveryAvailable(Boolean(response.data?.mail_delivery_available));
      setNotificationForm(INITIAL_NOTIFICATION_FORM);
      await loadNotificationCampaigns(selectedTournamentId);
    } catch (requestError) {
      setRegistrationError(
        requestError.response?.data?.error || "Unable to send tournament update."
      );
    } finally {
      setNotificationSending(false);
    }
  };

  return {
    activeRegistrations,
    attendanceFilter,
    bracket,
    bracketLoading,
    bracketRounds,
    bracketSaving,
    clearParticipantsPanel,
    currentBracketRoundLabel,
    eligibleBracketRegistrations,
    filteredRegistrations,
    handleAttendanceStatusChange,
    handleAutoSeed,
    handleGenerateBracket,
    handleManageParticipants,
    handleMatchDraftChange,
    handleNotificationFormChange,
    handleOperationsStageChange,
    handleParticipantStatusChange,
    handlePaymentAction,
    handleRefundAction,
    handleReportMatchWinner,
    handleSaveSeeding,
    handleSeedChange,
    handleSendNotification,
    loadBracket,
    loadNotificationCampaigns,
    loadRegistrations,
    mailDeliveryAvailable,
    matchDrafts,
    matchResultSavingId,
    notificationCampaigns,
    notificationForm,
    notificationLoading,
    notificationSending,
    operationsSaving,
    participantCounts,
    registrationError,
    registrationFilter,
    registrationLoading,
    registrationSavingId,
    registrationSearch,
    resetNotificationForm,
    seededCount,
    seedDrafts,
    seedingRegistrations,
    seedingSaving,
    selectedTournament,
    setAttendanceFilter,
    setRegistrationFilter,
    setRegistrationSearch,
  };
}

export default useTournamentParticipantConsole;
