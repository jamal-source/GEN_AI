import { chromium } from 'playwright';

async function testBrowser() {
  console.log('Launching headless Chromium test...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
  });

  console.log('Navigating to http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

  console.log('Page Title:', await page.title());

  // Test 1: Click About Button
  console.log('Testing About button click...');
  await page.click('#about-btn');
  const aboutVisible = await page.isVisible('#about-modal');
  console.log('About Modal Visible:', aboutVisible);
  await page.click('#about-modal .btn-primary-action'); // close about modal

  // Test 2: Click Model Selector Button
  console.log('Testing Model Selector button click...');
  await page.click('#model-selector-btn');
  const modelMenuVisible = await page.isVisible('#model-menu');
  console.log('Model Menu Visible:', modelMenuVisible);

  // Test 3: Click Llama 3.3 70B radio choice
  console.log('Selecting Llama 3.3 70B agent...');
  await page.click('.model-menu-item:has(input[value="groq"])');
  const selectedLabel = await page.textContent('#model-selected-label');
  console.log('Updated Model Selected Label:', selectedLabel.trim());

  // Test 4: Toggle Sidebar
  console.log('Testing Sidebar toggle...');
  await page.click('#sidebar-toggle');
  const isCollapsed = await page.evaluate(() => document.getElementById('sidebar').classList.contains('collapsed'));
  console.log('Sidebar Collapsed State after click:', isCollapsed);
  await page.click('#sidebar-toggle'); // uncollapse

  // Test 5: New Chat
  console.log('Testing + Chat Baru button...');
  await page.click('#new-chat-btn');
  const emptyHeroVisible = await page.isVisible('#empty-state');
  console.log('Empty Hero Visible:', emptyHeroVisible);

  // Test 6: Send Message
  console.log('Testing Chat Message Send...');
  await page.fill('#user-input', 'Halo tes produk keripik pisang');
  await page.click('#send-btn');
  await page.waitForTimeout(2000);

  const messageCount = await page.locator('.message-row').count();
  console.log('Message Rows in Chat Box:', messageCount);

  console.log('\n--- CONSOLE ERRORS RECORDED ---');
  console.log(consoleErrors.length === 0 ? 'ZERO CONSOLE ERRORS! PERFECT!' : consoleErrors);

  await browser.close();
}

testBrowser().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
