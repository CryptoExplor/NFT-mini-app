import { getResolvedTheme, toggleThemePreference } from '../utils/theme.js';

let themeChangeListenerAttached = false;

function moonIcon() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0 1 12 21.75c-5.385 0-9.75-4.365-9.75-9.75a9.718 9.718 0 0 1 6.748-9.252A7.5 7.5 0 1 0 21.752 15.002Z" />
    </svg>
  `;
}

function sunIcon() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1.5m0 15V21m-6.364-2.636 1.06-1.06m10.607-10.607 1.06-1.06M3 12h1.5m15 0H21m-2.636 6.364-1.06-1.06M6.697 6.697l-1.06-1.06M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
  `;
}

function getToggleContent(theme) {
  return theme === 'dark' ? sunIcon() : moonIcon();
}

function getToggleLabel(theme) {
  return theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}

export function renderThemeToggleButton(id = 'theme-toggle') {
  const theme = getResolvedTheme();
  const label = getToggleLabel(theme);

  return `
    <button
      id="${id}"
      type="button"
      data-theme-toggle
      class="glass-card w-10 h-10 min-h-[44px] rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
      aria-label="${label}"
      title="${label}">
      <span data-theme-toggle-icon>
        ${getToggleContent(theme)}
      </span>
    </button>
  `;
}

export function updateThemeToggleButtons() {
  const theme = getResolvedTheme();
  const label = getToggleLabel(theme);

  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    const icon = button.querySelector('[data-theme-toggle-icon]');
    if (icon) icon.innerHTML = getToggleContent(theme);
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  });
}

export function bindThemeToggleEvents() {
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.onclick = () => {
      toggleThemePreference();
      updateThemeToggleButtons();
    };
  });

  if (!themeChangeListenerAttached) {
    document.addEventListener('theme:change', updateThemeToggleButtons);
    themeChangeListenerAttached = true;
  }

  updateThemeToggleButtons();
}
