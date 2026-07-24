const { chromium } = require('playwright');
const path = require('path');

async function run() {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  // Listen to browser console and page errors
  page.on('console', msg => {
    console.log(`[BROWSER LOG] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });
  page.on('pageerror', err => {
    console.error(`[BROWSER ERROR] ${err.stack || err.message}`);
  });
  page.on('requestfailed', request => {
    console.log(`[REQUEST FAILED] ${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
  });
  page.on('response', response => {
    const url = response.url();
    // Show all responses to moviebox-api and video CDN requests
    if (url.includes('moviebox-api') || url.includes('hakunaymatata') || url.includes('aoneroom') || response.status() >= 400) {
      console.log(`[HTTP ${response.status()}] ${url.substring(0, 150)}`);
    }
  });

  const testUrl = 'http://localhost:5173/media/tmdb-movie-1318447-apex';
  console.log(`Navigating to ${testUrl}...`);
  
  await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  console.log('Page DOM content loaded. Waiting 12 seconds for providers and scraping to run...');
  await page.waitForTimeout(12000);
  
  // Take first screenshot
  const screenshotPath1 = path.join('C:', 'Users', 'Administrator', '.gemini', 'antigravity', 'brain', 'dc40daa5-5c71-4167-97b5-0151da719cf4', 'playback_step1.png');
  await page.screenshot({ path: screenshotPath1 });
  console.log(`Saved screenshot 1 to: ${screenshotPath1}`);
  
  // Get full page state info
  const pageState = await page.evaluate(() => {
    const video = document.querySelector('video');
    const errorEl = document.querySelector('[class*="error"], [class*="Error"]');
    const tryAgainBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Try again'));
    const allText = document.body.innerText.substring(0, 500);
    
    return {
      hasVideo: !!video,
      videoSrc: video?.src || null,
      videoReadyState: video?.readyState,
      videoNetworkState: video?.networkState,
      videoError: video?.error ? { code: video.error.code, message: video.error.message } : null,
      hasErrorEl: !!errorEl,
      hasTryAgain: !!tryAgainBtn,
      pageText: allText,
    };
  });
  console.log('Page state at 12s:', JSON.stringify(pageState, null, 2));

  // If no video yet, wait more
  console.log('Waiting another 20 seconds for video to initialize...');
  await page.waitForTimeout(20000);

  // Check final state
  const finalState = await page.evaluate(() => {
    const video = document.querySelector('video');
    const tryAgainBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Try again'));
    const playBtn = Array.from(document.querySelectorAll('button, [role="button"]')).find(b =>
      (b.ariaLabel || '').toLowerCase().includes('play') ||
      (b.title || '').toLowerCase().includes('play')
    );
    
    // Check player store state via window
    const playerStore = window.__playerStore;
    
    return {
      hasVideo: !!video,
      videoSrc: video?.src?.substring(0, 150) || null,
      videoCurrentTime: video?.currentTime,
      videoReadyState: video?.readyState,
      videoNetworkState: video?.networkState,
      videoPaused: video?.paused,
      videoError: video?.error ? { code: video.error.code, message: video.error.message } : null,
      hasTryAgain: !!tryAgainBtn,
      hasPlayBtn: !!playBtn,
    };
  });
  console.log('Final state at 32s:', JSON.stringify(finalState, null, 2));

  const screenshotPath2 = path.join('C:', 'Users', 'Administrator', '.gemini', 'antigravity', 'brain', 'dc40daa5-5c71-4167-97b5-0151da719cf4', 'playback_step2.png');
  await page.screenshot({ path: screenshotPath2 });
  console.log(`Saved screenshot 2 to: ${screenshotPath2}`);

  await browser.close();
  console.log('Done!');
}

run().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
