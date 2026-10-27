import { createHmac } from 'node:crypto';
import { authorized, boundedBody, hashToken, InputError, normalizeEmail } from './security.mjs';
import { escapeHtml } from './content.mjs';
import { FROM } from './config.mjs';

export const PARTICIPATION_SUBJECT = 'Your Charity OS participation update';
export const PARTICIPATION_MESSAGE = 'There is an update in your Charity OS participant portal. Sign in to review the current details.';
const keyPattern=/^[A-Za-z0-9._:-]{1,128}$/;
const providerId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
export const osMailKeyHash=key=>hashToken(`charitology-os-mail:${key}`);
export const osMailHmac=(settings,value)=>createHmac('sha256',settings.osMailSecret).update(value).digest('hex');
export const osMailCorrelation=(settings,keyHash)=>osMailHmac(settings,`participation-correlation:${keyHash}`);
const factTypes=['sent','delivered','delivery_delayed','failed','bounced','complained','suppressed','canceled'];
export function providerEventTime(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value))return null;
  const date=new Date(value);if(!Number.isFinite(+date)||date.toISOString().slice(0,19)!==value.slice(0,19))return null;
  return date.toISOString();
}
export function osMailOutcome(row){
  if(!row)return {state:'unknown',safeCode:'intent_unknown',providerEventAt:null};
  const facts=plain(row.provider_facts)?row.provider_facts:{};
  for(const type of ['complained','bounced','suppressed','failed','canceled','delivered','delivery_delayed','sent']){
    if(Object.hasOwn(facts,type))return {state:['complained','bounced','suppressed'].includes(type)?'suppressed':['failed','canceled'].includes(type)?'failed':type==='delivered'?'delivered':'accepted',safeCode:`provider_${type}`,providerEventAt:providerEventTime(facts[type])};
  }
  return {state:row.state==='preflight'&&!row.attempted_at?'unavailable':['creating','accepted','unknown','failed','limited'].includes(row.state)?row.state:'unknown',safeCode:row.state==='preflight'&&!row.attempted_at?'preflight_unavailable':({creating:'intent_in_progress',accepted:'provider_accepted',unknown:'attempt_unconfirmed',failed:'provider_rejected',limited:'rate_limited'})[row.state]||'intent_unknown',providerEventAt:null};
}
export function mergeProviderFacts(old,type,at=null){
  if(!factTypes.includes(type))return {...(plain(old)?old:{})};
  const facts=Object.fromEntries(Object.entries(plain(old)?old:{}).filter(([k,v])=>factTypes.includes(k)&&(v===null||providerEventTime(v))));
  const timestamp=providerEventTime(at);
  if(!Object.hasOwn(facts,type)||timestamp&&(!facts[type]||timestamp>facts[type]))facts[type]=timestamp;
  return facts;
}

export function validateOsMail(input, settings) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('Use a JSON message object.');
  if (Object.keys(input).some(key => !['purpose','to','url','organizationName','title','message'].includes(key))) throw new InputError('Unknown transactional message field.');
  const purpose = input.purpose;
  if (!['login','invitation','reminder','participation'].includes(purpose)) throw new InputError('Choose a supported transactional purpose.');
  const to = normalizeEmail(input.to);
  if (!to) throw new InputError('Use one valid recipient address.');
  const string = (key, maximum, required = false, multiline = false) => {
    const value = input[key];
    if (value === undefined && !required) return '';
    if (typeof value !== 'string' || value.length > maximum || (required && !value.trim()) || (!multiline && /[\r\n]/.test(value)) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) throw new InputError(`Invalid ${key}.`);
    return value.trim();
  };
  const rawUrl = string('url', 2000, true);
  let url;
  try { url = new URL(rawUrl); } catch { throw new InputError('Invalid OS link.'); }
  if(purpose==='participation'){
    if(Object.keys(input).some(k=>!['purpose','to','url'].includes(k))||rawUrl!==`${settings.osOrigin}/participant`||url.search||url.hash||url.username||url.password)throw new InputError('Use only the fixed participation notice and clean portal URL.');
    return {purpose,to,url:url.toString()};
  }
  const correctPath = purpose === 'login' ? url.pathname === '/auth/confirm' : purpose === 'invitation' ? url.pathname === '/invite' : (url.pathname === '/app' || url.pathname.startsWith('/app/'));
  if (url.origin !== settings.osOrigin || url.username || url.password || url.hash || !correctPath) throw new InputError('The link must use the configured OS origin and purpose path.');
  const organizationName = string('organizationName', 180);
  const title = string('title', 180);
  const message = string('message', 1000, false, true);
  return { purpose, to, url: url.toString(), organizationName, title, message };
}

