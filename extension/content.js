// Charitology: Before You Give
// Shows a small, dismissible card with three questions on supported donation
// pages. It reads only the page title, and only to pre-fill a lookup when the
// visitor clicks. Nothing is sent anywhere.
(() => {
  const SITE_SETTING = "__CHARITOLOGY_SITE__";
  const SITE = SITE_SETTING.startsWith("__")
    ? "https://charitology.org"
    : SITE_SETTING;
  const api = globalThis.browser ?? globalThis.chrome;
  const KEY = `hidden:${location.hostname}`;
  if (document.getElementById("charitology-before-you-give")) return;

  const QUESTIONS = [
    "Symptom or source? Where on the chain does this gift act?",
    "What happens if I don’t give? Would it be funded anyway?",
    "How would anyone find out if it stopped working?",
  ];

  const cleanTitle = () =>
    document.title
      .replace(/\s*[|·–—-]\s*(GoFundMe|JustGiving|Every\.org).*$/i, "")
      .replace(/^(Donate to|Fundraiser for|Fundraiser by [^:]+:)\s*/i, "")
      .trim();

  function boundedTitle() {
    let bounded = "";
    for (const point of cleanTitle()) {
      if (bounded.length + point.length > 120) break;
      const code = point.codePointAt(0);
      bounded += code >= 0xd800 && code <= 0xdfff ? "\uFFFD" : point;
    }
    return bounded;
  }

  async function hidden() {
    try {
      const v = await api.storage.local.get(KEY);
      return Boolean(v && v[KEY]);
    } catch {
      return false;
    }
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    node.append(...children);
    return node;
  }

  async function show() {
    if (await hidden()) return;
    // Storage reads yield: another initialization may already have mounted it.
    if (document.getElementById("charitology-before-you-give")) return;
    const host = el("div", { id: "charitology-before-you-give" });
    const root = host.attachShadow({ mode: "closed" });
    const style = el("style", {
      text: `
        :host { all: initial; }
        .card { position: fixed; right: 16px; bottom: 16px; z-index: 2147483646; width: min(340px, calc(100vw - 32px));
          background: #fdfcf9; color: #1a1915; border: 1px solid #d9d2c4; border-radius: 14px;
          box-shadow: 0 12px 32px -12px rgba(0,0,0,.35); font: 14px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; }
        .head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px 4px; }
        .brand { font: 600 15px Georgia, serif; display: flex; gap: 8px; align-items: center; }
        .dot { width: 10px; height: 10px; border-radius: 50%; background: #8b1e2d; box-shadow: 0 0 0 3px #f4e6e3; }
        button.x { all: unset; cursor: pointer; width: 28px; height: 28px; display: grid; place-items: center; border-radius: 8px; color: #6b665c; font-size: 18px; }
        button.x:hover, button.x:focus-visible { background: #eeeae0; outline: none; }
        ol { margin: 4px 0 0; padding: 0 16px 0 34px; }
        li { margin: 6px 0; }
        .actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 14px 14px; }
        a.btn { text-decoration: none; padding: 8px 12px; border-radius: 999px; font-weight: 600; font-size: 13px; }
        a.primary { background: #1a1915; color: #fdfcf9; }
        a.ghost { color: #1a1915; border: 1px solid #d9d2c4; }
        a.btn:focus-visible { outline: 2px solid #2a78d6; outline-offset: 2px; }
        .never { all: unset; cursor: pointer; display: block; margin: -6px 14px 12px; color: #6b665c; font-size: 12px; text-decoration: underline; }
        .never:focus-visible { outline: 2px solid #2a78d6; outline-offset: 3px; }
        @media (prefers-color-scheme: dark) {
          .card { background: #1a1916; color: #efebe3; border-color: #38352e; }
          a.primary { background: #efebe3; color: #1a1916; }
          a.ghost { color: #efebe3; border-color: #38352e; }
          button.x, .never { color: #9d978a; }
          button.x:hover { background: #2a2823; }
        }`,
    });
    const close = () => host.remove();
    const lookup = `${SITE}/tools/charity-lookup/`;
    const lookupButton = el("a", {
      class: "btn primary",
      href: lookup,
      target: "_blank",
      rel: "noopener noreferrer",
      text: "Look it up",
    });
    // Read the title only when the visitor chooses a lookup. The fragment is
    // consumed locally by the lookup page and is absent from its HTTP request.
    lookupButton.addEventListener("click", () => {
      lookupButton.href = `${lookup}#q=${encodeURIComponent(boundedTitle())}`;
    });
    const preferenceStatus = el("p", {
      role: "status",
      style: "margin: 0 14px 12px; font-size: 12px;",
    });
    let hiding = false;
    const card = el(
      "aside",
      {
        class: "card",
        role: "complementary",
        "aria-label": "Charitology: before you give",
      },
      el(
        "div",
        { class: "head" },
        el(
          "span",
          { class: "brand" },
          el("span", { class: "dot" }),
          "Before you give",
        ),
        el("button", {
          class: "x",
          type: "button",
          "aria-label": "Close",
          onclick: close,
          text: "×",
        }),
      ),
      el("ol", {}, ...QUESTIONS.map((q) => el("li", { text: q }))),
      el(
        "div",
        { class: "actions" },
        lookupButton,
        el("a", {
          class: "btn ghost",
          href: `${SITE}/method/#checklist`,
          target: "_blank",
          rel: "noopener",
          text: "All 10 questions",
        }),
      ),
      el("button", {
        class: "never",
        type: "button",
        text: `Don’t show on ${location.hostname}`,
        onclick: async () => {
          if (hiding) return;
          hiding = true;
          try {
            await api.storage.local.set({ [KEY]: true });
            close();
          } catch {
            preferenceStatus.textContent =
              "Could not save this preference. Use Close to hide this card for this page.";
          } finally {
            hiding = false;
          }
        },
      }),
      preferenceStatus,
    );
    root.append(style, card);
    document.documentElement.append(host);
  }

  show();
})();
