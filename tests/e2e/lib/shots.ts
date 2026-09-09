/** Attach a screenshot to the report; with SHOTS_DIR set, also save it as a file (for tickets). */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';

export async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const body = await page.screenshot();
  await testInfo.attach(name, { body, contentType: 'image/png' });
  const dir = process.env.SHOTS_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(dir, `${name}.png`), body);
  }
}
