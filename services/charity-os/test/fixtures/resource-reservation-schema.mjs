export { RESOURCE_RESERVATION_SCHEMA_SQL as reservationSchemaSql } from "../../lib/resource-reservation-schema.mjs";

const layout = (holds, commands, complete) => ({ rows: [{ core: true, holds, commands, complete }], rowCount: 1 });
export const legacyReservationLayout = layout(false, false, false);
export const partialReservationLayout = layout(true, false, false);
export const currentReservationLayout = layout(true, true, true);
