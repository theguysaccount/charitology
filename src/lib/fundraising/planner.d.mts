export type FundraisingCurrency='USD'|'GBP'|'EUR';
export type FundraisingBudgetRaw={currency:FundraisingCurrency;grossReceived:string;refunds:string;cashCosts:string;staffHours:string;staffHourValue:string;volunteerHours:string;volunteerHourValue:string;newDonors:string;priorYearDonors:string;returningDonors:string};
export type FundraisingRaw=FundraisingBudgetRaw&{campaignTitle:string;campaignDate:string;ownerRole:string;offsets:{acknowledgment:string;welcome:string;progress:string;review:string}};
export type FundraisingMetric={kind:'known';value:string}|{kind:'unknown'}|{kind:'undefined';reason:'zero-denominator'};
export type FundraisingBudget=Readonly<{currency:FundraisingCurrency;inputs:Readonly<Record<Exclude<keyof FundraisingBudgetRaw,'currency'>,string|null>>;metrics:Readonly<Record<'netCash'|'staffTimeCost'|'volunteerTimeCost'|'fullCost'|'netWithTime'|'cashCostPerNewDonor'|'fullCostPerNewDonor'|'retentionPercent',FundraisingMetric>>}>;
export type FundraisingTask=Readonly<{id:'acknowledgment'|'welcome'|'progress'|'review';title:string;detail:string;offsetDays:number;date:string;endDate:string;ownerRole:string;uid:string}>;
export type FundraisingPlan=Readonly<{campaignTitle:string;campaignDate:string;ownerRole:string;generatedAt:string;budget:FundraisingBudget;tasks:readonly FundraisingTask[];markdown:string;calendar:string}>;
export const FUNDRAISING_LIMITS:Readonly<{inputBytes:16384;outputBytes:65536;money:string;hours:string;donors:1000000000;offsetDays:3650}>;
export const FUNDRAISING_TASKS:readonly Readonly<{id:FundraisingTask['id'];title:string;defaultDays:string;detail:string}>[];
export class FundraisingPlannerError extends Error {field:string|null}
export function calculateFundraisingBudget(raw:FundraisingBudgetRaw):FundraisingBudget;
export function addFundraisingDays(date:string,days:number):string;
export function escapeFundraisingCalendarText(value:string):string;
export function foldFundraisingCalendarLine(value:string):string;
export function fundraisingMetricText(key:string,metric:FundraisingMetric,currency:FundraisingCurrency):string;
export function prepareFundraisingPlan(raw:FundraisingRaw,generatedAt:string):Promise<FundraisingPlan>;
export function mountFundraisingPlanner(root:HTMLElement):Readonly<{dispose():void}>;
