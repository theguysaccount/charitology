import {createGiftEstimateDesk, GiftEstimateError, ESTIMATE_LIMITS, ESTIMATE_METHOD, type GiftEstimateDesk, type GiftFileHandle, type EstimateReview,
  type HistoricalPacket, type EstimateForm} from './model';
import {WRITING_KEYS, makeEstimateWriting, parseEstimateWriting, sameEstimateWriting, type EstimateWriting} from './writing';
import {sha256Bytes} from '../model-bundles/codec.mjs';

export interface EstimateUIPlatform {
  desk: GiftEstimateDesk;
  now(): string;
  read(file: File, signal: AbortSignal, maximum: number): Promise<Uint8Array>;
  download(bytes: Uint8Array, filename: string): Promise<void>;
  events: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}
/** Actual FileReader is bounded and cancellable. Hash completion is checked by the
 * caller too; cancelling an unabortable operation never makes an old choice live. */
export function readEstimateFile(file: File, signal: AbortSignal, maximum: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > maximum || signal.aborted) { reject(new Error('file-limit-or-cancel')); return; }
    const reader = new FileReader(); let settled = false;
    const finish = (error: Error | null, value?: Uint8Array) => {
      if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      reader.onload = reader.onerror = reader.onabort = null;
      if (error) reject(error); else resolve(value!);
    };
    const abort = () => { try { reader.abort(); } finally { finish(new Error('file-cancelled')); } };
    const timer = setTimeout(() => { try { reader.abort(); } finally { finish(new Error('file-timeout')); } }, ESTIMATE_LIMITS.fileReadMs);
    reader.onload = () => { if (!(reader.result instanceof ArrayBuffer) || reader.result.byteLength !== file.size || reader.result.byteLength > maximum) finish(new Error('file-bytes'));
      else finish(null, new Uint8Array(reader.result)); };
    reader.onerror = () => finish(new Error('file-read')); reader.onabort = () => finish(new Error('file-cancelled'));
    signal.addEventListener('abort', abort, {once: true});
    try { reader.readAsArrayBuffer(file); } catch { finish(new Error('file-read')); }
  });
}
const ERROR_TEXT: Record<string, string> = {
  'writing-representation': 'These imported fields cannot be represented exactly by these controls. Their literal inspection remains available; current writing is unchanged.',
  'gift-format': 'Choose a native Giving Dashboard JSON export. Other formats stay unsupported.',
  'gift-required': 'Choose the original gift export and select one recorded gift.',
  'model-required': 'Choose an exact native selected Model Kit bundle.',
  'reproduction-required': 'Reproduce this chosen model here. Its complete run must match before an estimate is available.',
  'source-required': 'The model must identify a source artifact. Choose that original file for a fresh checksum.',
  'source-mismatch': 'The chosen source bytes do not match the model’s referenced artifact. The estimate stays Unknown.',
  'money-incompatible': 'This method requires nominal USD and a known model price year equal to the logged gift year.',
  'period-incompatible': 'The model needs an exact day-precision cost period containing this gift date.',
  'gift-money-basis': 'Explicitly interpret this logged amount as nominal USD in its gift year, or leave the estimate Unknown.',
  'cost-floor-cents': 'The source’s raw lower cost must establish positive, exact plain-decimal USD cents within the safe bound. No rounding or legacy token repair is applied.',
  'funding-bound': 'The mapped portion must fit both the logged gift and every supported source budget, including its lower bound.',
  'illustrative-real-gift': 'An illustrative model cannot qualify a nonsample gift. The estimate stays Unknown.',
  'requalification-mismatch': 'The original gift file, chosen row, model, mapping or derived result differs from this saved case. Its historical estimate is not requalified.',
  'unsupported-engine': 'This selected model’s engine is unsupported. Supplied source text is not executed.',
  'unsupported-method': 'This saved estimate uses an unsupported method. Its figures are not current authority.',
  'arithmetic-range': 'The arithmetic cannot safely represent this estimate. No clipped or invented zero is reported.',
  'byte-limit': 'This complete file or outgoing copy exceeds its stated limit. Nothing was truncated.',
  'amount': 'Enter a positive mapped USD amount with at most two decimal places; no currency symbols or exponents.',
  'credit': 'Enter an explicit donor-credit percentage from 0 to 100, with at most two decimal places. Blank stays unknown.',
  'acknowledgement': 'Acknowledge this case’s assumptions and limits before continuing.',
};
function problem(error: unknown): string {
  const code = (error as {code?: string})?.code ?? '';
  if (code.startsWith('missing-')) return 'Complete each authored assumption, or leave the estimate Unknown. Your literal writing remains here.';
  return ERROR_TEXT[code] ?? 'This action could not finish. The estimate stays Unknown. Your literal writing and chosen file remain available for a deliberate retry.';
}
function showNumber(value: number): string {
  if (value === 0) return '0';
  return value < 0.0001 || value >= 1e9 ? value.toExponential(6) : value.toLocaleString('en-US', {maximumSignificantDigits: 8});
}

