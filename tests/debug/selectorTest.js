// Debug script för att hitta rätt selectors
import { test } from '@playwright/test';

test('Debug selectors', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Lista alla knappar
  const buttons = await page.locator('button').all();
  console.log('Alla knappar:', buttons.length);

  for (let i = 0; i < buttons.length; i++) {
    const text = await buttons[i].textContent();
    console.log(`Button ${i}: "${text}"`);
  }

  // Lista alla inputs
  const inputs = await page.locator('input').all();
  console.log('Alla inputs:', inputs.length);

  for (let i = 0; i < inputs.length; i++) {
    const type = await inputs[i].getAttribute('type');
    const placeholder = await inputs[i].getAttribute('placeholder');
    console.log(`Input ${i}: type="${type}", placeholder="${placeholder}"`);
  }
});