/** Refuse to overwrite a draft changed by another tab since this one read it. */
export function guardedDraft(key: string) {
  let observed: string | null | undefined;
  return {
    read(): string | null {
      observed = localStorage.getItem(key);
      return observed;
    },
    write(next: string): void {
      if (observed === undefined)
        throw new Error(
          "This draft could not be read. Existing browser data is left untouched.",
        );
      if (localStorage.getItem(key) !== observed)
        throw new Error(
          "Another tab changed this draft. Download your work, then reload to read the saved version.",
        );
      localStorage.setItem(key, next);
      observed = next;
    },
  };
}
