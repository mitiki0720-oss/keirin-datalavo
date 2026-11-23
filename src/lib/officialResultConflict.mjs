export const OFFICIAL_CONFLICT_HOLD_LABEL = "公式結果衝突・精算保留";

export function isOfficialResultOnHold(race) {
  const marker = race?.officialResultConflict ?? race?.result?.officialResultConflict;
  // Unknown or malformed conflict metadata must never restore settlement implicitly.
  return marker != null && !(marker.schemaVersion === 1 && marker.status === "resolved"
    && marker.resolution?.action === "accept-candidate" && marker.resolution.conflictId === marker.conflictId
    && marker.resolution.evidenceSha256 === marker.evidenceSha256 && marker.resolution.approvedBy?.trim()
    && Number.isFinite(Date.parse(marker.resolution.approvedAt)));
}

export function conflictSummary(marker) {
  const { schemaVersion, status, raceId, conflictId, changedFields, previousSignatureSha256,
    candidateSignatureSha256, evidenceSha256, firstDetectedAt, lastObservedAt } = marker;
  return { schemaVersion, status, raceId, conflictId, changedFields, previousSignatureSha256,
    candidateSignatureSha256, evidenceSha256, firstDetectedAt, lastObservedAt,
    ...(status === "resolved" ? { resolution: marker.resolution } : {}) };
}

export function withOfficialResultHold(race, marker = race?.officialResultConflict) {
  return { ...race, officialResultConflict: conflictSummary(marker), resultStatus: "pending",
    raceOperationStatus: "unknown", raceOperationLabel: OFFICIAL_CONFLICT_HOLD_LABEL,
    resultNote: OFFICIAL_CONFLICT_HOLD_LABEL, resultTop3: [], payouts: [],
    result: { status: "pending", reviewSettlementEligible: false,
      officialResultConflict: conflictSummary(marker) } };
}

export function attachOfficialConflictHolds(feed, official) {
  if (official?.source?.provider !== "KEIRIN.JP") return feed;
  const normalize = value => String(value ?? "").normalize("NFKC").replace(/\s/gu, "").replace(/競輪場$/u, "");
  const venues = feed.venues.map(venue => {
    const match = feed.date === official.date && official.venues?.find(row => normalize(row.venueName) === normalize(venue.venue)
      && (!venue.venueCode || String(row.venueCode) === String(venue.venueCode)));
    return { ...venue, races: venue.races.map(race => {
      const result = match && match.races?.find(row => row.raceNumber === race.raceNo);
      if (isOfficialResultOnHold(result)) return withOfficialResultHold(race, result.officialResultConflict);
      const recorded = official.officialResultConflictRegistry?.find(row => row.date === feed.date && row.raceNumber === race.raceNo
        && normalize(row.venueName) === normalize(venue.venue) && (!venue.venueCode || String(row.venueCode) === String(venue.venueCode)));
      if (!recorded) return race;
      if (recorded.status === "resolved" && !isOfficialResultOnHold(race)
        && race.officialResultConflict?.candidateSignatureSha256 === recorded.candidateSignatureSha256) return race;
      // Approval alone does not authorize stale historical result data to re-enter settlement.
      return withOfficialResultHold(race, { ...recorded, status: "unresolved" });
    }) };
  });
  return { ...feed, venues };
}
