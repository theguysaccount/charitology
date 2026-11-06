import {CharityStartError, prepareCharityStartPlan, type CharityStartPlan, type CharityStartRaw} from '../../data/charity-start.mjs';

/** Bounded page state only. No storage, network, form submission or automatic OS writes. */
export function mountCharityStartPlanner(root:HTMLElement):()=>void {
  const controls=root.querySelector<HTMLFieldSetElement>('[data-start-controls]');
  const status=root.querySelector<HTMLElement>('[data-start-status]');
  if(!controls||!status)return ()=>{};
  const job=root.querySelector<HTMLSelectElement>('[data-start-job]');
  const owner=root.querySelector<HTMLInputElement>('[data-start-owner]');
  const date=root.querySelector<HTMLInputElement>('[data-start-date]');
  const review=root.querySelector<HTMLButtonElement>('[data-start-review]');
  const preview=root.querySelector<HTMLElement>('[data-start-preview]');
  const text=root.querySelector<HTMLElement>('[data-start-text]');
  const ack=root.querySelector<HTMLInputElement>('[data-start-ack]');
  const download=root.querySelector<HTMLButtonElement>('[data-start-download]');
  const groups=[...root.querySelectorAll<HTMLFieldSetElement>('[data-start-steps]')];
  if(!job||!owner||!date||!review||!preview||!text||!ack||!download||groups.length!==6){status.textContent='The planner could not start. The complete checklists below remain available.';return ()=>{};}
  let reviewed:CharityStartPlan|null=null;
  let disposed=false;
  const activeUrls=new Map<string,ReturnType<typeof setTimeout>>();
  const message=(value:string,focus=false)=>{status.textContent=value;if(focus)status.focus();};
  const invalidate=()=>{reviewed=null;ack.checked=false;ack.disabled=true;download.disabled=true;preview.hidden=true;text.textContent='';};
  const syncGroups=()=>groups.forEach(group=>{const active=group.dataset.startSteps===job.value;group.hidden=!active;group.disabled=!active;});
  const raw=():CharityStartRaw=>{
    if(disposed)throw new Error('Planner closed');
    if(date.validity.badInput)throw new CharityStartError('Correct the review date, or clear it to leave it unknown.','reviewDate');
    const selected=groups.find(group=>group.dataset.startSteps===job.value);
    return {jobId:job.value,ownerRole:owner.value,reviewDate:date.value,completed:[...(selected?.querySelectorAll<HTMLInputElement>('[data-start-step]')??[])].map(input=>input.checked)};
  };
  const changed=()=>{const hadReview=reviewed!==null;invalidate();syncGroups();if(hadReview)message('The plan changed. Review it again before downloading.');};
  const problem=(error:unknown)=>{message(error instanceof CharityStartError?error.message:'The action could not finish. Your choices and fields remain on this page; try again.',true);};
  const onReview=()=>{
    invalidate();
    try{
      const plan=prepareCharityStartPlan(raw());
      reviewed=plan;text.textContent=plan.markdown;preview.hidden=false;ack.disabled=false;
      message('Plan prepared. Inspect the exact text and its limits, then mark it reviewed before downloading.',true);
    }catch(error){problem(error);}
  };
  const onAck=()=>{download.disabled=!ack.checked||reviewed===null;};
  const onDownload=()=>{
    if(!reviewed||!ack.checked||disposed)return;
    try{
      const current=prepareCharityStartPlan(raw());
      if(current.signature!==reviewed.signature){invalidate();message('The fields no longer match the inspected plan. Review them again.',true);return;}
      const href=URL.createObjectURL(new Blob([reviewed.markdown],{type:'text/markdown;charset=utf-8'}));
      let anchor:HTMLAnchorElement|null=null;
      try{anchor=root.ownerDocument.createElement('a');anchor.href=href;anchor.download=reviewed.filename;anchor.hidden=true;root.ownerDocument.body.append(anchor);anchor.click();}
      finally{anchor?.remove();const timer=setTimeout(()=>{URL.revokeObjectURL(href);activeUrls.delete(href);},1000);activeUrls.set(href,timer);}
      message('Download requested. Check your browser for the saved file; these choices remain on this page.');
    }catch(error){problem(error);}
  };
  const revoke=()=>{for(const [href,timer] of activeUrls){clearTimeout(timer);URL.revokeObjectURL(href);}activeUrls.clear();};
  const onPageHide=()=>{invalidate();revoke();message('Review your retained choices again before downloading.');};
  // Install interception and state invalidation before enabling the unnamed inputs.
  controls.addEventListener('input',changed);controls.addEventListener('change',changed);
  review.addEventListener('click',onReview);ack.addEventListener('change',onAck);download.addEventListener('click',onDownload);
  window.addEventListener('pagehide',onPageHide);
  syncGroups();controls.disabled=false;message('Choose one job. Optional blank fields stay unknown.');
  return ()=>{disposed=true;invalidate();revoke();controls.disabled=true;controls.removeEventListener('input',changed);controls.removeEventListener('change',changed);review.removeEventListener('click',onReview);ack.removeEventListener('change',onAck);download.removeEventListener('click',onDownload);window.removeEventListener('pagehide',onPageHide);};
}
