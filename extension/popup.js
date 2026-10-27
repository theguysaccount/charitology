// Popup: the full Giver's Checklist and a lookup pre-filled from the current
// tab's title. activeTab means the extension sees the tab only when you click it.
const SITE_SETTING = "__CHARITOLOGY_SITE__";
const SITE = SITE_SETTING.startsWith("__")
  ? "https://charitology.org"
  : SITE_SETTING;
const api = globalThis.browser ?? globalThis.chrome;

const list = document.getElementById("checklist");
const count = document.getElementById("count");
const input = document.getElementById("q");
let queryEdited = false;
input.addEventListener("input", () => {
  queryEdited = true;
  document.getElementById("lookup-manual").hidden = true;
});
document.getElementById("method").href = `${SITE}/method/#checklist`;

function renderChecklist(items) {
  for (const item of items) {
    const li = document.createElement("li");
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.addEventListener("change", updateCount);
    const q = document.createElement("span");
    q.className = "q";
    q.textContent = item.question;
    const detail = document.createElement("span");
    detail.className = "detail";
    detail.textContent = item.detail;
    label.append(box, q);
    li.append(label, detail);
    list.append(li);
  }
  updateCount();
}

function updateCount() {
  const boxes = list.querySelectorAll('input[type="checkbox"]');
  const done = [...boxes].filter((b) => b.checked).length;
  count.textContent = `${done} of ${boxes.length} answered`;
}

fetch("checklist.json")
  .then((r) => r.json())
  .then(renderChecklist)
  .catch(() => {
    count.textContent = "Checklist unavailable";
  });

(async () => {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    const title = (tab?.title ?? "")
      .replace(/\s*[|·–—-]\s*(GoFundMe|JustGiving|Every\.org).*$/i, "")
      .replace(/^(Donate to|Fundraiser for|Fundraiser by [^:]+:)\s*/i, "")
      .trim();
    // Keep complete Unicode code points within the local lookup's 120-unit cap.
    let bounded = "";
    for (const point of title) {
      if (bounded.length + point.length > 120) break;
      const code = point.codePointAt(0);
      bounded += code >= 0xd800 && code <= 0xdfff ? "\uFFFD" : point;
    }
    if (!queryEdited) input.value = bounded;
  } catch {
    /* no tab access: leave the field empty */
  }
  if (!queryEdited) {
    input.focus();
    input.select();
  }
})();

let opening = false;
document.getElementById("lookup").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (opening) return;
  const status = document.getElementById("lookup-status");
  const manual = document.getElementById("lookup-manual");
  manual.hidden = true;
  const submittedText = input.value;
  const q = submittedText.trim();
  if (q.length > 120) {
    status.textContent =
      "Use at most 120 characters. Your text has not been sent.";
    return;
  }
  let url;
  try {
    // Fragments are consumed locally; the HTTP query remains empty.
    url = `${SITE}/tools/charity-lookup/${q ? `#q=${encodeURIComponent(q)}` : ""}`;
  } catch {
    status.textContent =
      "This text contains an invalid character. Edit it and try again.";
    return;
  }
  manual.href = url;
  opening = true;
  status.textContent = "Opening the lookup…";
  try {
    if (!api?.tabs?.create) throw new Error("Tab access unavailable");
    await api.tabs.create({ url });
    window.close();
  } catch {
    if (input.value === submittedText) {
      status.textContent =
        "Could not open a new tab. Your text is still here; try the direct link.";
      manual.hidden = false;
    } else {
      status.textContent =
        "Opening failed after the text changed. Submit the current text again.";
    }
  } finally {
    opening = false;
  }
});
