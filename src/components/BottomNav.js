import { router } from '../lib/router.js';
import { renderIcon } from '../utils/icons.js';

const NAV_ITEMS = [
  {
    id: 'home',
    label: 'Home',
    path: '/',
    icon: renderIcon('HOME', 'w-5 h-5')
  },
  {
    id: 'analytics',
    label: 'Analytics',
    path: '/analytics',
    icon: renderIcon('CHART', 'w-5 h-5')
  },
  {
    id: 'gallery',
    label: 'My NFTs',
    path: '/gallery',
    icon: renderIcon('IMAGE', 'w-5 h-5')
  },
  {
    id: 'battle',
    label: 'Battle',
    path: '/battle',
    icon: renderIcon('SWORDS', 'w-5 h-5')
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
        : normalizePath(window.location.pathname).startsWith('/battle')
          ? 'battle'
          : 'home'
  );

  return `
    <nav class="fixed bottom-0 left-0 right-0 z-40 glass-header border-t border-white/10 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]" aria-label="Primary navigation">
      <div class="max-w-6xl mx-auto grid grid-cols-4 gap-2">
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
