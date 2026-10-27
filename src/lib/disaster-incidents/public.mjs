// Build/server only. No network, build-clock facts, caller-supplied registry or
// fictional fixture bypass. Every public view starts at the same full history.
import { resolve } from "node:path";
import { lstatSync } from "node:fs";
import { admitProductionHistory, historyRegistry, historyInventory, editionPacket, coveragePacket } from "./model.mjs";
import { packetJSON, packetCSV, historyJSON } from "./formats.mjs";
import { canonicalBytes, parseJSON, freezeJSON } from "./canonical.mjs";
import { projectPacket } from "./projection.mjs";
import { DISASTER_ROOT, readWorkingDisasterInventory, assertNoDisasterCaptureJournal } from "./git.mjs";
const ID = /^[a-z][a-z0-9-]{0,63}$/;
export function disasterId(id) {
    if (typeof id !== "string" || !ID.test(id))
        throw new Error("Invalid disaster identity.");
    return id;
}
export const disasterEditionHref = id => `/disasters/editions/${disasterId(id)}/`;
export const disasterIncidentHref = id => `/disasters/incidents/${disasterId(id)}/`;
export const disasterSelectedHref = (edition, incident) => `${disasterEditionHref(edition)}incidents/${disasterId(incident)}/`;
export function disasterSourceHref(id, version) {
    if (!Number.isSafeInteger(version) || version < 1 || version > 100)
        throw new Error("Invalid disaster source version.");
    return `/disasters/sources/${disasterId(id)}/${version}/`;
}
let cached;
function publicSnapshot(data) {
    const editions = Object.freeze(data.editions.map(e => Object.freeze({
        pin: e.pin, projection: e.projection, coverage: e.coverage,
        artifacts: Object.freeze(Object.fromEntries(Object.entries(e.artifacts).map(([name, bytes]) => [name, new Uint8Array(bytes)]))),
    })));
    return Object.freeze({ registry: data.registry, editions,
        selected: editions.find(e => e.pin.id === data.registry.selected.id && e.pin.hash === data.registry.selected.hash),
        sources: data.sources, history: new Uint8Array(data.history), selectedIncident: data.selectedIncident });
}
export function loadDisasters() {
    const repo = resolve(".");
    assertNoDisasterCaptureJournal(repo);
    if (cached !== undefined)
        return cached === null ? null : publicSnapshot(cached);
    const inventory = readWorkingDisasterInventory(repo);
    if (inventory.size === 0) {
        try {
            lstatSync(resolve(repo, DISASTER_ROOT));
        }
        catch (error) {
            if (error.code === "ENOENT")
                return (cached = null);
            throw error;
        }
        throw new Error("An existing Disaster Desk root must contain its complete admitted history.");
    }
    // Full all-parent Git/source authority is a separate required CI/maintainer
    // gate. This offline loader admits every retained byte but performs no Git
    // command and does not confer provenance by calling a renderer.
    const handle = admitProductionHistory(inventory), registry = historyRegistry(handle);
    const editions = registry.editions.map(({ edition }) => {
        const packet = editionPacket(handle, edition);
        // Serialize the original Packet capability before detached render data.
        const json = packetJSON(packet), csv = packetCSV(packet);
        const coverage = coveragePacket(handle, edition);
        return { pin: freezeJSON(edition), projection: freezeJSON(projectPacket(packet)), coverage: freezeJSON(coverage),
            artifacts: { "edition.json": json, "edition.csv": csv, "coverage.json": canonicalBytes(coverage) } };
    });
    const sources = [];
    for (const [file, bytes] of historyInventory(handle)) {
        if (!/^records\/source\/[a-z][a-z0-9-]{0,63}\/v[1-9]\d*\.json$/.test(file))
            continue;
        const source = parseJSON(bytes), note = parseJSON(inventory.get(source.publicNote.path));
        sources.push({ source, note });
    }
    sources.sort((a, b) => a.source.id < b.source.id ? -1 : a.source.id > b.source.id ? 1 : a.source.version - b.source.version);
    const selected = editions.find(e => e.pin.id === registry.selected.id && e.pin.hash === registry.selected.hash);
    if (!selected)
        throw new Error("Selected Disaster Desk edition is missing.");
    cached = { registry: freezeJSON(registry), editions, selected, sources: freezeJSON(sources), history: historyJSON(handle),
        selectedIncident(editionId, incidentId) {
            disasterId(editionId);
            disasterId(incidentId);
            const e = editions.find(e => e.pin.id === editionId);
            if (!e || !e.projection.packet.incidents.some(i => i.id === incidentId))
                throw new Error("Unknown exact incident selection.");
            const packet = editionPacket(handle, e.pin, incidentId);
            const json = packetJSON(packet), csv = packetCSV(packet);
            return Object.freeze({ projection: freezeJSON(projectPacket(packet)), artifacts: Object.freeze({ "edition.json": json, "edition.csv": csv }) });
        } };
    return publicSnapshot(cached);
}
export function requireDisasters() {
    const data = loadDisasters();
    if (!data)
        throw new Error("Disaster Desk has no committed capture yet.");
    return data;
}
export function disasterArtifactResponse(bytes, filename) {
    if (!(bytes instanceof Uint8Array) || !/^[a-z][a-z0-9-]*\.(?:json|csv)$/.test(filename))
        throw new Error("Invalid disaster artifact.");
    return new Response(new Uint8Array(bytes), { headers: {
            "Content-Type": filename.endsWith(".csv") ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`, "X-Content-Type-Options": "nosniff"
        } });
}