export function renderOsMail(input) {
  if(input.purpose==='participation')return {to:input.to,subject:PARTICIPATION_SUBJECT,html:`<h1>${PARTICIPATION_SUBJECT}</h1><p>${PARTICIPATION_MESSAGE}</p><p><a href="${escapeHtml(input.url)}">Open your participant portal</a></p><p>This operational message does not subscribe you to The Charitology Letter. Manage participation email choices after signing in to your portal.</p><p>Charitology · 938 Peacock Station Rd, McLean, VA 22102</p>`,text:`${PARTICIPATION_SUBJECT}\n\n${PARTICIPATION_MESSAGE}\n\nOpen your participant portal: ${input.url}\n\nThis operational message does not subscribe you to The Charitology Letter. Manage participation email choices after signing in to your portal.\nCharitology · 938 Peacock Station Rd, McLean, VA 22102`};
  const organization = input.organizationName || 'your organization';
  const subject = input.purpose === 'login' ? 'Sign in to Charity OS' : input.purpose === 'invitation' ? 'Your Charity OS invitation' : (input.title || 'Charity OS reminder');
  const introduction = input.purpose === 'login'
    ? 'A sign-in link was requested for this address. Open the link to continue. If you did not request it, ignore this message.'
    : input.purpose === 'invitation'
      ? `You were invited to join ${organization} in Charity OS. Review the invitation before accepting. If it was unexpected, you may ignore it.`
      : (input.message || `There is an action to review for ${organization} in Charity OS.`);
  const action = input.purpose === 'login' ? 'Review sign-in' : input.purpose === 'invitation' ? 'Review invitation' : 'Open Charity OS';
  return {
    to: input.to, subject,
    html: `<h1>${escapeHtml(subject)}</h1><p>${escapeHtml(introduction).replaceAll('\n', '<br>')}</p><p><a href="${escapeHtml(input.url)}">${escapeHtml(action)}</a></p><p>This is an operational Charity OS message. It does not subscribe you to The Charitology Letter.</p><p>Charitology · 938 Peacock Station Rd, McLean, VA 22102</p>`,
    text: `${subject}\n\n${introduction}\n\n${action}: ${input.url}\n\nThis operational message does not subscribe you to The Charitology Letter.\nCharitology · 938 Peacock Station Rd, McLean, VA 22102`,
  };
}

export function osMailRateKeys(recipientHash, now = Date.now()) {
  return [
    { key: `os-mail:global:day:${Math.floor(now / 86400000)}`, limit: 200 },
    { key: `os-mail:recipient:${recipientHash}:hour:${Math.floor(now / 3600000)}`, limit: 10 },
  ];
}

/** Server-only purpose relay. No contact, subscriber, Topic, Segment or campaign operation occurs here. */
export async function handleOsMail(request, { db, mail, settings, logger = () => {} }) {
  const result = (status, body) => ({ status, body });
  if (!authorized(request, settings.osMailSecret || '')) return result(401, { ok: false, message: 'Authentication required.' });
  if (request.headers.has('origin')) return result(403, { ok: false, message: 'This endpoint is for server requests.' });
  const key = request.headers.get('idempotency-key') || '';
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(key)) throw new InputError('A bounded Idempotency-Key is required.');
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new InputError('Use a JSON request.', 415);
  let input;
  try { input = JSON.parse(await boundedBody(request, 16384)); } catch (error) { if (error instanceof InputError) throw error; throw new InputError('The message could not be read.'); }
  const payload = validateOsMail(input, settings);
  const hmac = value => createHmac('sha256', settings.osMailSecret).update(value).digest('hex');
  const keyHash = hashToken(`charitology-os-mail:${key}`);
  const payloadHash = hmac(JSON.stringify(payload));
  const recipientHash = hmac(payload.to);
  if(payload.purpose==='participation')return handleParticipationMail({db,mail,settings,logger,payload,keyHash,payloadHash,recipientHash});
  let reservation;
  try { reservation = await db.reserveOsMail({ keyHash, payloadHash, purpose: payload.purpose, recipientHash, rateKeys: osMailRateKeys(recipientHash) }); }
  catch { logger(); return result(503, { ok: false, message: 'Transactional delivery is temporarily unavailable.' }); }
  if (!reservation.reserved) {
    if (reservation.state === 'accepted') return result(200, { ok: true, accepted: true, duplicate: true });
    if (reservation.state === 'limited') return result(429, { ok: false, message: 'Transactional request limit reached.' });
    if (reservation.state === 'failed') return result(503, { ok: false, message: 'The previous attempt failed. Request a fresh action rather than resending this key.' });
    return result(409, { ok: false, message: reservation.state === 'conflict' ? 'This idempotency key belongs to another payload.' : 'The prior attempt is in progress or unresolved; no automatic resend occurred.' });
  }
  let attempted = false;
  try {
    await mail.ready({ system: true });
    attempted = true;
    const sent = await mail.sendOsMail(renderOsMail(payload), `os-${keyHash}`);
    if (typeof sent?.id !== 'string' || sent.id.length > 100 || !/^[A-Za-z0-9_-]+$/.test(sent.id)) throw new Error('Provider acceptance could not be confirmed');
    await db.finishOsMail(keyHash, payloadHash, 'accepted', sent.id);
    return result(202, { ok: true, accepted: true, duplicate: false });
  } catch (error) {
    const state = attempted && error?.ambiguous !== false ? 'unknown' : 'failed';
    await db.finishOsMail(keyHash, payloadHash, state).catch(() => {});
    logger();
    return result(503, { ok: false, message: 'Transactional delivery could not be confirmed. No automatic resend will occur.' });
  }
}

