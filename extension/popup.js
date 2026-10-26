// Popup: the full Giver's Checklist and a lookup pre-filled from the current
// tab's title. activeTab means the extension sees the tab only when you click it.
const SITE_SETTING = '__CHARITOLOGY_SITE__';
const SITE = SITE_SETTING.startsWith('__') ? 'https://charitology.org' : SITE_SETTING;
const api = globalThis.browser ?? globalThis.chrome;

const list = document.getElementById('checklist');
const count = document.getElementById('count');
const input = document.getElementById('q');
document.getElementById('method').href = `${SITE}/method/#checklist`;

function renderChecklist(items) {
  for (const item of items) {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.addEventListener('change', updateCount);
    const q = document.createElement('span');
    q.className = 'q';
    q.textContent = item.question;
    const detail = document.createElement('span');
    detail.className = 'detail';
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

fetch('checklist.json')
  .then((r) => r.json())
  .then(renderChecklist)
  .catch(() => {
    count.textContent = 'Checklist unavailable';
  });

(async () => {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    const title = (tab?.title ?? '')
      .replace(/\s*[|·–—-]\s*(GoFundMe|JustGiving|Every\.org).*$/i, '')
      .replace(/^(Donate to|Fundraiser for)\s*/i, '')
      .trim()
      .slice(0, 120);
    input.value = title;
  } catch {
    /* no tab access: leave the field empty */
  }
  input.focus();
  input.select();
})();

document.getElementById('lookup').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = input.value.trim();
  // URL fragments stay in the browser; the page title is not sent to the host.
  const url = `${SITE}/tools/charity-lookup/${q ? `#q=${encodeURIComponent(q)}` : ''}`;
  api.tabs.create({ url });
  window.close();
});
