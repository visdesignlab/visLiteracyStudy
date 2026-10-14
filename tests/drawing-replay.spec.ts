import { test, expect } from '@playwright/test';

test('legacy drawing replay seeks forward, backward and to an empty state without recording', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tests/fixtures/drawing-replay.html');
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId('main-menu-trigger')).toBeHidden();
  await expect(page.locator('.revisit-drawing-canvas .FixedSideContainer_side_top:visible')).toHaveCount(0);

  const countPaintedPixels = () => canvas.evaluate((element) => {
    const drawing = element as HTMLCanvasElement;
    const context = drawing.getContext('2d');
    if (!context) throw new Error('Missing canvas context');
    const { data } = context.getImageData(0, 0, drawing.width, drawing.height);
    let painted = 0;
    for (let i = 0; i < data.length; i += 4) {
      // Count the recorded red stroke, excluding the background and UI.
      if (data[i + 3] > 0 && data[i] > data[i + 1] + 40) painted += 1;
    }
    return painted;
  });

  await expect.poll(countPaintedPixels).toBeGreaterThan(0);
  const firstPixels = await countPaintedPixels();
  await page.getByRole('button', { name: 'Last snapshot' }).click();
  await expect.poll(countPaintedPixels).toBeGreaterThan(firstPixels * 2);
  await page.getByRole('button', { name: 'First snapshot' }).click();
  await expect.poll(countPaintedPixels).toBe(firstPixels);
  await page.getByRole('button', { name: 'Clear snapshot' }).click();
  await expect.poll(countPaintedPixels).toBe(0);
  await expect(page.getByTestId('draw-calls')).toHaveText('0');
  expect(errors).toEqual([]);
});
