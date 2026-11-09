import {applyTheme, readTheme, saveTheme, validThemeValue} from '../theme-preferences.js?v=0.10.1';

const views = {
  farben: {
    title: 'Farben',
    sheet: 'color-defaults',
    file: 'theme-colors.css',
    description: 'Jede Farbe gilt für alle Elemente, die sie gemeinsam nutzen.',
    labels: {
      text: 'Dunkle Schrift',
      'muted-text': 'Hinweise und Nebeninfos',
      surface: 'Weiße Flächen und Beschriftungen',
      canvas: 'Hintergründe der App und ruhige Flächen',
      'neutral-soft': 'Zusätzliche Skills und neutrale Flächen',
      border: 'Rahmen für Felder und Karten',
      'brand-orange': 'Hauptbuttons, Match-Score und Top-Skill-Sterne',
      'orange-ink': 'Schrift auf hellorangen Flächen',
      'orange-soft': 'Testhinweise und Bewerbungskacheln',
      'brand-teal': 'Auswahl und Aktionen in Türkis',
      'teal-ink': 'Links und türkisfarbene Schrift',
      'teal-soft': 'Jobkacheln und türkisfarbene Hinweise',
      'match-pass': 'Passende und ausgewählte Skills',
      'match-close': 'Ähnliche Skills',
      'green-ink': 'Schrift für positive Statusmeldungen',
      'match-open': 'Offene Skills',
      'field-error': 'Fehler und abgelehnte Bewerbungen',
      bookmark: 'Aktion „Merken“ und violette Schrift',
      'bookmark-soft': 'Kachel für gemerkte Jobs'
    }
  },
  schriftgroessen: {
    title: 'Schriftgrößen',
    sheet: 'font-defaults',
    file: 'theme-fonts.css',
    description: 'Größen für Überschriften, Texte, Felder und Match-Elemente. Alle Werte sind in Pixeln.',
    labels: {
      body: 'Grundschrift',
      title: 'Seitentitel',
      section: 'Abschnittsüberschriften',
      subheading: 'Kleine Überschriften',
      intro: 'Einleitungstexte',
      hint: 'Formular- und Hinweistexte',
      footer: 'Fußnoten und Hinweise am Seitenende',
      'password-rules': 'Passwortregeln',
      input: 'Eingabefelder und Stadtanzeige',
      'field-label': 'Feldbeschriftungen',
      button: 'Schaltflächen',
      'primary-full': 'Breite Hauptschaltflächen',
      'tile-number': 'Zahlen in Dashboard-Kacheln',
      'tile-label': 'Beschriftung der Dashboard-Kacheln',
      'swipe-title': 'Jobtitel beim Swipen',
      'swipe-title-compact': 'Jobtitel bei schmaler Swipe-Ansicht',
      'match-score': 'Match-Score',
      'match-score-label': 'Beschriftung des Match-Scores',
      'match-skill': 'Skillnamen in der Match-Liste',
      'match-skill-compact': 'Skillnamen bei schmaler Ansicht',
      'matched-profile-skill': 'Zugeordneter Skill aus dem Profil',
      testbar: 'Testleiste am oberen Rand'
    }
  }
};

const byId = id => document.getElementById(id);
const preview = byId('preview');
const form = byId('theme-form');
const settings = byId('settings');
const search = byId('search');
const status = byId('status');
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const defaults = {};
const usage = new Map();

for (const view of Object.values(views)) {
  const variables = byId(view.sheet).sheet.cssRules[0].style;
  view.names = Array.from(variables).filter(name => validThemeValue(name, variables.getPropertyValue(name).trim()));
  for (const name of view.names) defaults[name] = variables.getPropertyValue(name).trim();
}

let active = new URLSearchParams(location.search).get('view') === 'schriftgroessen' ? 'schriftgroessen' : 'farben';
const draft = Object.fromEntries(Object.entries(readTheme()).filter(([name]) => Object.hasOwn(defaults, name)));
let showAdvanced = false;
const valueOf = name => draft[name] ?? defaults[name];
const tokenSuffix = name => name.replace(/^--theme-(?:font|color)-/, '');

function collectUsage(rules) {
  for (const rule of rules) {
    if (rule.cssRules) collectUsage(rule.cssRules);
    if (!rule.selectorText || !rule.style) continue;
    for (const match of rule.style.cssText.matchAll(/var\((--theme-(?:font|color)-[a-z0-9-]+)\)/g)) {
      if (!usage.has(match[1])) usage.set(match[1], new Set());
      usage.get(match[1]).add(rule.selectorText);
    }
  }
}

function syncPreview() {
  const root = preview.contentDocument?.documentElement;
  if (root) applyTheme(root, {...defaults, ...draft});
}

function labelOf(view, name) {
  const suffix = tokenSuffix(name);
  return view.labels[suffix] ?? (active === 'farben' ? 'Farbwert ' + suffix.replace('palette-', '') : 'Weitere Schriftstufe ' + defaults[name]);
}

