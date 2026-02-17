import { router } from '../lib/router.js';

const NAV_ITEMS = [
  {
    id: 'home',
    label: 'Home',
    path: '/',
    icon: `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-6.75c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
      </svg>
    `
  },
  {
    id: 'analytics',
    label: 'Analytics',
    path: '/analytics',
    icon: `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125h4.5V21H3v-7.875Zm6.75-6h4.5V21h-4.5V7.125Zm6.75 3.75H21V21h-4.5v-10.125Z" />
      </svg>
    `
  },
  {
    id: 'gallery',
    label: 'My NFTs',
    path: '/gallery',
    icon: `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-5 h-5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75A2.25 2.25 0 0 1 4.5 4.5h15A2.25 2.25 0 0 1 21.75 6.75v10.5A2.25 2.25 0 0 1 19.5 19.5h-15A2.25 2.25 0 0 1 2.25 17.25V6.75Zm0 0 6 6 3.75-3.75 5.25 5.25" />
      </svg>
    `
  }
];

function normalizePath(path) {
  if (typeof path !== 'string' || !path) return '/';
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path;
}

export function renderBottomNav(activeTab = null) {
  const tab = activeTab || (
    normalizePath(window.location.pathname).startsWith('/analytics')
      ? 'analytics'
      : normalizePath(window.location.pathname).startsWith('/gallery')
        ? 'gallery'
        : 'home'
  );

  return `
    <nav class="fixed bottom-0 left-0 right-0 z-40 glass-header border-t border-white/10 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]" aria-label="Primary navigation">
      <div class="max-w-6xl mx-auto grid grid-cols-3 gap-2">
        ${NAV_ITEMS.map((item) => {
    const isActive = item.id === tab;
    return `
            <button
              type="button"
              data-bottom-nav
              data-path="${item.path}"
              class="min-h-[44px] rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors border ${isActive
        ? 'bottom-nav-active'
        : 'bottom-nav-inactive'}"
              aria-label="${item.label}">
              ${item.icon}
              <span class="text-[11px] font-medium">${item.label}</span>
            </button>
          `;
  }).join('')}
      </div>
    </nav>
  `;
}

export function bindBottomNavEvents() {
  const buttons = document.querySelectorAll('[data-bottom-nav]');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const path = button.getAttribute('data-path');
      if (!path) return;
      if (normalizePath(window.location.pathname) === normalizePath(path)) return;
      router.navigate(path);
    });
  });
}
