import { expect, type Page } from '@playwright/test'

// Sinds U34 is er geen afspeelknop: spatie op de tijdslider schakelt afspelen/pauzeren.
export async function pausePlayback(page: Page): Promise<void> {
  const slider = page.getByRole('slider', { name: 'Tijd' })
  if (await slider.getAttribute('data-playing') !== null) await slider.press(' ')
  await expect(slider).not.toHaveAttribute('data-playing', '')
}
