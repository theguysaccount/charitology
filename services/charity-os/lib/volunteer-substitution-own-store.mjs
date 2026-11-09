/** Compose trusted server dependencies. This module does not mount a route. */
import { fail } from "./security.mjs";
import {
  readVolunteerSubstitutionChoice, recordVolunteerSubstitutionChoice, withdrawVolunteerSubstitutionChoice,
} from "./volunteer-substitution-store.mjs";

const conflict = async (operation, c, value) => {
  try { return await operation(c, value); }
  catch (error) {
    if (["23505", "23514"].includes(error?.code))
      fail(409, "substitution_choice_changed", "Review the current shift substitution choice again.");
    throw error;
  }
};

export function bindVolunteerSubstitutionOwnStore(readOwnOffer) {
  if (typeof readOwnOffer !== "function")
    throw new TypeError("An exact own-offer reader is required.");
  return Object.freeze({
    readOwnOffer,
    readChoice: readVolunteerSubstitutionChoice,
    recordChoice: (c, value) => conflict(recordVolunteerSubstitutionChoice, c, value),
    withdrawChoice: (c, value) => conflict(withdrawVolunteerSubstitutionChoice, c, value),
  });
}
