import { consumeRateLimit } from "./database.mjs";
import { hash } from "./security.mjs";

/** Called on the locked client only after an exact retained response is ruled out. */
export function consumeVolunteerSubstitutionFreshWrite(c, { orgId, userId }) {
  return consumeRateLimit(c, "shift-substitution:write:" + hash([orgId, userId]), 30, 3600);
}
