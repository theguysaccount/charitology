/** Browser storage contains UTF-16 strings. Blob(string) replaces lone surrogates;
 * wrap those corrupt strings as escaped JSON so recovery preserves every code unit. */
export function rawStorageRecoveryDownload(raw: string): {
  text: string;
  wrapped: boolean;
} {
  let wellFormed = true;
  for (let i = 0; i < raw.length; i++) {
    const unit = raw.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = raw.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        wellFormed = false;
        break;
      }
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      wellFormed = false;
      break;
    }
  }
  if (wellFormed) return { text: raw, wrapped: false };
  return {
    text:
      JSON.stringify(
        { format: "charitology-raw-storage-text-recovery", version: 1, raw },
        null,
        2,
      ) + "\n",
    wrapped: true,
  };
}
