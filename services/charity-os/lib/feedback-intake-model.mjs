/** Data-only profile for anonymous process feedback. No routing or write authority. */
import {isProxy} from 'node:util/types';

export const FEEDBACK_INTAKE_PROFILE = 'anonymous-process-v1';
export const FEEDBACK_INTAKE_CONSENT = 'I agree that the organization may review these selections to improve its processes.';
const title = 'Share feedback about a process';
const purpose = 'Tell the organization whether its information, forms or next steps were easy to use.';
const topic = Object.freeze(['Finding information','Using a form','Understanding next steps','Another process issue']);
const experience = Object.freeze(['Clear','Hard to follow','Could not finish']);
const questions = Object.freeze([
  Object.freeze({key:'topic',label:'What were you trying to do?',type:'select',required:true,options:topic}),
  Object.freeze({key:'experience',label:'How did it go?',type:'select',required:true,options:experience}),
]);
const fail = (code, message) => { throw Object.assign(Error(message), {code, status:422}); };
const badSchema = () => fail('feedback_schema','Use the fixed anonymous process feedback questions.');
const badAnswers = () => fail('feedback_choices','Choose one listed answer for each feedback question.');
function readShape(value, keys, bad) {
  if (!value || typeof value !== 'object' || isProxy(value) || Object.getPrototypeOf(value)!==Object.prototype) return bad();
  const own=Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(own).length!==keys.length || !keys.every(k=>Object.hasOwn(own,k)&&own[k].enumerable&&Object.hasOwn(own[k],'value'))) return bad();
  return Object.fromEntries(keys.map(k=>[k,own[k].value]));
}
function readList(value, count) {
  if (!value || isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value)!==Array.prototype) return badSchema();
  const own=Object.getOwnPropertyDescriptors(value);
  if (own.length?.value!==count||Reflect.ownKeys(own).length!==count+1) return badSchema();
  return Array.from({length:count},(_,i)=>{
    if(!Object.hasOwn(own,i)||!own[i].enumerable||!Object.hasOwn(own[i],'value'))return badSchema();
    return own[i].value;
  });
}
function validDate(s) {
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const d=new Date(s+'T00:00:00.000Z');
  return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;
}
function receivedDate(s) {
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:\d{3})?Z$/.test(s))
    return fail('feedback_received_time','The original received time must be a verified UTC instant.');
  const iso=s.slice(0,23)+'Z', d=new Date(iso);
  if(!Number.isFinite(+d)||d.toISOString()!==iso)
    return fail('feedback_received_time','The original received time must be a verified UTC instant.');
  return s.slice(0,10);
}
export function feedbackPublicationSchema(retentionUntil) {
  if (!validDate(retentionUntil)) return fail('feedback_retention','Choose a valid feedback retention review date.');
  return Object.freeze({kind:'feedback',profile:FEEDBACK_INTAKE_PROFILE,title,purpose,questions,retentionUntil});
}
export function requireFeedbackPublicationSchema(value) {
  const v=readShape(value,['kind','profile','title','purpose','questions','retentionUntil'],badSchema);
  if(v.kind!=='feedback'||v.profile!==FEEDBACK_INTAKE_PROFILE||v.title!==title||v.purpose!==purpose)return badSchema();
  const received=readList(v.questions,questions.length);
  for (const [i,expected] of questions.entries()) {
    const q=readShape(received[i],['key','label','type','required','options'],badSchema);
    if(q.key!==expected.key||q.label!==expected.label||q.type!==expected.type||q.required!==true||
      !readList(q.options,expected.options.length).every((x,n)=>x===expected.options[n]))return badSchema();
  }
  return feedbackPublicationSchema(v.retentionUntil);
}
export function feedbackSelection(input) {
  const {topic:area,experience:rating}=readShape(input,['topic','experience'],badAnswers);
  if (!topic.includes(area)||!experience.includes(rating))return badAnswers();
  return Object.freeze({topic:area,experience:rating});
}
/** Creates one working Feedback summary from fixed labels. The caller owns
 * the actual reviewed intake row, its true received time, authorization and save. */
export function proposedFeedbackDraft(input) {
  const {answers,receivedAt}=readShape(input,['answers','receivedAt'],badAnswers);
  const selected=feedbackSelection(answers);
  return Object.freeze({moduleId:'feedback',status:'received',data:Object.freeze({
    title:selected.topic+' · '+selected.experience,kind:'feedback-summary',channel:'anonymous',
    publicationConsent:'withheld',responses:1,resolution:'needs-review',receivedDate:receivedDate(receivedAt),
  })});
}
