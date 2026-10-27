import type {
  ObservationDecimal,
  ObservationPeriod,
  ObservationPin,
  ObservationProjection,
  ObservationRecord,
  ObservationSourceRef,
  ObservationUnit,
} from "./observation-types";

/** Presentation only. No arithmetic, inference, rounding or source admission. */
export function observationExactText(value: ObservationDecimal): string {
  const negative = value.coefficient.startsWith("-");
  const digits = negative ? value.coefficient.slice(1) : value.coefficient;
  const point = digits.length + value.exponent;
  const body =
    point <= 0
      ? `0.${"0".repeat(-point)}${digits}`
      : point >= digits.length
        ? digits + "0".repeat(point - digits.length)
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return (negative ? "-" : "") + body;
}
export function observationPeriodText(period: ObservationPeriod): string {
  switch (period.kind) {
    case "stock-day":
      return `At ${period.day}`;
    case "calendar-year":
      return String(period.year);
    case "closed-interval":
      return `${period.start} through ${period.end} · ${period.sourceLabel}`;
    case "year-ended":
      return `${period.sourceLabel} · literal start unknown`;
  }
}
export function observationUnitText(unit: ObservationUnit): string {
  return unit.denominator
    ? `${unit.label} · ${unit.denominator.definition}`
    : unit.label;
}
export function observationCoverageAnchor(
  id: string,
  version: number,
  index: number,
): string {
  if (
    !/^[a-z][a-z0-9-]{0,99}$/.test(id) ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    !Number.isSafeInteger(index) ||
    index < 0
  )
    throw new Error("Invalid coverage display identity.");
  return `coverage-${id}-v${version}-cell-${index}`;
}
export function observationLocatorText(ref: ObservationSourceRef): string {
  const l = ref.locator;
  if (l.kind === "json") return `JSON pointer ${l.pointer || "/"}`;
  if (l.kind === "text")
    return `${l.section.join(" → ")}${l.excerpt ? ` · “${l.excerpt}”` : ""}`;
  return [
    `PDF page ${l.pdfPage}`,
    l.printedPage === null ? null : `printed page ${l.printedPage}`,
    ...l.section,
    ...l.row,
    ...l.column,
  ]
    .filter((v) => v !== null && v !== "")
    .join(" · ");
}
export function observationPinned<
  T extends { id: string; version: number; hash: string },
>(records: readonly T[], pin: ObservationPin): T {
  const record = records.find(
    (r) => r.id === pin.id && r.version === pin.version && r.hash === pin.hash,
  );
  if (!record)
    throw new Error("A pinned observation display source is unavailable.");
  return record;
}
export function observationFact(
  projection: ObservationProjection,
  record: ObservationRecord,
) {
  const entity = observationPinned(projection.entities, record.entity);
  const scope = observationPinned(projection.scopes, record.scope);
  const measure = observationPinned(projection.measures, record.measure);
  const source = observationPinned(
    projection.sources,
    record.reported.valueRef.source,
  );
  return {
    record,
    entity,
    scope,
    measure,
    source,
    valueText: observationExactText(record.value),
    unitText: observationUnitText(measure.unit),
    periodText: observationPeriodText(record.period),
    scaleText: observationExactText(record.reported.scale),
    precisionText:
      record.precision.kind === "unknown"
        ? "Reporting precision unknown"
        : `Reported quantum ${observationExactText(record.precision.quantum)} ${measure.unit.label}; not an uncertainty interval`,
    uncertaintyText:
      record.uncertainty === null
        ? "No numerical uncertainty interval recorded"
        : `Producer-reported bounds ${observationExactText(record.uncertainty.lower)} to ${observationExactText(record.uncertainty.upper)}; confidence level not supplied`,
  };
}
export function countryObservationFacts(
  projection: ObservationProjection,
  code: string,
) {
  const entity = projection.entities.find(
    (e) =>
      e.entityKind === "country-economy" &&
      e.identifiers.some((i) => i.kind === "iso3" && i.value === code),
  );
  if (!entity)
    throw new Error("Country is outside the selected observation edition.");
  return Object.fromEntries(
    projection.observations
      .filter((o) => o.entity.id === entity.id)
      .map((o) => {
        const fact = observationFact(projection, o);
        if (!fact.measure.legacyCountry)
          throw new Error("Country measure has no compatibility identity.");
        return [fact.measure.legacyCountry.id, fact];
      }),
  );
}
export function countryMissingFacts(
  projection: ObservationProjection,
  code: string,
) {
  const entity = projection.entities.find(
    (e) =>
      e.entityKind === "country-economy" &&
      e.identifiers.some((i) => i.kind === "iso3" && i.value === code),
  );
  if (!entity)
    throw new Error("Country is outside the selected observation edition.");
  return Object.fromEntries(
    projection.coverage.flatMap((coverage) =>
      coverage.cells.flatMap((cell, index) => {
        if (cell.state !== "missing" || cell.entity.id !== entity.id) return [];
        const measure = observationPinned(projection.measures, cell.measure);
        if (!measure.legacyCountry)
          throw new Error(
            "Missing country cell has no compatibility identity.",
          );
        return [
          [
            measure.legacyCountry.id,
            {
              coverage,
              cell,
              index,
              measure,
              source: cell.sourceRefs.length
                ? observationPinned(
                    projection.sources,
                    cell.sourceRefs[0].source,
                  )
                : null,
            },
          ],
        ];
      }),
    ),
  );
}
export function financialScopesForProfile(
  projection: ObservationProjection,
  slug: string,
) {
  const matches = (
    pin: ObservationPin,
    entity: ObservationProjection["entities"][number],
  ) =>
    pin.id === entity.id &&
    pin.version === entity.version &&
    pin.hash === entity.hash;
  const entities = projection.entities.filter((e) =>
    e.profileRefs.includes(slug),
  );
  return projection.scopes.filter(
    (s) =>
      s.scopeKind === "consolidated-reporting-group" &&
      entities.some(
        (e) =>
          matches(s.entity, e) ||
          s.includedEntities.some((pin) => matches(pin, e)),
      ),
  );
}
export const observationReasonText: Record<string, string> = {
  "not-collected": "Financial observations not collected for this selection",
  "different-stock-day": "Different balance-sheet dates",
  "different-interval": "Different reporting intervals",
  "literal-interval-start-unknown": "A literal period start is unknown",
  "different-measure-definition": "Expense definitions differ",
  "different-unit-or-denominator": "Units or denominators differ",
  "different-price-basis": "Price bases differ or are unknown",
  "different-consolidation-boundary":
    "The reporting groups contain different legal entities",
  "different-reporting-quantum": "Printed reporting precision differs",
  "uncertainty-unknown": "Numerical uncertainty is not supplied",
  "service-geography-unknown":
    "Service geography is not established by these financial statements",
};
