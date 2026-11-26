import AdminMetricCard from "../components/AdminMetricCard";
import {
  BRACKET_MATCH_STATUS_LABELS,
  BRACKET_MATCH_STATUS_STYLES,
} from "./tournamentsArenaShared";
import {
  actions,
  bracketCompetitorList,
  bracketCompetitorName,
  bracketCompetitorRow,
  bracketCompetitorWinner,
  bracketMatchCard,
  bracketMatchHeader,
  bracketMatchList,
  bracketResultComposer,
  bracketRoundColumn,
  bracketRoundHeader,
  bracketRoundsGrid,
  bracketScoreRow,
  chip,
  copyBlock,
  copyText,
  copyTitle,
  operationsPanel,
  participantToolbar,
  scoreInput,
  sectionCopy,
  sectionHeader,
  sectionTitle,
  statusPill,
} from "./tournamentsArenaStyles";

function TournamentsArenaBracketPanel({
  bracket,
  bracketLoading,
  bracketRounds,
  bracketSaving,
  currentBracketRoundLabel,
  eligibleBracketRegistrations,
  matchDrafts,
  matchResultSavingId,
  onGenerateBracket,
  onMatchDraftChange,
  onRefreshBracket,
  onReportMatchWinner,
  operationsSaving,
  seedingSaving,
  selectedTournament,
}) {
  return (
    <div style={operationsPanel}>
      <div style={sectionHeader}>
        <div>
          <div style={sectionTitle}>Live Bracket</div>
          <div style={sectionCopy}>
            Generate the single-elimination tree from the seeded field, then report winners here
            as matches finish.
          </div>
        </div>
        <div style={participantToolbar}>
          <button
            type="button"
            className="admin-action-button rig-fleet__secondary-button is-success"
            onClick={onGenerateBracket}
            disabled={
              bracketLoading ||
              bracketSaving ||
              seedingSaving ||
              operationsSaving ||
              !selectedTournament.can_handoff_to_brackets ||
              eligibleBracketRegistrations.length < 2
            }
          >
            {bracketSaving
              ? "Building..."
              : bracket?.has_bracket
                ? "Rebuild bracket"
                : "Generate bracket"}
          </button>
          <button
            type="button"
            className="admin-action-button rig-fleet__ghost-button"
            onClick={() => onRefreshBracket(selectedTournament.tournament_id)}
            disabled={bracketLoading || bracketSaving}
          >
            {bracketLoading ? "Refreshing..." : "Refresh bracket"}
          </button>
        </div>
      </div>

      <div className="admin-metric-grid" style={{ marginBottom: 18 }}>
        <AdminMetricCard
          icon="BM"
          label="Matches"
          value={`${bracket?.completed_match_count || 0}/${bracket?.match_count || 0}`}
          hint="Completed or auto-resolved"
          tone="cool"
        />
        <AdminMetricCard
          icon="RD"
          label="Current Round"
          value={currentBracketRoundLabel}
          hint={`${bracket?.round_count || 0} rounds in this tree`}
          tone="gold"
        />
        <AdminMetricCard
          icon="CH"
          label="Champion"
          value={bracket?.champion?.display_name || "TBD"}
          hint={
            bracket?.champion ? "Bracket winner has been decided" : "Final winner still open"
          }
          tone="warm"
        />
      </div>

      {bracketLoading ? (
        <div className="admin-empty-state">Loading live bracket...</div>
      ) : !bracket?.has_bracket ? (
        <div className="admin-empty-state">
          {selectedTournament.can_handoff_to_brackets
            ? eligibleBracketRegistrations.length < 2
              ? "At least two eligible registrations are still required after no-show review before a bracket can be generated."
              : "The seeded field is ready. Generate the bracket once attendance and no-show review are settled."
            : "Finish assigning unique seeds to every active registration before generating the bracket."}
        </div>
      ) : (
        <div style={bracketRoundsGrid}>
          {bracketRounds.map((round) => (
            <section key={round.round_number} style={bracketRoundColumn}>
              <div style={bracketRoundHeader}>
                <div style={copyTitle}>{round.label}</div>
                <div style={copyText}>
                  {round.matches.length} match{round.matches.length === 1 ? "" : "es"}
                </div>
              </div>

              <div style={bracketMatchList}>
                {round.matches.map((match) => {
                  const statusStyle =
                    BRACKET_MATCH_STATUS_STYLES[match.status] ||
                    BRACKET_MATCH_STATUS_STYLES.pending;
                  const draft = matchDrafts[match.match_id] || {
                    slot_one_score: "",
                    slot_two_score: "",
                    notes: "",
                  };

                  return (
                    <article key={match.match_id} style={bracketMatchCard}>
                      <div style={bracketMatchHeader}>
                        <div>
                          <div style={copyTitle}>Match {match.match_number}</div>
                          <div style={copyText}>
                            {match.winner?.display_name
                              ? `Winner: ${match.winner.display_name}`
                              : "Winner pending"}
                          </div>
                        </div>
                        <div
                          style={{
                            ...statusPill,
                            background: statusStyle.background,
                            borderColor: statusStyle.border,
                            color: statusStyle.color,
                          }}
                        >
                          {BRACKET_MATCH_STATUS_LABELS[match.status] || match.status}
                        </div>
                      </div>

                      <div style={bracketCompetitorList}>
                        {[
                          ["slot_one", "Side A"],
                          ["slot_two", "Side B"],
                        ].map(([slotKey, slotLabel]) => {
                          const competitor = match[slotKey];
                          const isWinner =
                            competitor &&
                            Number(match.winner_registration_id || 0) ===
                              Number(competitor.registration_id || 0);

                          return (
                            <div
                              key={`${match.match_id}-${slotKey}`}
                              style={{
                                ...bracketCompetitorRow,
                                ...(isWinner ? bracketCompetitorWinner : {}),
                              }}
                            >
                              <div>
                                <div style={bracketCompetitorName}>
                                  {competitor?.display_name || "Awaiting previous result"}
                                </div>
                                <div style={copyText}>
                                  {competitor
                                    ? [
                                        slotLabel,
                                        competitor.seed_number
                                          ? `Seed #${competitor.seed_number}`
                                          : null,
                                        competitor.team_name && competitor.participant_name
                                          ? `Captain: ${competitor.participant_name}`
                                          : competitor.participant_email || null,
                                      ]
                                        .filter(Boolean)
                                        .join(" | ")
                                    : match.is_walkover
                                      ? "Bye or closed branch"
                                      : "This side fills after earlier bracket results."}
                                </div>
                              </div>
                              {isWinner ? (
                                <span
                                  style={chip(
                                    "var(--tone-success-bg)",
                                    "var(--tone-success-border)",
                                    "var(--tone-success-text)"
                                  )}
                                >
                                  Winner
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>

                      {match.can_report_result ? (
                        <div style={bracketResultComposer}>
                          <div style={bracketScoreRow}>
                            <input
                              type="number"
                              min="0"
                              value={draft.slot_one_score}
                              onChange={(event) =>
                                onMatchDraftChange(
                                  match.match_id,
                                  "slot_one_score",
                                  event.target.value
                                )
                              }
                              style={scoreInput}
                              placeholder="Side A score"
                            />
                            <input
                              type="number"
                              min="0"
                              value={draft.slot_two_score}
                              onChange={(event) =>
                                onMatchDraftChange(
                                  match.match_id,
                                  "slot_two_score",
                                  event.target.value
                                )
                              }
                              style={scoreInput}
                              placeholder="Side B score"
                            />
                          </div>
                          <input
                            className="admin-search"
                            placeholder="Optional match notes"
                            value={draft.notes}
                            onChange={(event) =>
                              onMatchDraftChange(match.match_id, "notes", event.target.value)
                            }
                          />
                          <div style={actions}>
                            <button
                              type="button"
                              className="admin-action-button rig-fleet__secondary-button is-success"
                              onClick={() =>
                                onReportMatchWinner(match, match.slot_one.registration_id)
                              }
                              disabled={matchResultSavingId === match.match_id}
                            >
                              {matchResultSavingId === match.match_id
                                ? "Saving..."
                                : `Winner: ${match.slot_one.display_name}`}
                            </button>
                            <button
                              type="button"
                              className="admin-action-button rig-fleet__secondary-button"
                              onClick={() =>
                                onReportMatchWinner(match, match.slot_two.registration_id)
                              }
                              disabled={matchResultSavingId === match.match_id}
                            >
                              {matchResultSavingId === match.match_id
                                ? "Saving..."
                                : `Winner: ${match.slot_two.display_name}`}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={copyText}>
                          {match.is_walkover
                            ? match.winner?.display_name
                              ? `${match.winner.display_name} auto-advanced on a bye.`
                              : "No eligible participant advanced from this branch."
                            : match.is_decided
                              ? `${match.winner?.display_name || "Winner"} advanced to the next round.`
                              : "Waiting for earlier bracket results before this match can be reported."}
                        </div>
                      )}

                      {match.notes ? (
                        <div style={copyBlock}>
                          <div style={copyTitle}>Notes</div>
                          <div style={copyText}>{match.notes}</div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default TournamentsArenaBracketPanel;
