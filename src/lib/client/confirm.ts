// A second click within a few seconds confirms an action that would lose work.
// Gentler than a blocking confirm() dialog, and it works the same with a keyboard.
// The window is generous so screen reader and switch users have time to answer.

export interface ConfirmOptions {
  /** Button text while waiting for the second click, such as "Click again to delete". */
  prompt: string;
  /** Whether this click needs confirming at all. Defaults to always. */
  needed?: () => boolean;
  action: () => void;
  /** Where to say what is happening, such as a role="status" element. */
  announce?: (text: string) => void;
  /** What to announce while waiting. Defaults to the prompt. */
  message?: string;
  ms?: number;
}

export function confirmTwice(button: HTMLButtonElement, opts: ConfirmOptions): () => void {
  const label = button.textContent ?? '';
  let timer: number | undefined;
  const reset = () => {
    window.clearTimeout(timer);
    timer = undefined;
    button.textContent = label;
  };
  button.addEventListener('click', () => {
    if (timer === undefined && (opts.needed?.() ?? true)) {
      button.textContent = opts.prompt;
      opts.announce?.(opts.message ?? opts.prompt);
      timer = window.setTimeout(reset, opts.ms ?? 8000);
      return;
    }
    reset();
    opts.action();
  });
  return reset;
}