function settingRow(view, name) {
  const value = valueOf(name);
  const selectors = Object.hasOwn(view.labels, tokenSuffix(name)) ? '' : [...(usage.get(name) ?? [])].slice(0, 2).join(' · ');
  const label = escape(labelOf(view, name));
  const isColor = active === 'farben';
  const input = isColor
    ? `<input type="color" aria-label="Farbauswahl für ${label}" value="${value.slice(0,7)}" data-picker><input class="hex" id="${name}" value="${value}" pattern="#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?" required maxlength="9" spellcheck="false" data-value>`
    : `<input class="size" id="${name}" type="number" value="${Number.parseFloat(value)}" min="6" max="96" step="0.01" required data-value><span>px</span>`;
  return `<div class="value-row" data-name="${name}"><label for="${name}">${label}${selectors?`<small class="usage">${escape(selectors)}</small>`:''}</label><div class="value-input">${input}</div></div>`;
}

function render() {
  const view = views[active];
  const query = search.value.trim().toLocaleLowerCase('de');
  byId('controls-title').textContent = view.title;
  byId('controls-description').textContent = view.description + ' ' + view.names.length + ' Einstellungen.';
  for (const tab of document.querySelectorAll('[data-view]')) {
    if (tab.dataset.view === active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  const available = view.names.filter(name => [labelOf(view,name),name,defaults[name],valueOf(name),...(usage.get(name) ?? [])].some(text => text.toLocaleLowerCase('de').includes(query)));
  const prefix = active === 'farben' ? '--theme-color-' : '--theme-font-';
  const order = Object.keys(view.labels).map(key => prefix+key);
  const primary = order.filter(name => available.includes(name));
  const extra = available.filter(name => !order.includes(name));
  settings.innerHTML = !available.length ? '<p>Keine passende Einstellung gefunden.</p>' : (
    (primary.length ? `<h3>${active === 'farben' ? 'Gemeinsame Farbpalette' : 'Häufige Einstellungen'}</h3>`+primary.map(name => settingRow(view,name)).join('') : '')+
    (extra.length ? `<details class="advanced"${query||showAdvanced?' open':''}><summary>Weitere Werte (${extra.length})</summary>${extra.map(name => settingRow(view,name)).join('')}</details>` : '')
  );
}

document.querySelector('.views').addEventListener('click', event => {
  const tab = event.target.closest('[data-view]');
  if (!tab || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  active = tab.dataset.view;
  history.replaceState(null, '', tab.href);
  search.value = '';
  status.textContent = '';
  showAdvanced = false;
  render();
});
search.addEventListener('input', render);
form.addEventListener('submit', event => event.preventDefault());
settings.addEventListener('toggle', event => {
  if (event.target.matches('.advanced')) showAdvanced = event.target.open;
}, true);
settings.addEventListener('input', event => {
  const control = event.target;
  const row = control.closest('[data-name]');
  if (!row) return;
  const name = row.dataset.name;
  const picker = row.querySelector('[data-picker]');
  const field = row.querySelector('[data-value]');
  const value = picker ? (control === picker ? picker.value + valueOf(name).slice(7) : field.value.toLowerCase()) : field.value+'px';
  if (!validThemeValue(name,value)) return;
  if (picker && control === picker) field.value = value;
  if (picker && control === field) picker.value = value.slice(0,7);
  if (value === defaults[name]) delete draft[name];
  else draft[name] = value;
  preview.contentDocument?.documentElement.style.setProperty(name,value);
  status.textContent = 'Änderung in der Vorschau.';
});
byId('apply').addEventListener('click', () => {
  if (!form.reportValidity()) return;
  try {
    saveTheme(draft);
    status.textContent = 'Für diesen Browser gespeichert. Öffne die Test-App erneut, um die Werte dort zu sehen.';
  } catch {
    status.textContent = 'Dieser Browser konnte die Einstellungen nicht speichern. Du kannst sie herunterladen.';
  }
});
byId('reset').addEventListener('click', () => {
  for (const name of views[active].names) delete draft[name];
  syncPreview();
  render();
  status.textContent = 'Standardwerte in der Vorschau geladen.';
});
byId('export').addEventListener('click', () => {
  if (!form.reportValidity()) return;
  const view = views[active];
  const rules = view.names.map(name => `  ${name}: ${valueOf(name)};`).join('\n');
  const file = new Blob([`:root {\n${rules}\n}\n`], {type:'text/css'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = view.file;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  status.textContent = 'Einstellungsdatei für „'+view.title+'“ erstellt.';
});

function loadPreview() {
  const frame = preview.contentDocument;
  if (!frame?.querySelector('.preview-sample')) return;
  for (const sheet of frame.styleSheets) collectUsage(sheet.cssRules);
  syncPreview();
  render();
}
preview.addEventListener('load', loadPreview);
render();
loadPreview();
