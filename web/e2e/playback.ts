import { expect, type Page } from '@playwright/test'

// Sinds U34 is er geen afspeelknop: spatie op de tijdslider schakelt afspelen/pauzeren.
export async function startPlayback(page: Page): Promise<void> {
  // U68: data-playing meldt kaartgereed afspelen; de onthulling is geen speelpoort.
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  const slider = page.getByRole('slider', { name: 'Tijd' })
  if (await slider.getAttribute('data-playing') === null) await slider.press(' ')
  await expect(slider).toHaveAttribute('data-playing', '')
}

export async function pausePlayback(page: Page): Promise<void> {
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  const slider = page.getByRole('slider', { name: 'Tijd' })
  if (await slider.getAttribute('data-playing') !== null) await slider.press(' ')
  await expect(slider).not.toHaveAttribute('data-playing', '')
}
