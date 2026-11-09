/** Opaque authority comes only from one of the two zero-argument profiles. */
import {requireReminderCi17Profile} from './participation-reminder-ci17-profile.mjs';
import {requireReminderLocal18Profile} from './participation-reminder-local18-profile.mjs';
export function requireReminderProfile(value){
 try{return requireReminderCi17Profile(value);}catch{}
 return requireReminderLocal18Profile(value);
}
