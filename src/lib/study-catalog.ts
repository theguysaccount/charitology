// Public bibliography adapter only. No browser workspace or screening data enters the build.
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { allCitations, type Citation } from "./sources";
import type { CatalogEntry } from "./client/study-register-import";

export function buildStudyCatalog(citations: Citation[]) {
  const entries: CatalogEntry[] = [];
  const omitted: { title: string; reason: string }[] = [];
  for (const citation of citations) {
    let reason = "";
    const originalYear =
      citation.year === undefined ? null : String(citation.year);
    try {
      const source = new URL(citation.url);
      if (
        source.protocol !== "https:" ||
        source.username ||
        source.password ||
        /[\r\n]/.test(citation.url)
      )
        reason =
          "The register accepts only HTTPS source links without credentials.";
    } catch {
      reason = "The source link cannot be represented by this register.";
    }
    if (
      !citation.title.trim() ||
      citation.title.length > 500 ||
      citation.url.length > 1200
    )
      reason = "The source exceeds the register's bounded citation fields.";
    if (
      (originalYear?.length ?? 0) > 2000 ||
      (citation.publisher?.length ?? 0) > 2000
    )
      reason = "The source exceeds the register's bounded provenance fields.";
    if (
      citation.citedBy.length > 100 ||
      citation.citedBy.some(
        (by) =>
          !by.title.trim() ||
          by.title.length > 500 ||
          by.href.length > 1200 ||
          !/^\/(?!\/)[A-Za-z0-9_./#%?=&-]*$/.test(by.href) ||
          /[\\\r\n]/.test(by.href) ||
          by.href.includes(".."),
      )
    )
      reason =
        "The source's citing-page links cannot be represented by this register.";
    if (reason) {
      omitted.push({ title: citation.title, reason });
      continue;
    }
    const parsedYear =
      originalYear && /^\d{1,4}$/.test(originalYear)
        ? Number(originalYear)
        : null;
    const year =
      parsedYear !== null && parsedYear >= 1 && parsedYear <= 2200
        ? parsedYear
        : null;
    entries.push({
      entryId:
        "cite-" +
        bytesToHex(sha256(new TextEncoder().encode(citation.url))).slice(0, 32),
      title: citation.title,
      authors: null,
      year,
      originalYear,
      doi: null,
      pmid: null,
      url: citation.url,
      abstract: null,
      publisher: citation.publisher || null,
      backlinks: citation.citedBy.map((by) => ({
        title: by.title,
        href: by.href,
      })),
    });
  }
  return { entries, omitted, total: citations.length };
}

export async function studyCatalog() {
  return buildStudyCatalog(await allCitations());
}
