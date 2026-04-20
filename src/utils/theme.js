const THEME_STORAGE_KEY = 'mint_app_theme_preference_v1';
const MEDIA_QUERY = '(prefers-color-scheme: dark)';

let currentPreference = 'system';
let systemListenerAttached = false;
let mediaQueryList = null;

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function getSystemTheme() {
  if (!isBrowser()) return 'dark';
  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light';
}

function resolveTheme(preference) {
  if (preference === 'light' || preference === 'dark') return preference;
  return getSystemTheme();
}

function readStoredPreference() {
  if (!isBrowser()) return 'system';
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // Ignore storage access failures.
  }
  return 'system';
}

function writeStoredPreference(preference) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Ignore storage access failures.
  }
}

function applyResolvedTheme(theme, preference) {
  if (!isBrowser()) return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = theme;

  document.dispatchEvent(new CustomEvent('theme:change', {
    detail: { theme, preference }
  }));
}

function handleSystemThemeChange() {
  if (currentPreference !== 'system') return;
  applyResolvedTheme(resolveTheme('system'), 'system');
}

function attachSystemThemeListener() {
  if (!isBrowser() || systemListenerAttached) return;

  mediaQueryList = window.matchMedia(MEDIA_QUERY);
  if (typeof mediaQueryList.addEventListener === 'function') {
    mediaQueryList.addEventListener('change', handleSystemThemeChange);
  } else if (typeof mediaQueryList.addListener === 'function') {
    mediaQueryList.addListener(handleSystemThemeChange);
  }
  systemListenerAttached = true;
}

export function initTheme() {
  if (!isBrowser()) return { theme: 'dark', preference: 'dark' };

  currentPreference = readStoredPreference();
  attachSystemThemeListener();

  const resolved = resolveTheme(currentPreference);
  applyResolvedTheme(resolved, currentPreference);

  return { theme: resolved, preference: currentPreference };
}

export function setThemePreference(preference) {
  const normalized = (preference === 'light' || preference === 'dark' || preference === 'system')
    ? preference
    : 'system';

  currentPreference = normalized;
  writeStoredPreference(normalized);

  const resolved = resolveTheme(normalized);
  applyResolvedTheme(resolved, normalized);
  return { theme: resolved, preference: normalized };
}

export function getThemePreference() {
  return currentPreference;
}

export function getResolvedTheme() {
  if (isBrowser()) {
    const fromDom = document.documentElement.dataset.theme;
    if (fromDom === 'light' || fromDom === 'dark') return fromDom;
  }
  return resolveTheme(currentPreference);
}

export function toggleThemePreference() {
  const resolved = getResolvedTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';
  setThemePreference(next);
  return next;
}
