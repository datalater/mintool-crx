const list = document.getElementById('feature-list');

async function init() {
  const { features = {} } = await chrome.storage.sync.get('features');

  for (const group of FEATURE_GROUPS) {
    const items = FEATURE_DEFS.filter(f => f.group === group.key);
    if (!items.length) continue;

    const section = document.createElement('section');
    section.className = 'group';

    const label = document.createElement('div');
    label.className = 'group-label';
    label.textContent = group.label;
    section.appendChild(label);

    const card = document.createElement('div');
    card.className = 'card';

    for (const feat of items) {
      const enabled = features[feat.key] !== false;
      card.appendChild(createRow(feat, enabled));
    }

    section.appendChild(card);
    list.appendChild(section);
  }
}

function createRow(feat, enabled) {
  const row = document.createElement('div');
  row.className = 'feature-row';

  row.innerHTML = `
    <div class="feature-info">
      <div class="feature-label">${feat.label}</div>
      <div class="feature-desc">${feat.description}</div>
    </div>
    <label class="toggle">
      <input type="checkbox" data-key="${feat.key}" ${enabled ? 'checked' : ''}>
      <span class="toggle-track"></span>
    </label>
  `;

  row.querySelector('input').addEventListener('change', onToggle);
  return row;
}

async function onToggle(e) {
  const { features = {} } = await chrome.storage.sync.get('features');
  features[e.target.dataset.key] = e.target.checked;
  await chrome.storage.sync.set({ features });
}

document.getElementById('btn-enable-all').addEventListener('click', () => setAll(true));
document.getElementById('btn-disable-all').addEventListener('click', () => setAll(false));

async function setAll(enabled) {
  const features = {};
  for (const feat of FEATURE_DEFS) features[feat.key] = enabled;
  await chrome.storage.sync.set({ features });
  document.querySelectorAll('input[data-key]').forEach(cb => { cb.checked = enabled; });
}

init();
