import { test, expect } from '@playwright/test';

test('Debug server connection', async ({ page }) => {
  console.log('Testing server connection...');

  try {
    // Försök bara navigera till servern
    const response = await page.goto('http://localhost:3000', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log('Response status:', response.status());
    console.log('Response URL:', response.url());

    // Vänta lite
    await page.waitForTimeout(3000);

    // Hämta allt innehåll
    const content = await page.content();
    console.log('Page content length:', content.length);
    console.log('First 500 chars:', content.substring(0, 500));

    // Ta screenshot
    await page.screenshot({ path: 'debug-server.png', fullPage: true });

    console.log('Screenshot saved as debug-server.png');

  } catch (error) {
    console.log('Error connecting to server:', error.message);
    throw error;
  }
});