function participationResponse(outcome,status=200){return {status,body:{ok:['accepted','delivered','suppressed'].includes(outcome.state),...outcome}};}
const outcomeStatus=state=>['accepted','delivered','suppressed'].includes(state)?200:state==='limited'?429:['unknown','creating'].includes(state)?409:503;
async function handleParticipationMail({db,mail,settings,logger,payload,keyHash,payloadHash,recipientHash}){
  let existing;
  try{existing=await db.osMailIntent(keyHash);}catch{logger();return participationResponse({state:'unknown',safeCode:'intent_lookup_unavailable',providerEventAt:null},503);}
  if(existing&&existing.payload_hash!==payloadHash)return participationResponse({state:'unknown',safeCode:'intent_conflict',providerEventAt:null},409);
  if(existing&&(existing.state!=='preflight'||existing.attempted_at)){const outcome=osMailOutcome(existing);return participationResponse(outcome,outcomeStatus(outcome.state));}
  // Existing possible attempts are resolved before configuration gates. A gate
  // cannot disguise an accepted/unknown intent as permission to start again.
  if(!settings.participationEnabled||settings.participationTestOnly&&(!normalizeEmail(settings.participationTestRecipient)||payload.to!==settings.participationTestRecipient))return participationResponse({state:'unavailable',safeCode:'preflight_unavailable',providerEventAt:null},503);
  let reservation;
  try{reservation=await db.reserveOsMail({keyHash,payloadHash,purpose:'participation',recipientHash,correlationHash:osMailCorrelation(settings,keyHash),rateKeys:[]});}
  catch{logger();return participationResponse({state:'unknown',safeCode:'reservation_unconfirmed',providerEventAt:null},503);}
  if(!reservation.reserved){if(reservation.state==='conflict')return participationResponse({state:'unknown',safeCode:'intent_conflict',providerEventAt:null},409);const outcome=osMailOutcome(reservation);return participationResponse(outcome,outcomeStatus(outcome.state));}
  let phase='preflight';
  try{
    const bounded=typeof mail.withDeadline==='function'?mail.withDeadline(Date.now()+15000):mail;
    await bounded.ready({system:true});
    if(await bounded.suppression(payload.to)){
      await db.finishParticipationMail(keyHash,payloadHash,'failed','recipient_suppressed',{facts:{suppressed:null}});
      return participationResponse({state:'suppressed',safeCode:'provider_suppressed',providerEventAt:null});
    }
    phase='checkpoint';
    const marked=await db.markOsMailAttempt({keyHash,payloadHash,rateKeys:osMailRateKeys(recipientHash)});
    if(!marked.attempt){const outcome=osMailOutcome(marked);return participationResponse(outcome,outcomeStatus(outcome.state));}
    phase='provider';
    const sent=await bounded.sendOsMail(renderOsMail(payload),`os-${keyHash}`,{correlationTag:osMailCorrelation(settings,keyHash)});
    if(!providerId(sent?.id))throw new Error('Unconfirmed acceptance');
    await db.finishParticipationMail(keyHash,payloadHash,'accepted','provider_accepted',{providerId:sent.id});
    const saved=await db.osMailIntent(keyHash),outcome=osMailOutcome(saved);
    return participationResponse(outcome,outcome.state==='accepted'?202:outcomeStatus(outcome.state));
  }catch(error){
    const state=phase==='preflight'?'preflight':phase==='provider'&&error?.ambiguous===false?'failed':'unknown';
    const safeCode=state==='preflight'?'preflight_unavailable':state==='failed'?'provider_rejected':'attempt_unconfirmed';
    try{await db.finishParticipationMail(keyHash,payloadHash,state,safeCode);const saved=await db.osMailIntent(keyHash);if(saved){const outcome=osMailOutcome(saved);logger();return participationResponse(outcome,outcomeStatus(outcome.state));}}catch{}
    logger();return participationResponse({state:'unknown',safeCode:'attempt_unconfirmed',providerEventAt:null},503);
  }
}

