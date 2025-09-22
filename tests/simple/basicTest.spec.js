import { test, expect } from '@playwright/test';

test.describe('Basic App Test', () => {
  test('Can access the application', async ({ page }) => {
    console.log('Navigating to application...');

    // Gå till appen
    await page.goto('/', { waitUntil: 'networkidle' });

    // Vänta på att React-appen laddar (kolla att JavaScript-meddelandet försvinner ELLER att vi ser inloggningssida)
    await page.waitForFunction(() => {
      const body = document.body.textContent;
      return !body.includes('You need to enable JavaScript to run this app') ||
             body.includes('Logga in') ||
             body.includes('E-postadress') ||
             body.includes('Lösenord');
    }, { timeout: 15000 });

    console.log('React app loaded successfully!');

    // Ta en screenshot
    await page.screenshot({ path: 'app-startup.png' });

    // Logga vad som finns på sidan
    const title = await page.title();
    console.log('Page title:', title);

    const bodyText = await page.locator('body').textContent();
    console.log('Body text preview:', bodyText.substring(0, 200) + '...');

    // Hitta alla knappar
    const buttons = await page.locator('button').all();
    console.log('Found buttons:', buttons.length);

    for (let i = 0; i < Math.min(buttons.length, 5); i++) {
      const text = await buttons[i].textContent();
      console.log(`Button ${i + 1}: "${text}"`);
    }

    // Hitta alla inputs
    const inputs = await page.locator('input').all();
    console.log('Found inputs:', inputs.length);

    for (let i = 0; i < Math.min(inputs.length, 5); i++) {
      const type = await inputs[i].getAttribute('type');
      const placeholder = await inputs[i].getAttribute('placeholder');
      console.log(`Input ${i + 1}: type="${type}", placeholder="${placeholder}"`);
    }

    // Hitta alla länkar
    const links = await page.locator('a').all();
    console.log('Found links:', links.length);

    for (let i = 0; i < Math.min(links.length, 5); i++) {
      const href = await links[i].getAttribute('href');
      const text = await links[i].textContent();
      console.log(`Link ${i + 1}: "${text}" -> ${href}`);
    }

    // Grundläggande assertion - sidan ska ha laddat något
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test('Can interact with basic elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Försök klicka på första knappen
    const firstButton = page.locator('button').first();
    const buttonExists = await firstButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (buttonExists) {
      const buttonText = await firstButton.textContent();
      console.log('Clicking first button:', buttonText);

      await firstButton.click();
      await page.waitForTimeout(1000);

      console.log('Button click successful');
    } else {
      console.log('No buttons found to click');
    }
  });
});