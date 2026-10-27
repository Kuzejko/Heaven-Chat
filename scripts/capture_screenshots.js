const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001; // use separate test port
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split(/[?#]/)[0];
  const filePath = path.join(__dirname, '..', urlPath === '/' ? 'index.html' : urlPath);
  const extname = path.extname(filePath);
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.statusCode = 404;
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

async function capture() {
  await new Promise(r => server.listen(PORT, r));
  console.log(`Test server running at http://localhost:${PORT}`);

  const outDir = path.join(__dirname, '..', 'test_screenshots', process.argv[2] || 'baseline');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();
  await page.goto(`http://localhost:${PORT}`);
  await page.waitForTimeout(1500);

  // 1. Main view (Default Emerald)
  await page.screenshot({ path: path.join(outDir, '01_main_view.png') });
  console.log('Saved 01_main_view.png');

  // 2. Open Settings dialog & capture each tab
  try {
    await page.evaluate(() => {
      const btn = document.getElementById('openSettingsBtn');
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, '02_settings_api.png') });
    console.log('Saved 02_settings_api.png');

    // Switch to Generation tab
    await page.evaluate(() => {
      const tab = document.querySelector('#tabBtnGeneration') || document.querySelector('[data-tab="tab-generation"]');
      if (tab) tab.click();
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, '02_settings_generation.png') });
    console.log('Saved 02_settings_generation.png');

    // Switch to Appearance tab
    await page.evaluate(() => {
      const tab = document.querySelector('#tabBtnAppearance') || document.querySelector('[data-tab="tab-appearance"]');
      if (tab) tab.click();
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, '02_settings_appearance.png') });
    console.log('Saved 02_settings_appearance.png');

    // Switch to Setting tab
    await page.evaluate(() => {
      const tab = document.querySelector('#tabBtnSetting') || document.querySelector('[data-tab="tab-setting"]');
      if (tab) tab.click();
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, '02_settings_data.png') });
    console.log('Saved 02_settings_data.png');

    await page.evaluate(() => {
      document.querySelectorAll('dialog').forEach(d => d.close());
    });
    await page.waitForTimeout(400);
  } catch (e) {
    console.warn('Error in settings dialog capture:', e.message);
  }

  // 3. Open Character Creator/Editor
  try {
    await page.evaluate(() => {
      const btn = document.getElementById('quickCreateCharBtn');
      if (btn) btn.click();
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, '03_character_dialog.png') });
    console.log('Saved 03_character_dialog.png');
    await page.evaluate(() => {
      document.querySelectorAll('dialog').forEach(d => d.close());
    });
    await page.waitForTimeout(400);
  } catch (e) {
    console.warn('Error in character dialog capture:', e.message);
  }

  // 4. Open Right Sidebar
  try {
    await page.evaluate(() => {
      const btn = document.getElementById('toggleSidebarRightBtn');
      if (btn) btn.click();
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, '04_right_sidebar.png') });
    console.log('Saved 04_right_sidebar.png');
    
    // Close right sidebar before next steps
    await page.evaluate(() => {
      const btn = document.getElementById('toggleSidebarRightBtn');
      if (btn) btn.click();
    });
    await page.waitForTimeout(400);
  } catch (e) {
    console.warn('Error in right sidebar capture:', e.message);
  }

  // 5. Test Cyberpunk theme
  try {
    await page.evaluate(() => {
      const card = document.querySelector('[data-app-theme="cyberpunk"]');
      if (card) card.click();
      else document.documentElement.setAttribute('data-theme', 'cyberpunk');
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, '06_theme_cyberpunk.png') });
    console.log('Saved 06_theme_cyberpunk.png');
  } catch (e) {
    console.warn('Error in cyberpunk theme capture:', e.message);
  }

  // 6. Test Sapphire theme
  try {
    await page.evaluate(() => {
      const card = document.querySelector('[data-app-theme="sapphire"]');
      if (card) card.click();
      else document.documentElement.setAttribute('data-theme', 'sapphire');
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, '07_theme_sapphire.png') });
    console.log('Saved 07_theme_sapphire.png');
    
    // Switch back to Emerald
    await page.evaluate(() => {
      const card = document.querySelector('[data-app-theme="emerald"]');
      if (card) card.click();
      else document.documentElement.setAttribute('data-theme', 'emerald');
    });
    await page.waitForTimeout(300);
  } catch (e) {
    console.warn('Error in sapphire theme capture:', e.message);
  }

  // 7. Mobile / responsive view
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, '05_mobile_view.png') });
    console.log('Saved 05_mobile_view.png');
  } catch (e) {
    console.warn('Error in mobile capture:', e.message);
  }

  await browser.close();
  server.close();
  console.log('All screenshots captured successfully!');
  process.exit(0);
}

capture().catch(err => {
  console.error(err);
  process.exit(1);
});
