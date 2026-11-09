import test from 'node:test';import assert from 'node:assert/strict';
import {feedbackPublicationSchema,requireFeedbackPublicationSchema,feedbackSelection,proposedFeedbackDraft} from '../lib/feedback-intake-model.mjs';

test('fixed publication can travel through plain JSON but rejects edits and new identity fields',()=>{
  const exact=feedbackPublicationSchema('2027-06-14'), raw=JSON.parse(JSON.stringify(exact));
  assert.deepEqual(requireFeedbackPublicationSchema(raw),exact);
  for(const change of [
    v=>v.profile='unknown',v=>v.title='Please give your name',v=>v.questions.reverse(),
    v=>v.questions[0].options.push('Other free text'),v=>v.questions[0].type='text',
    v=>v.questions[0].required=false,v=>v.questions.push({key:'email'}),v=>v.retentionUntil='2027-02-31',
  ]){
    const v=structuredClone(raw);change(v);assert.throws(()=>requireFeedbackPublicationSchema(v),e=>e.status===422);
  }
});
test('schema and answers refuse accessor, proxy and decorated question containers without reading them',()=>{
  let executed=0;
  const answers={topic:'Using a form',get experience(){executed++;return 'Clear';}};
  assert.throws(()=>feedbackSelection(answers),{code:'feedback_choices'});
  const trap=new Proxy({topic:'Using a form',experience:'Clear'},{getOwnPropertyDescriptor(){executed++;throw Error('unexpected');}});
  assert.throws(()=>feedbackSelection(trap),{code:'feedback_choices'});
  const schema=JSON.parse(JSON.stringify(feedbackPublicationSchema('2027-06-14')));
  Object.defineProperty(schema.questions,'0',{enumerable:true,get(){executed++;}});
  assert.throws(()=>requireFeedbackPublicationSchema(schema),{code:'feedback_schema'});
  assert.equal(executed,0);
});
test('choices reject extra data, arrays, spelling variants and values outside the fixed profile',()=>{
  const good={topic:'Using a form',experience:'Clear'};
  assert.deepEqual(feedbackSelection(good),good);
  for(const v of [{...good,email:'fiction@example.invalid'},{...good,experience:'clear'},
    {...good,topic:'Using a form '},{...good,experience:['Clear']},{topic:'Using a form'},null])
    assert.throws(()=>feedbackSelection(v),{code:'feedback_choices'});
});
test('one private draft uses only fixed labels and a verified UTC date and cannot imply publication consent',()=>{
  const draft=proposedFeedbackDraft({answers:{topic:'Understanding next steps',experience:'Could not finish'},receivedAt:'2027-06-14T23:59:59.999999Z'});
  assert.deepEqual(draft,{moduleId:'feedback',status:'received',data:{title:'Understanding next steps · Could not finish',kind:'feedback-summary',
    channel:'anonymous',publicationConsent:'withheld',responses:1,resolution:'needs-review',receivedDate:'2027-06-14'}});
  assert(Object.isFrozen(draft)&&Object.isFrozen(draft.data));
  for (const receivedAt of ['2027-02-29T01:00:00.000Z','2027-06-14T24:00:00.000Z','2027-06-14T13:00:00.000-04:00',null])
    assert.throws(()=>proposedFeedbackDraft({answers:{topic:'Using a form',experience:'Clear'},receivedAt}),{code:'feedback_received_time'});
});