export async function handleOsMailStatus(request,{db,mail,settings,logger=()=>{}}){
  const reply=(status,state,safeCode,providerEventAt=null,ok=false)=>({status,body:{ok,state,safeCode,providerEventAt}});
  if(!authorized(request,settings.osMailSecret||''))return reply(401,'unavailable','authentication_required');
  if(request.headers.has('origin'))return reply(403,'unavailable','server_only');
  const url=new URL(request.url),query=new URLSearchParams(url.search),paths=query.getAll('path');
  // Vercel's API rewrite contributes one routing capture, never request data.
  if(paths.length===1&&paths[0]===url.pathname.slice(5))query.delete('path');
  if(query.size||!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return reply(400,'unavailable','invalid_request');
  let input;
  try{input=JSON.parse(await boundedBody(request,1024));}catch{return reply(400,'unavailable','invalid_request');}
  if(!plain(input)||Object.keys(input).length!==1||!keyPattern.test(input.idempotencyKey||'')||typeof input.idempotencyKey!=='string')return reply(400,'unavailable','invalid_request');
  try{
    if(!await db.rate([{key:`os-mail:status:minute:${Math.floor(Date.now()/60000)}`,limit:60}]))return reply(429,'unavailable','status_rate_limited');
    const keyHash=osMailKeyHash(input.idempotencyKey);
    let row=await db.osMailIntent(keyHash);
    if(!row||row.purpose!=='participation')return reply(200,'unknown','intent_unknown',null,true);
    if(row.provider_id&&typeof mail.getEmail==='function'){
      try{
        const bounded=typeof mail.withDeadline==='function'?mail.withDeadline(Date.now()+10000):mail;
        const email=await bounded.getEmail(row.provider_id);
        if(email.id!==row.provider_id||email.from!==FROM||email.subject!==PARTICIPATION_SUBJECT||email.to.length!==1||osMailHmac(settings,normalizeEmail(email.to[0])||'')!==row.recipient_hash)throw new Error('Unbound provider observation');
        row=await db.observeParticipationMail(keyHash,row.provider_id,email.last_event);
      }catch{logger();/* Cached durable evidence remains authoritative on a read outage. */}
    }
    return {status:200,body:{ok:true,...osMailOutcome(row)}};
  }catch{logger();return reply(503,'unavailable','status_unavailable');}
}

// Called inside the same transaction as the shared callback dedupe/newsletter
// reducer. No provider I/O and no new send/recipient/consent can originate here.
export async function applyOsMailFeedback(client,event,settings){
  const emailType=typeof event.type==='string'&&event.type.startsWith('email.')?event.type.slice(6):null;
  const suppression=event.type==='suppression.added';
  if(!factTypes.includes(emailType)&&!suppression)return;
  const at=providerEventTime(event.created_at);if(!at)return;
  const data=event.data;if(!plain(data))return;
  const id=suppression?data.source_id:data.email_id;
  const correlation=!suppression&&plain(data.tags)&&typeof data.tags.os_delivery==='string'&&/^[a-f0-9]{64}$/.test(data.tags.os_delivery)?data.tags.os_delivery:null;
  if(!providerId(id)||!settings.osMailSecret)return;
  const recipient=suppression?normalizeEmail(data.email):Array.isArray(data.to)&&data.to.length===1?normalizeEmail(data.to[0]):null;
  if(!recipient||!suppression&&(data.from!==FROM||data.subject!==PARTICIPATION_SUBJECT))return;
  const rows=(await client.query("SELECT * FROM newsletter_os_mail_intents WHERE purpose='participation' AND (provider_id=$1 OR correlation_hash=$2) FOR UPDATE",[id,correlation])).rows;
  if(rows.length!==1)return;
  const row=rows[0];
  if(row.recipient_hash!==osMailHmac(settings,recipient)||row.provider_id&&row.provider_id!==id||!row.attempted_at)return;
  const facts=mergeProviderFacts(row.provider_facts,suppression?'suppressed':emailType,at);
  await client.query("UPDATE newsletter_os_mail_intents SET state=CASE WHEN state IN ('creating','unknown') THEN 'accepted' ELSE state END,provider_id=COALESCE(provider_id,$2),provider_facts=$3,updated_at=now() WHERE key_hash=$1",[row.key_hash,id,JSON.stringify(facts)]);
}
