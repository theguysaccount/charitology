import type { FundingEdition } from "./model.mjs";
export const FUNDING_REGISTRY_PATH: string;
export function freezeFundingEdition(edition: FundingEdition): FundingEdition;
export function loadHumanitarianFunding(): FundingEdition | null;
export function requireHumanitarianFunding(): FundingEdition;
