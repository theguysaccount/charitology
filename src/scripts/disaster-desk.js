// Optional presentation only: no storage, source requests or planner writes.
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const HAZARDS = ['all', 'wildfire', 'earthquake', 'flood', 'storm', 'drought', 'other', 'unclassified'];
const SECTORS = ['all', 'shelter', 'water-sanitation', 'food', 'health', 'livelihoods', 'protection', 'infrastructure', 'other', 'unclassified'];
const FIELDS = ['hazard', 'sector', 'placement', 'review', 'q'];
export const DISASTER_FILTER_DEFAULTS = Object.freeze({ hazard: 'all', sector: 'all', placement: 'all', review: 'all', q: '' });
export const DEVICE_QUALIFIER = 'Device-clock display only; not a verified current-time or source check.';
function ordinary(value, keys) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
        throw Error('Use a plain display value.');
    const actual = Reflect.ownKeys(value);
    if (actual.length !== keys.length || actual.some(k => typeof k !== 'string' || !keys.includes(k)))
        throw Error('Unknown or missing display field.');
    for (const key of keys)
        if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) || {}, 'value'))
            throw Error('Display accessors are unsupported.');
}
function literal(value, max) {
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value))
        throw Error('Invalid display text.');
    for (let i = 0; i < value.length; i++) {
        const c = value.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff) {
            const next = value.charCodeAt(++i);
            if (!(next >= 0xdc00 && next <= 0xdfff))
                throw Error('Malformed display text.');
        }
        else if (c >= 0xdc00 && c <= 0xdfff)
            throw Error('Malformed display text.');
    }
    return value;
}
function filters(value) {
    ordinary(value, FIELDS);
    if (!HAZARDS.includes(value.hazard) || !SECTORS.includes(value.sector) || !['all', 'follow-up', 'archive'].includes(value.placement) || !['all', 'not-due-at-capture', 'review-overdue-at-capture'].includes(value.review))
        throw Error('Unknown filter choice.');
    literal(value.q, 120);
    return { ...value };
}
export function disasterDeskFragment(editionId, input) {
    if (typeof editionId !== 'string' || !ID.test(editionId))
        throw Error('Invalid exact edition.');
    const f = filters(input), query = FIELDS.map(key => `${key}=${encodeURIComponent(f[key]).replace(/%20/g, '+')}`).join('&');
    const fragment = `#disaster-desk/edition/${editionId}?${query}`;
    if (fragment.length > 2048)
        throw Error('This filter link is too long.');
    return fragment;
}
export function parseDisasterDeskFragment(fragment, expectedEdition) {
    if (typeof fragment !== 'string' || !fragment.startsWith('#disaster-desk'))
        return null;
    try {
        if (fragment.length > 2048)
            throw Error('This filter link is too long.');
        const match = /^#disaster-desk\/edition\/([a-z][a-z0-9-]{0,63})\?(.+)$/.exec(fragment);
        if (!match)
            throw Error('Use a complete exact-edition filter link.');
        const parts = match[2].split('&');
        if (parts.length !== FIELDS.length)
            throw Error('Unknown, duplicate or missing filter field.');
        const parsed = {};
        parts.forEach((part, i) => { const at = part.indexOf('='); if (at < 0 || part.slice(0, at) !== FIELDS[i])
            throw Error('Use the exact closed filter fields.'); parsed[FIELDS[i]] = decodeURIComponent(part.slice(at + 1).replace(/\+/g, ' ')); });
        const checked = filters(parsed);
        if (disasterDeskFragment(match[1], checked) !== fragment)
            throw Error('Use canonical filter encoding.');
        return { kind: match[1] === expectedEdition ? 'ready' : 'different-edition', editionId: match[1], filters: checked };
    }
    catch (error) {
        return { kind: 'invalid', message: error.message };
    }
}
function canonicalUtc(value) {
    if (typeof value !== 'string' || !/^(?:[1-9][0-9]{3})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
        return false;
    try {
        return new Date(value).toISOString() === value;
    }
    catch {
        return false;
    }
}
export function disasterDeviceWarning(incidents, asOf, deviceInstant) {
    if (!Array.isArray(incidents) || incidents.length > 20 || !canonicalUtc(asOf))
        throw Error('Invalid fixed capture display.');
    const keys = Reflect.ownKeys(incidents);
    if (keys.length !== incidents.length + 1 || !keys.includes('length') || incidents.some((_, i) => !Object.hasOwn(incidents, i)))
        throw Error('Invalid review deadline array.');
    const seen = new Set();
    for (const value of incidents) {
        ordinary(value, ['id', 'checkedAt', 'recheckAfter']);
        if (typeof value.id !== 'string' || !ID.test(value.id) || seen.has(value.id) || !canonicalUtc(value.checkedAt) || !canonicalUtc(value.recheckAfter) || value.checkedAt > asOf || value.recheckAfter <= value.checkedAt)
            throw Error('Invalid review deadline display.');
        seen.add(value.id);
    }
    return canonicalUtc(deviceInstant) && deviceInstant >= asOf ? { kind: 'device-after-capture', displayedDeviceInstant: deviceInstant, overdueIncidentIds: incidents.filter(i => i.recheckAfter <= deviceInstant).map(i => i.id), qualifier: DEVICE_QUALIFIER } : { kind: 'unassessable', displayedDeviceInstant: null, overdueIncidentIds: [], qualifier: DEVICE_QUALIFIER };
}
export function disasterCardMatches(card, input) {
    const f = filters(input);
    return (f.hazard === 'all' || card.hazard === f.hazard) && (f.sector === 'all' || String(card.sectors).split(' ').includes(f.sector)) && (f.placement === 'all' || card.placement === f.placement) && (f.review === 'all' || card.review === f.review) && (!f.q || String(card.search).includes(f.q.toLowerCase()));
}
export function mountDisasterDesk(root, options = {}) {
    const win = options.window || globalThis.window, nav = options.navigator || globalThis.navigator, readClock = options.readClock || (() => new Date().toISOString());
    const edition = root.dataset.edition;
    if (!ID.test(edition))
        throw Error('Invalid rendered edition.');
    const form = root.querySelector('[data-dd-filters]'), controls = [...root.querySelectorAll('[data-dd-filter]')], cards = [...root.querySelectorAll('[data-dd-incident]')], status = root.querySelector('[data-dd-filter-status]'), fragmentStatus = root.querySelector('[data-dd-fragment-status]'), exactLink = root.querySelector('[data-dd-exact-edition]'), share = root.querySelector('[data-dd-share]');
    const editionUrl = new URL(root.dataset.editionUrl, win.location.href);
    if (editionUrl.origin !== win.location.origin || !editionUrl.pathname.endsWith(`/disasters/editions/${edition}/`))
        throw Error('Invalid rendered edition route.');
    const listeners = [];
    let active = { ...DISASTER_FILTER_DEFAULTS }, disposed = false;
    const on = (target, event, fn) => { target?.addEventListener(event, fn); listeners.push(() => target?.removeEventListener(event, fn)); };
    const shareUrl = () => editionUrl.href + disasterDeskFragment(edition, active);
    const apply = (value, writeHash = false) => { const checked = filters(value); const visibility = cards.map(card => disasterCardMatches(card.dataset, checked)); active = checked; cards.forEach((card, i) => { card.hidden = !visibility[i]; }); for (const control of controls)
        control.value = active[control.dataset.ddFilter]; if (share)
        share.href = shareUrl(); if (status)
        status.textContent = `${visibility.filter(Boolean).length} of ${cards.length} incidents shown in exact edition ${edition}.`; if (fragmentStatus)
        fragmentStatus.textContent = ''; if (exactLink)
        exactLink.hidden = true; if (writeHash) {
        const current = new URL(win.location.href);
        current.hash = disasterDeskFragment(edition, active);
        win.history.replaceState(win.history.state, '', current.href);
    } };
    const readFragment = () => { if (disposed || !form)
        return; const parsed = parseDisasterDeskFragment(win.location.hash, edition); if (!parsed)
        return; if (parsed.kind === 'ready')
        apply(parsed.filters);
    else if (parsed.kind === 'different-edition') {
        fragmentStatus.textContent = `This link names edition ${parsed.editionId}, while this page shows ${edition}. No filters from that link were applied.`;
        const target = new URL(editionUrl);
        target.pathname = target.pathname.replace(new RegExp(`${edition}/$`), `${parsed.editionId}/`);
        target.hash = disasterDeskFragment(parsed.editionId, parsed.filters);
        exactLink.href = target.href;
        exactLink.hidden = false;
    }
    else {
        fragmentStatus.textContent = `Filter link refused: ${parsed.message} No filters from that link were applied.`;
        exactLink.hidden = true;
    } };
    if (form) {
        on(form, 'submit', event => event.preventDefault());
        const update = () => { try {
            const value = Object.fromEntries(controls.map(control => [control.dataset.ddFilter, control.value]));
            apply(value, true);
        }
        catch {
            status.textContent = 'These filter values were refused. The previous complete filter remains applied.';
        } };
        for (const control of controls) {
            on(control, 'input', update);
            on(control, 'change', update);
        }
        on(root.querySelector('[data-dd-reset]'), 'click', () => apply({ ...DISASTER_FILTER_DEFAULTS }, true));
        on(win, 'hashchange', readFragment);
        apply(active);
        readFragment();
        for (const control of controls)
            control.disabled = false;
        for (const button of form.querySelectorAll('button'))
            button.disabled = false;
        form.hidden = false;
        on(root.querySelector('[data-dd-copy-share]'), 'click', async () => { try {
            if (!nav?.clipboard?.writeText)
                throw Error();
            await nav.clipboard.writeText(shareUrl());
            if (!disposed)
                status.textContent = 'Exact edition and filter link copied.';
        }
        catch {
            if (!disposed)
                status.textContent = 'Clipboard access is unavailable. Copy the exact edition link above.';
        } });
    }
    for (const button of root.querySelectorAll('[data-dd-copy-label]'))
        on(button, 'click', async () => { const output = button.closest('[data-dd-incident]')?.querySelector('[data-dd-copy-status]'); try {
            const label = literal(button.dataset.label, 120);
            if (!nav?.clipboard?.writeText)
                throw Error();
            await nav.clipboard.writeText(label);
            if (!disposed && output)
                output.textContent = 'Incident label copied. Paste it yourself only if you want to edit the planner.';
        }
        catch {
            if (!disposed && output)
                output.textContent = 'Clipboard access is unavailable or the label is invalid. Copy the visible label manually.';
        } });
    const device = root.querySelector('[data-dd-device]');
    if (device) {
        const incidents = JSON.parse(root.dataset.deviceIncidents);
        disasterDeviceWarning(incidents, root.dataset.asOf, null);
        const output = root.querySelector('[data-dd-device-status]');
        on(root.querySelector('[data-dd-check-clock]'), 'click', () => { let warning; try {
            warning = disasterDeviceWarning(incidents, root.dataset.asOf, readClock());
        }
        catch {
            warning = { kind: 'unassessable', qualifier: DEVICE_QUALIFIER };
        } output.textContent = warning.kind === 'unassessable' ? `This device clock is invalid or before the capture; review age is unassessable. ${warning.qualifier}` : `Device time ${warning.displayedDeviceInstant}. ${warning.overdueIncidentIds.length} retained incident review deadlines appear overdue on this clock. This does not establish present needs or source validity. ${warning.qualifier}`; });
        device.hidden = false;
    }
    return { dispose() { disposed = true; for (const remove of listeners)
            remove(); }, readFragment };
}
if (typeof document !== 'undefined')
    for (const root of document.querySelectorAll('[data-disaster-desk]'))
        try {
            mountDisasterDesk(root);
        }
        catch {
            const status = root.querySelector('[data-dd-fragment-status]');
            if (status)
                status.textContent = 'Optional controls are unavailable. The complete dated reports and source links remain readable.';
        }
