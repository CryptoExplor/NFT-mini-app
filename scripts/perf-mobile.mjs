import { chromium, devices } from 'playwright';

const TARGET_URL = process.env.PERF_URL || 'http://127.0.0.1:4173/';
const RUNS = Number.parseInt(process.env.PERF_RUNS || '3', 10);

const DEVICE = devices['Pixel 7'];
const NETWORK = {
  offline: false,
  latency: 150,
  downloadThroughput: 209715, // ~1.6 Mbps
  uploadThroughput: 96000, // ~750 kbps
  connectionType: 'cellular4g'
};
const CPU_THROTTLE_RATE = 4;

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round(value) {
  return Math.round(value);
}

async function measureRun(browser) {
  const context = await browser.newContext({
    ...DEVICE,
    viewport: DEVICE.viewport,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', NETWORK);
  await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE });

  const result = {};

  const startLoad = Date.now();
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('#search-input', { timeout: 120000 });
  result.loadHomeMs = Date.now() - startLoad;

  const onboardingModal = page.locator('#onboarding-modal');
  if (await onboardingModal.isVisible().catch(() => false)) {
    const skipButton = page.locator('#onboarding-skip-btn');
    if (await skipButton.isVisible().catch(() => false)) {
      await skipButton.click({ timeout: 10000 });
      await page.waitForSelector('#onboarding-modal', { state: 'hidden', timeout: 120000 });
    }
  }

  const analyticsStart = Date.now();
  await page.click('[data-bottom-nav][data-path="/analytics"]');
  await page.waitForSelector('#back-home-btn', { timeout: 120000 });
  result.actionAnalyticsMs = Date.now() - analyticsStart;

  const galleryStart = Date.now();
  await page.click('[data-bottom-nav][data-path="/gallery"]');
  await page.waitForSelector('#gallery-search', { timeout: 120000 });
  result.actionGalleryMs = Date.now() - galleryStart;

  const drawerStart = Date.now();
  await page.click('#mobile-filter-btn');
  await page.waitForSelector('#mobile-filter-drawer:not(.hidden)', { timeout: 120000 });
  result.actionOpenFilterMs = Date.now() - drawerStart;

  const closeDrawerStart = Date.now();
  await page.click('#close-filter-btn');
  await page.waitForSelector('#mobile-filter-drawer', { state: 'hidden', timeout: 120000 });
  result.actionCloseFilterMs = Date.now() - closeDrawerStart;

  const homeBackStart = Date.now();
  await page.click('[data-bottom-nav][data-path="/"]');
  await page.waitForSelector('#search-input', { timeout: 120000 });
  result.actionBackHomeMs = Date.now() - homeBackStart;

  await context.close();
  return result;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const runs = [];

  for (let i = 0; i < RUNS; i += 1) {
    const run = await measureRun(browser);
    runs.push(run);
    // eslint-disable-next-line no-console
    console.log(`Run ${i + 1}/${RUNS}`, run);
  }

  await browser.close();

  const metrics = {
    loadHomeMs: round(median(runs.map((r) => r.loadHomeMs))),
    actionAnalyticsMs: round(median(runs.map((r) => r.actionAnalyticsMs))),
    actionGalleryMs: round(median(runs.map((r) => r.actionGalleryMs))),
    actionOpenFilterMs: round(median(runs.map((r) => r.actionOpenFilterMs))),
    actionCloseFilterMs: round(median(runs.map((r) => r.actionCloseFilterMs))),
    actionBackHomeMs: round(median(runs.map((r) => r.actionBackHomeMs)))
  };

  const limits = {
    loadTargetMs: 3000,
    actionTargetMs: 1000
  };

  const pass = {
    load: metrics.loadHomeMs < limits.loadTargetMs,
    actions:
      metrics.actionAnalyticsMs < limits.actionTargetMs &&
      metrics.actionGalleryMs < limits.actionTargetMs &&
      metrics.actionOpenFilterMs < limits.actionTargetMs &&
      metrics.actionCloseFilterMs < limits.actionTargetMs &&
      metrics.actionBackHomeMs < limits.actionTargetMs
  };

  const summary = {
    targetUrl: TARGET_URL,
    device: 'Pixel 7',
    cpuThrottleRate: CPU_THROTTLE_RATE,
    network: '4g-throttled',
    runs,
    medianMs: metrics,
    limits,
    pass
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
