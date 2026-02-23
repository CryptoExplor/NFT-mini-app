import { router } from '../lib/router.js';
import { bindBottomNavEvents, renderBottomNav } from '../components/BottomNav.js';
import { bindThemeToggleEvents, renderThemeToggleButton } from '../components/ThemeToggle.js';
import { toast } from '../utils/toast.js';

export async function renderBattlePage() {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
        <div class="min-h-screen bg-slate-900 app-text">
            <header class="glass-header fixed top-0 left-0 right-0 z-40 p-4">
                <div class="max-w-6xl mx-auto flex items-center justify-between">
                    <button id="battle-back-btn" class="text-white hover:text-indigo-400 transition flex items-center space-x-2" aria-label="Back to home">
                        <span>Back</span>
                    </button>
                    ${renderThemeToggleButton('theme-toggle-battle')}
                </div>
            </header>

            <main class="pt-24 pb-24 px-6">
                <div class="max-w-3xl mx-auto">
                    <section class="glass-card p-8 rounded-2xl border border-white/10 text-center">
                        <h1 class="text-3xl font-bold mb-3">Battle is Coming Soon</h1>
                        <p class="opacity-70 mb-8">
                            We are building NFT battle gameplay and this tab will go live soon.
                        </p>
                        <button id="battle-home-btn" class="legendary-button px-6 py-3 rounded-xl font-bold text-white">
                            Go Home
                        </button>
                    </section>
                </div>
            </main>

            ${renderBottomNav('battle')}
        </div>
    `;

    bindBottomNavEvents();
    bindThemeToggleEvents();
    toast.show('Battle mode is coming soon.', 'info', 2500);

    const backButton = document.getElementById('battle-back-btn');
    if (backButton) {
        backButton.addEventListener('click', () => router.navigate('/'));
    }

    const homeButton = document.getElementById('battle-home-btn');
    if (homeButton) {
        homeButton.addEventListener('click', () => router.navigate('/'));
    }
}

export function cleanup() {
    // Reserved for future Battle-page listeners.
}