/** Trusted I/O seams support mounted tests; imported files cannot choose a seam.
 * The default uses the real fixed model worker, native reads and Blob download. */
export function mountGiftEstimateDesk(root: HTMLElement, supplied?: EstimateUIPlatform): () => void {
  const find = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#ge-${id}`);
  const form = find<HTMLFormElement>('form'), controls = find<HTMLFieldSetElement>('controls'), status = find<HTMLElement>('status');
  if (!form || !controls || !status) return () => {};
  const giftInput = find<HTMLInputElement>('gift-file'), modelInput = find<HTMLInputElement>('model-file'), sourceInput = find<HTMLInputElement>('source-file'),
    packetInput = find<HTMLInputElement>('packet-file'), writingInput = find<HTMLInputElement>('writing-file'), giftSelect = find<HTMLSelectElement>('gift-select'),
    reproduce = find<HTMLButtonElement>('reproduce'), reviewNew = find<HTMLButtonElement>('review'), requalify = find<HTMLButtonElement>('requalify'),
    prepare = find<HTMLButtonElement>('prepare'), ack = find<HTMLInputElement>('ack'), download = find<HTMLButtonElement>('download'),
    usePacket = find<HTMLButtonElement>('use-packet'), replacePacket = find<HTMLInputElement>('replace-packet'),
    saveWriting = find<HTMLButtonElement>('save-writing'), applyWriting = find<HTMLButtonElement>('apply-writing'), replaceWriting = find<HTMLInputElement>('replace-writing'),
    limits = find<HTMLInputElement>('acknowledgeLimits'), result = find<HTMLElement>('result'), outgoing = find<HTMLElement>('outgoing'),
    giftFacts = find<HTMLElement>('gift-facts'), modelFacts = find<HTMLElement>('model-facts'), sourceFacts = find<HTMLElement>('source-facts'),
    packetFacts = find<HTMLElement>('packet-facts'), writingFacts = find<HTMLElement>('writing-facts');
  const writingControls = Object.fromEntries(WRITING_KEYS.map(key => [key, find<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(key)])) as Record<(typeof WRITING_KEYS)[number], HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
  if (!giftInput || !modelInput || !sourceInput || !packetInput || !writingInput || !giftSelect || !reproduce || !reviewNew || !requalify || !prepare || !ack || !download ||
    !usePacket || !replacePacket || !saveWriting || !applyWriting || !replaceWriting || !limits || !result || !outgoing || !giftFacts || !modelFacts || !sourceFacts || !packetFacts || !writingFacts ||
    WRITING_KEYS.some(key => !writingControls[key])) { status.textContent = 'The desk could not start. The method and limits below remain readable.'; return () => {}; }
  const document = root.ownerDocument, urls = new Map<string, ReturnType<typeof setTimeout>>();
  const defaultDownload = async (bytes: Uint8Array, filename: string) => {
    const href = URL.createObjectURL(new Blob([new Uint8Array(bytes)], {type: 'application/json;charset=utf-8'})); let anchor: HTMLAnchorElement | null = null;
    try { anchor = document.createElement('a'); anchor.href = href; anchor.download = filename; anchor.hidden = true; document.body.append(anchor); anchor.click(); }
    finally { anchor?.remove(); const timer = setTimeout(() => { URL.revokeObjectURL(href); urls.delete(href); }, 1000); urls.set(href, timer); }
  };
  const platform: EstimateUIPlatform = supplied ?? {desk: createGiftEstimateDesk(), now: () => new Date().toISOString(), read: readEstimateFile, download: defaultDownload, events: window};
  const desk = platform.desk, listeners: (() => void)[] = [], reads = new Set<AbortController>(), choices = new Map<HTMLInputElement, File>();
  let disposed = false, serial = 1, pending = 0, gifts: GiftFileHandle | null = null, modelReady = false, matched = false, sourceReady = false;
  let review: EstimateReview | null = null, prepared: Uint8Array | null = null, packet: HistoricalPacket | null = null, packetWriting: EstimateWriting | null = null, importedWriting: EstimateWriting | null = null;
  const active = () => !disposed && root.isConnected;
  const choicesCurrent = () => [...choices].every(([input, file]) => input.files?.[0] === file);
  const current = (captured: number) => active() && captured === serial && choicesCurrent();
  const message = (text: string, error = false, focus = false) => { if (!active()) return; status.textContent = text; status.dataset.error = String(error); if (focus && status.isConnected) status.focus(); };
  const rawWriting = (): EstimateWriting => Object.fromEntries(WRITING_KEYS.map(key => [key, writingControls[key].value])) as EstimateWriting;
  const raw = (): EstimateForm => ({...rawWriting(), acknowledgeLimits: limits.checked});
  const sync = () => {
    const ready = active() && pending === 0 && choicesCurrent();
    reproduce.disabled = !ready || !modelReady; reviewNew.disabled = !ready || !gifts || !giftSelect.value || !matched || !sourceReady;
    requalify.disabled = reviewNew.disabled || !packet || !packetWriting || !sameEstimateWriting(rawWriting(), packetWriting);
    prepare.disabled = !ready || !review; ack.disabled = !ready || !prepared; download.disabled = !ready || !prepared || !ack.checked;
    usePacket.disabled = !ready || !packet || !replacePacket.checked; applyWriting.disabled = !ready || !importedWriting || !replaceWriting.checked;
    giftSelect.disabled = !gifts; sourceInput.disabled = !modelReady; root.setAttribute('aria-busy', String(pending > 0));
  };
  const abortReads = () => { for (const controller of reads) controller.abort(); reads.clear(); };
  const invalidate = () => { serial++; abortReads(); desk.invalidateReview(); review = null; prepared = null; ack.checked = false;
    outgoing.textContent = ''; result.textContent = 'Unknown — no current reviewed conditional estimate.'; sync(); };
  const changed = () => { invalidate(); message('Writing changed. Review the current case again; saved historical figures supply no current qualification.'); };
  const listen = (target: EventTarget, type: string, listener: EventListener) => { target.addEventListener(type, listener); listeners.push(() => target.removeEventListener(type, listener)); };
  const work = async (action: (captured: number) => Promise<void>, preserveReviewOnFailure = false) => {
    if (!active()) return; if (!choicesCurrent()) { invalidate(); message('A native file choice changed outside this review. Choose that source again; no earlier estimate can be downloaded.', true, true); return; }
    const captured = serial; pending++; sync();
    try { await action(captured); } catch (error) { if (current(captured)) { if (!preserveReviewOnFailure) { review = null; prepared = null; ack.checked = false; outgoing.textContent = ''; result.textContent = 'Unknown — this action is not qualified.'; }
      message(preserveReviewOnFailure ? 'The download could not finish. Your exact reviewed candidate and literal writing remain here for deliberate retry.' : problem(error), true, true); } }
    finally { pending--; if (active()) sync(); }
  };
  function pick(input: HTMLInputElement, cap: number, begin: () => void, admit: (bytes: Uint8Array, captured: number) => Promise<void>) {
    listen(input, 'click', () => { if (!active()) return; invalidate(); input.value = ''; choices.delete(input); begin(); sync(); });
    listen(input, 'change', () => {
      if (!active()) return; invalidate(); choices.delete(input); begin(); const file = input.files?.[0]; if (file) choices.set(input, file); sync(); if (!file) { message('File selection was canceled. Your authored fields remain; this source has no current authority.'); return; }
      void work(async captured => {
        const controller = new AbortController(); reads.add(controller);
        try { const bytes = await platform.read(file, controller.signal, cap); if (!current(captured) || input.files?.[0] !== file || controller.signal.aborted) return;
          await admit(bytes, captured); }
        finally { reads.delete(controller); }
      });
    });
    listen(input, 'cancel', () => { if (active()) { invalidate(); choices.delete(input); begin(); sync(); message('File selection was canceled. Your authored fields remain; choose a source again before review.'); } });
  }
  pick(giftInput, ESTIMATE_LIMITS.gifts, () => { desk.beginGiftChoice(); gifts = null; giftSelect.replaceChildren(); giftFacts.textContent = 'No gift file chosen. Other gifts remain Unknown.'; }, async (bytes, captured) => {
    const handle = await desk.admitGifts(bytes); if (!current(captured)) return; const chosen = desk.inspectGifts(handle); gifts = handle;
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Select one gift deliberately'; giftSelect.append(empty);
    for (const gift of chosen.gifts) { const option = document.createElement('option'); option.value = gift.id; option.textContent = `${gift.date} · logged amount ${gift.amount.toFixed(2)} · currency undeclared · ${gift.organization}${gift.sample ? ' · Sample' : ''}`; giftSelect.append(option); }
    giftSelect.value = ''; giftFacts.textContent = JSON.stringify({...chosen, gifts: undefined, rowsInChosenFile: chosen.gifts.length}, null, 2);
    message('Gift file inspected. Its format does not declare lifetime coverage. Select one row.');
  });
  listen(giftSelect, 'change', () => { invalidate(); if (!gifts || !giftSelect.value) return;
    try { const selected = desk.selectGift(gifts, giftSelect.value); giftFacts.textContent = JSON.stringify({selectedGift: selected, otherGifts: 'Unknown — not mapped', coverage: 'Unspecified by native format'}, null, 2); message('One gift selected. Organization, cause and depth never supply an automatic source match.'); }
    catch (error) { message(problem(error), true, true); } sync(); });
  pick(modelInput, ESTIMATE_LIMITS.selected, () => { desk.beginModelChoice(); modelReady = matched = sourceReady = false; sourceInput.value = ''; choices.delete(sourceInput); modelFacts.textContent = 'No selected model chosen.'; sourceFacts.textContent = 'No fresh source checksum.'; }, async (bytes, captured) => {
    const inspection = await desk.admitModel(bytes); if (!current(captured)) return; modelReady = true; matched = sourceReady = false;
    modelFacts.textContent = JSON.stringify(inspection, null, 2); message('Selected model inspected, not reproduced. Its supplied engine text is inert. Reproduce explicitly.');
  });
  pick(sourceInput, ESTIMATE_LIMITS.artifact, () => { desk.beginSourceChoice(); sourceReady = false; sourceFacts.textContent = 'No fresh source checksum.'; }, async (bytes, captured) => {
    const checksum = await desk.admitSource(bytes, platform.now()); if (!current(captured)) return; sourceReady = true;
    sourceFacts.textContent = JSON.stringify(checksum, null, 2); message('Source bytes match. This does not verify factual accuracy, applicability, rights or independent review.');
  });
  pick(packetInput, ESTIMATE_LIMITS.packet, () => { packet = null; packetWriting = null; replacePacket.checked = false; packetFacts.textContent = 'No saved estimate inspected.'; }, async (bytes, captured) => {
    const handle = await desk.admitPacket(bytes); if (!current(captured)) return; packet = handle; const inspected = desk.inspectPacket(handle);
    packetWriting = Object.freeze(Object.fromEntries(WRITING_KEYS.map(key => [key, inspected.declaredHistorical.mapping.raw[key]]))) as EstimateWriting; packetFacts.textContent = JSON.stringify(inspected, null, 2);
    message('Historical packet inspected. Current estimate is Unknown — not requalified. Reusing its model and writing is a separate deliberate choice.');
  });
  pick(writingInput, ESTIMATE_LIMITS.recovery, () => { importedWriting = null; replaceWriting.checked = false; writingFacts.textContent = 'No unfinished writing inspected.'; }, async (bytes, captured) => {
    const chosen = parseEstimateWriting(bytes); if (!current(captured)) return; importedWriting = chosen; writingFacts.textContent = JSON.stringify(chosen, null, 2);
    message('Unfinished writing inspected. Current writing is unchanged until explicit replacement; this file grants no source or estimate authority.');
  });
  listen(reproduce, 'click', () => { if (!modelReady || pending) return; invalidate(); matched = false; void work(async captured => {
    const observation = await desk.reproduce(); if (!current(captured)) return; matched = observation.kind === 'matched';
    modelFacts.textContent += '\n\nActual reproduction here:\n' + JSON.stringify(observation, null, 2);
    message(matched ? 'Complete chosen run matched here. Applicability and evidence remain authored claims.' : 'This chosen run did not match or was refused. The estimate stays Unknown.', !matched, !matched);
  }); });
  const putWriting = (value: EstimateWriting) => {
    if (WRITING_KEYS.some(key => value[key].includes('\r')) || ['mappedAmount', 'donorCreditPercent'].some(key => value[key as keyof EstimateWriting].includes('\n')) ||
      !['', 'nominal-USD-gift-year'].includes(value.giftMoneyBasis)) throw new GiftEstimateError('writing-representation');
    for (const key of WRITING_KEYS) writingControls[key].value = value[key]; limits.checked = false;
  };
  listen(usePacket, 'click', () => { if (!packet || !packetWriting || !replacePacket.checked || pending) return; const chosen = packet, writing = packetWriting;
    invalidate(); modelInput.value = sourceInput.value = ''; choices.delete(modelInput); choices.delete(sourceInput); modelReady = matched = sourceReady = false; sourceFacts.textContent = 'No fresh source checksum.';
    void work(async captured => { const inspection = await desk.reusePacketModel(chosen); if (!current(captured) || packet !== chosen) return;
      putWriting(writing); modelReady = true; modelFacts.textContent = JSON.stringify(inspection, null, 2); replacePacket.checked = false;
      message('Packet model and literal writing copied by your choice. Acknowledge limits, choose the original gift/source files and reproduce; historical figures remain Unknown.'); });
  });
  listen(applyWriting, 'click', () => { if (!importedWriting || !replaceWriting.checked || pending) return; invalidate(); try { putWriting(importedWriting); replaceWriting.checked = false;
      message('Literal writing replaced by your choice. No source file or estimate authority was restored.'); } catch (error) { message(problem(error), true, true); } sync(); });
  const reviewCase = async (historical: boolean) => {
    if (pending) return; if (!form.reportValidity()) return; invalidate();
    await work(async captured => {
      if (historical && (!packet || !packetWriting || !sameEstimateWriting(rawWriting(), packetWriting))) throw new Error('writing-changed');
      const candidate = historical ? await desk.requalify(packet!) : await desk.review(raw()); if (!current(captured)) return;
      const inspected = desk.inspectReview(candidate), estimate = inspected.declaredResult; review = candidate;
      result.textContent = `${historical ? 'Saved case freshly requalified. ' : 'New conditional case. '}${estimate.classification === 'hypothetical' ? 'Hypothetical sample.' : 'User-authored conditional hypothesis.'}\n`
        + `p5 ${showNumber(estimate.summary.p5)} · median ${showNumber(estimate.summary.median)} · p95 ${showNumber(estimate.summary.p95)} ${estimate.unit.name}\n`
        + `Definition: ${estimate.unit.definition}\nHorizon: ${estimate.timeHorizon}\nDonor credit: ${inspected.mapping.raw.donorCreditPercent}% (fixed authored assumption). Unmapped USD ${(estimate.unmappedCents / 100).toFixed(2)} remains unestimated.\n`
        + 'This simulation range is not a confidence interval or a probability of actual success. No lifetime or combined outcome total is calculated.';
      outgoing.textContent = JSON.stringify(inspected, null, 2); message('Case reviewed locally. Inspect all fields, then acknowledge the case to prepare exact JSON for final review.', false, true);
    });
  };
  listen(form, 'submit', event => { event.preventDefault(); void reviewCase(false); });
  listen(requalify, 'click', () => { void reviewCase(true); });
  listen(prepare, 'click', () => { if (!review || pending) return; const chosen = review; void work(async captured => {
    const bytes = await desk.exportReviewed(chosen, platform.now(), true); if (!current(captured) || review !== chosen) return;
    const sha256 = await sha256Bytes(bytes); if (!current(captured) || review !== chosen) return; prepared = new Uint8Array(bytes); ack.checked = false;
    outgoing.textContent = new TextDecoder().decode(bytes); message(`Exact JSON prepared: ${bytes.length} bytes, SHA-256 ${sha256}. Review the complete outgoing text and confirm before download.`, false, true);
  }); });
  listen(ack, 'change', () => sync()); listen(replacePacket, 'change', () => sync()); listen(replaceWriting, 'change', () => sync());
  listen(download, 'click', () => { if (!prepared || !review || !ack.checked || pending) return; const bytes = new Uint8Array(prepared), chosen = review;
    void work(async captured => { desk.inspectReview(chosen); if (!current(captured)) return; await platform.download(bytes, 'charitology-gift-model-estimate.json');
      if (current(captured)) message('Download requested for those exact reviewed bytes. Check the actual saved file; a request alone does not prove native Save.'); }, true);
  });
  listen(saveWriting, 'click', () => { void work(async captured => { const bytes = makeEstimateWriting(rawWriting(), platform.now()); if (!current(captured)) return;
    await platform.download(bytes, 'charitology-gift-estimate-writing.json'); if (current(captured)) message('Unfinished-writing download requested. It contains literal fields only; no selected source or current qualification.'); }, true); });
  for (const field of Object.values(writingControls)) { listen(field, 'input', changed); listen(field, 'change', changed); }
  listen(limits, 'change', changed);
  const revokeUrls = () => { for (const [href, timer] of urls) { clearTimeout(timer); URL.revokeObjectURL(href); } urls.clear(); };
  const clearPrivate = () => {
    if (disposed) return; serial++; abortReads(); desk.suspend(); gifts = null; modelReady = matched = sourceReady = false; review = null; prepared = null;
    packet = null; packetWriting = importedWriting = null; choices.clear(); giftSelect.replaceChildren();
    for (const field of Object.values(writingControls)) field.value = ''; for (const input of [giftInput, modelInput, sourceInput, packetInput, writingInput]) input.value = '';
    limits.checked = ack.checked = replacePacket.checked = replaceWriting.checked = false;
    for (const view of [giftFacts, modelFacts, sourceFacts, packetFacts, writingFacts, outgoing]) view.textContent = '';
    result.textContent = 'Unknown — choose original sources and reproduce again.'; revokeUrls(); sync();
  };
  const onHide: EventListener = () => { clearPrivate(); message('Private choices were cleared for page departure. Reopen from deliberate file choices; unfinished work needs its own downloaded copy.'); };
  const onShow: EventListener = event => { if ((event as PageTransitionEvent).persisted) { clearPrivate(); message('This page returned from browser history. Current estimate is Unknown; deliberately choose and reproduce sources again.'); } };
  platform.events.addEventListener('pagehide', onHide); platform.events.addEventListener('pageshow', onShow);
  controls.disabled = false; sync(); message(`Ready for one conditional case. Other gifts stay Unknown. Method ${ESTIMATE_METHOD.id}. Nothing is read from the old gift/model stores.`);
  return () => { if (disposed) return; clearPrivate(); disposed = true; controls.disabled = true; for (const remove of listeners) remove();
    platform.events.removeEventListener('pagehide', onHide); platform.events.removeEventListener('pageshow', onShow); desk.dispose(); revokeUrls(); };
}
