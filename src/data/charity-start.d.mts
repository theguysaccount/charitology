export type CharityStartJob = Readonly<{id:string;title:string;question:string;output:string;steps:readonly string[];questions:readonly string[];links:readonly Readonly<{label:string;path:string}>[];os:readonly Readonly<{id:string;label:string}>[];limit:string;review:'draft'}>;
export type CharityStartRaw = {jobId:string;ownerRole:string;reviewDate:string;completed:boolean[]};
export type CharityStartPlan = Readonly<{jobId:string;ownerRole:string|null;reviewDate:string|null;completed:readonly boolean[];signature:string;filename:string;markdown:string}>;
export const CHARITY_START_VERSION:string;
export const CHARITY_START_LIMITS:Readonly<{ownerRole:120;outputBytes:16384}>;
export const charityStartJobs:readonly CharityStartJob[];
export class CharityStartError extends Error {field:string;constructor(message:string,field:string);}
export function findCharityStartJob(id:string):CharityStartJob|undefined;
export function prepareCharityStartPlan(raw:CharityStartRaw):CharityStartPlan;
