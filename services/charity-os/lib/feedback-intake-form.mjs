/** Staff form starter and exact check for its approved data projection.
 * Approval, actor authority and retention at the current clock are route gates. */
import {isProxy} from 'node:util/types';
import {feedbackPublicationSchema} from './feedback-intake-model.mjs';

const fail=()=>{throw Object.assign(Error('Use the fixed anonymous process feedback form with no external form link.'),{status:422,code:'feedback_form_profile'});};
const read=(o,k)=>{
  const d=Object.getOwnPropertyDescriptor(o,k);
  if(!d||!d.enumerable||!Object.hasOwn(d,'value'))return fail();
  return d.value;
};
export function proposedFeedbackForm(retentionUntil) {
  const schema=feedbackPublicationSchema(retentionUntil);
  return Object.freeze({moduleId:'forms',status:'draft',data:Object.freeze({
    title:schema.title,kind:'form',version:1,purpose:schema.purpose,
    definition:JSON.stringify(schema.questions),consentRequired:true,anonymous:true,
    retentionUntil:schema.retentionUntil,collectionUrl:null,
  })});
}
export function feedbackSchemaFromReviewedFormData(input) {
  if(!input||typeof input!=='object'||isProxy(input)||Object.getPrototypeOf(input)!==Object.prototype)return fail();
  const schema=feedbackPublicationSchema(read(input,'retentionUntil'));
  const version=read(input,'version');
  if(read(input,'kind')!=='form'||!Number.isSafeInteger(version)||version<1||
     read(input,'title')!==schema.title||read(input,'purpose')!==schema.purpose||
     read(input,'definition')!==JSON.stringify(schema.questions)||read(input,'anonymous')!==true||
     read(input,'consentRequired')!==true||read(input,'collectionUrl')!==null)return fail();
  return schema;
}
