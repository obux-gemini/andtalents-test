const storageKey = 'andtalents-theme-v1';

export function validThemeValue(name, value) {
  if (typeof value !== 'string') return false;
  if (/^--theme-color-[a-z0-9-]+$/.test(name)) return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value);
  if (!/^--theme-font-[a-z0-9-]+$/.test(name) || !/^\d{1,2}(\.\d{1,2})?px$/.test(value)) return false;
  const size = Number.parseFloat(value);
  return size >= 6 && size <= 96;
}

function cleanTheme(values) {
  return Object.fromEntries(Object.entries(values ?? {}).filter(([name, value]) => validThemeValue(name, value)));
}

export function readTheme() {
  try {
    return cleanTheme(JSON.parse(localStorage.getItem(storageKey)));
  } catch {
    return {};
  }
}

export function saveTheme(values) {
  localStorage.setItem(storageKey, JSON.stringify(cleanTheme(values)));
}

export function applyTheme(root, values) {
  for (const [name, value] of Object.entries(cleanTheme(values))) root.style.setProperty(name, value);
}

export function initializeTheme() {
  const root = document.documentElement;
  applyTheme(root, readTheme());
  const themeColor = getComputedStyle(root).getPropertyValue('--theme-color-brand-teal').trim();
  if (themeColor) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
}
