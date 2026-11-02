import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Atelier View - 4-Stage Architectural Funnel', () => {
  test('boots to landing screen and shows luxury pedestal UI', async ({ page }) => {
    await page.goto('http://localhost:4173');

    // Verify luxury typography and header
    await expect(page.locator('text=ATELIER VIEW').first()).toBeVisible();
    await expect(page.locator('text=4-STAGE ARCHITECTURAL PORTAL')).toBeVisible();
    await expect(page.locator('text=3D PLAYGROUND READY')).toBeVisible();
    await expect(page.locator('text=Select .GLB')).toBeVisible();
    await expect(page.locator('text=Upload .MP4 ($0)')).toBeVisible();
    await expect(page.locator('text=Test Sample Room ($0)')).toBeVisible();
  });

  test('loads GLB and transitions through the 4-stage funnel', async ({ page }) => {
    await page.goto('http://localhost:4173');

    // Upload real GLB model
    const glbPath = path.resolve('public', 'uploads', 'spatial_pavilion_1792412121444.glb');
    const fileInput = page.locator('input[type="file"][accept*=".glb"]');
    await fileInput.setInputFiles(glbPath);

    // Verify Stage 1: Exterior mode header and prompt
    await expect(page.locator('text=ATELIER VIEW').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=● HOVER A FLOOR TO EXPLORE')).toBeVisible({ timeout: 10000 });

    // Verify Action pills
    await expect(page.locator('text=Change .GLB')).toBeVisible();
    await expect(page.locator('text=Video (.MP4)')).toBeVisible();
    await expect(page.locator('text=Close Model')).toBeVisible();

    // Verify roof is never listed as a floor
    const roofPenthouse = page.locator('text=Roof Penthouse');
    await expect(roofPenthouse).toHaveCount(0);

    // Hover over center of building to trigger floor selection
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.waitForTimeout(400);
      await page.mouse.click(cx, cy);
    }

    // Verify Stage 2 Floorplan: Back to Building button & Curated Spatial Index appear
    await expect(page.locator('text=Back to Building')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=Curated Spatial Index')).toBeVisible();
    await expect(page.locator('text=Dive Into First Room View')).toBeVisible();

    // Click Dive Into First Room View to enter Stage 3: Room View
    await page.locator('text=Dive Into First Room View').click();

    // Verify Stage 3 Room View UI appears and camera stays inside
    await expect(page.locator('text=Back to Floorplan').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Walk Inside Room (WASD)')).toBeVisible();
    await expect(page.locator('text=Sweet-Spot')).toBeVisible();
    await expect(page.locator('text=White Clay')).toBeVisible();
    await expect(page.locator('text=Cyber CAD')).toBeVisible();

    // Switch to Stage 4: Room Walk
    await page.locator('text=Walk Inside Room (WASD)').click();
    await expect(page.locator('text=Lock to Curated View')).toBeVisible();

    // Switch back to Room View
    await page.locator('text=Lock to Curated View').click();
    await expect(page.locator('text=Walk Inside Room (WASD)')).toBeVisible();

    // Switch back to Floorplan
    await page.locator('text=Back to Floorplan').first().click();
    await expect(page.locator('text=Back to Building')).toBeVisible();

    // Switch back to Exterior
    await page.locator('text=Back to Building').click();
    await expect(page.locator('text=● HOVER A FLOOR TO EXPLORE')).toBeVisible();
  });
});
