import { useEffect, useMemo, useState } from "react";
import axios from "axios";

import AdminMetricCard from "../components/AdminMetricCard";
import AdminPageHero from "../components/AdminPageHero";
import AdminLayout from "../layout/AdminLayout";
import { API_BASE_URL, resolveUploadUrl } from "../config/api";
import TournamentsArenaCatalog from "./tournamentsArenaCatalog";
import TournamentsArenaEditorForm from "./tournamentsArenaEditorForm";
import TournamentsArenaParticipantConsole from "./tournamentsArenaParticipantConsole";
import useTournamentParticipantConsole from "./useTournamentParticipantConsole";
import {
  buildPayload,
  INITIAL_FORM,
  toFormState,
} from "./tournamentsArenaShared";

function TournamentsArena() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverUploadError, setCoverUploadError] = useState("");

  const loadTournaments = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/tournament/admin/all`);
      setTournaments(Array.isArray(response.data) ? response.data : []);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to load tournaments.");
    } finally {
      setLoading(false);
    }
  };

  const participantConsole = useTournamentParticipantConsole({
    tournaments,
    loadTournaments,
  });

  useEffect(() => {
    loadTournaments();
  }, []);

  const counts = useMemo(
    () => ({
      all: tournaments.length,
      draft: tournaments.filter((item) => item.status === "draft").length,
      published: tournaments.filter((item) => item.status === "published").length,
      cancelled: tournaments.filter((item) => item.status === "cancelled").length,
      featured: tournaments.filter((item) => item.is_featured).length,
    }),
    [tournaments]
  );

  const filteredTournaments = useMemo(() => {
    const term = search.trim().toLowerCase();

    return tournaments.filter((tournament) => {
      const matchesFilter = activeFilter === "all" ? true : tournament.status === activeFilter;
      const matchesSearch =
        !term ||
        [
          tournament.title,
          tournament.game_title,
          tournament.slug,
          tournament.location_label,
          tournament.status,
          tournament.format,
        ]
          .join(" ")
          .toLowerCase()
          .includes(term);

      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, search, tournaments]);

  const resetForm = () => {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setCoverUploadError("");
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    if (name === "cover_image" && coverUploadError) {
      setCoverUploadError("");
    }

    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleCoverUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      setCoverUploading(true);
      setCoverUploadError("");

      const payload = new FormData();
      payload.append("image", file);

      const response = await axios.post(
        `${API_BASE_URL}/tournament/admin/cover-image`,
        payload,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      setForm((current) => ({
        ...current,
        cover_image: response.data?.cover_image || "",
      }));
    } catch (requestError) {
      setCoverUploadError(
        requestError.response?.data?.error || "Unable to upload tournament cover."
      );
    } finally {
      setCoverUploading(false);
    }
  };

  const handleEdit = (tournament) => {
    setEditingId(tournament.tournament_id);
    setForm(toFormState(tournament));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const clearCoverImage = () => {
    setForm((current) => ({
      ...current,
      cover_image: "",
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");

      if (String(form.cover_image || "").trim().toLowerCase().startsWith("data:")) {
        setError(
          "Inline data URLs are not supported for tournament covers. Upload an image file or paste a normal hosted URL instead."
        );
        return;
      }

      if (editingId) {
        await axios.put(
          `${API_BASE_URL}/tournament/admin/update/${editingId}`,
          buildPayload(form)
        );
      } else {
        await axios.post(`${API_BASE_URL}/tournament/admin/create`, buildPayload(form));
      }

      await loadTournaments();
      resetForm();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to save tournament.");
    } finally {
      setSaving(false);
    }
  };

  const coverPreviewUrl = useMemo(() => {
    if (!form.cover_image.trim()) {
      return "";
    }

    return resolveUploadUrl(form.cover_image.trim());
  }, [form.cover_image]);

  const triggerStatusAction = async (tournamentId, action, confirmMessage) => {
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/tournament/admin/${action}/${tournamentId}`);
      await loadTournaments();
    } catch (requestError) {
      window.alert(requestError.response?.data?.error || "Unable to update tournament status.");
    }
  };

  return (
    <AdminLayout>
      <AdminPageHero
        title="Tournaments"
        badge={{
          title: "Published",
          value: counts.published,
          meta: `${counts.featured} featured tournaments`,
        }}
        actions={
          <>
            <input
              className="admin-search"
              placeholder="Search by title, game, slug, or venue"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              type="button"
              className="admin-action-button rig-fleet__refresh-button"
              onClick={loadTournaments}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </>
        }
      />

      <div className="admin-metric-grid">
        <AdminMetricCard icon="EV" label="All tournaments" value={counts.all} hint="Across every state" tone="warm" />
        <AdminMetricCard icon="DR" label="Draft" value={counts.draft} hint="Not yet visible" tone="info" />
        <AdminMetricCard
          icon="PB"
          label="Published"
          value={counts.published}
          hint="Visible in the user app"
          tone="cool"
        />
        <AdminMetricCard
          icon="FT"
          label="Featured"
          value={counts.featured}
          hint={`${counts.cancelled} cancelled`}
          tone="gold"
        />
      </div>

      <TournamentsArenaEditorForm
        editingId={editingId}
        form={form}
        saving={saving}
        coverUploading={coverUploading}
        coverUploadError={coverUploadError}
        coverPreviewUrl={coverPreviewUrl}
        onResetForm={resetForm}
        onSubmit={handleSubmit}
        onChange={handleChange}
        onCoverUpload={handleCoverUpload}
        onClearCover={clearCoverImage}
      />

      <TournamentsArenaParticipantConsole
        selectedTournament={participantConsole.selectedTournament}
        participantCounts={participantConsole.participantCounts}
        registrationSearch={participantConsole.registrationSearch}
        onRegistrationSearchChange={participantConsole.setRegistrationSearch}
        onRefreshRegistrations={participantConsole.loadRegistrations}
        registrationLoading={participantConsole.registrationLoading}
        onClose={participantConsole.clearParticipantsPanel}
        activeRegistrations={participantConsole.activeRegistrations}
        seedingSaving={participantConsole.seedingSaving}
        operationsSaving={participantConsole.operationsSaving}
        onAutoSeed={participantConsole.handleAutoSeed}
        onSaveSeeding={participantConsole.handleSaveSeeding}
        onOperationsStageChange={participantConsole.handleOperationsStageChange}
        seededCount={participantConsole.seededCount}
        seedingRegistrations={participantConsole.seedingRegistrations}
        seedDrafts={participantConsole.seedDrafts}
        onSeedChange={participantConsole.handleSeedChange}
        bracketLoading={participantConsole.bracketLoading}
        bracketSaving={participantConsole.bracketSaving}
        onGenerateBracket={participantConsole.handleGenerateBracket}
        onRefreshBracket={participantConsole.loadBracket}
        eligibleBracketRegistrations={participantConsole.eligibleBracketRegistrations}
        bracket={participantConsole.bracket}
        currentBracketRoundLabel={participantConsole.currentBracketRoundLabel}
        bracketRounds={participantConsole.bracketRounds}
        matchDrafts={participantConsole.matchDrafts}
        onMatchDraftChange={participantConsole.handleMatchDraftChange}
        onReportMatchWinner={participantConsole.handleReportMatchWinner}
        matchResultSavingId={participantConsole.matchResultSavingId}
        notificationLoading={participantConsole.notificationLoading}
        notificationSending={participantConsole.notificationSending}
        onRefreshNotifications={participantConsole.loadNotificationCampaigns}
        notificationForm={participantConsole.notificationForm}
        onNotificationFormChange={participantConsole.handleNotificationFormChange}
        mailDeliveryAvailable={participantConsole.mailDeliveryAvailable}
        onSendNotification={participantConsole.handleSendNotification}
        onResetNotificationForm={participantConsole.resetNotificationForm}
        notificationCampaigns={participantConsole.notificationCampaigns}
        registrationFilter={participantConsole.registrationFilter}
        onRegistrationFilterChange={participantConsole.setRegistrationFilter}
        attendanceFilter={participantConsole.attendanceFilter}
        onAttendanceFilterChange={participantConsole.setAttendanceFilter}
        registrationError={participantConsole.registrationError}
        filteredRegistrations={participantConsole.filteredRegistrations}
        registrationSavingId={participantConsole.registrationSavingId}
        onAttendanceStatusChange={participantConsole.handleAttendanceStatusChange}
        onParticipantStatusChange={participantConsole.handleParticipantStatusChange}
        onPaymentAction={participantConsole.handlePaymentAction}
        onRefundAction={participantConsole.handleRefundAction}
      />
      <TournamentsArenaCatalog
        activeFilter={activeFilter}
        onActiveFilterChange={setActiveFilter}
        error={error}
        loading={loading}
        tournaments={filteredTournaments}
        onManageParticipants={participantConsole.handleManageParticipants}
        onEdit={handleEdit}
        onTriggerStatusAction={triggerStatusAction}
      />
    </AdminLayout>
  );
}

export default TournamentsArena;
