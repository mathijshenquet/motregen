import { telegramPresetSearch } from './telegram-presets'

export interface TelegramWebApp {
  colorScheme: 'light' | 'dark'
  themeParams: Record<string, string | undefined>
  initDataUnsafe?: { start_param?: string }
  initData?: string
  ready(): void
  expand(): void
  onEvent(event: 'themeChanged', callback: () => void): void
  offEvent(event: 'themeChanged', callback: () => void): void
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

export async function loadTelegram(): Promise<TelegramWebApp | undefined> {
  const params = new URLSearchParams(window.location.search)
  if (params.get('tg') !== '1') return undefined
  if (!window.Telegram?.WebApp) {
    await new Promise<void>((resolve) => {
      const script = document.createElement('script')
      script.src = 'https://telegram.org/js/telegram-web-app.js'
      const timeout = window.setTimeout(resolve, 5000)
      const finished = () => {
        window.clearTimeout(timeout)
        resolve()
      }
      script.onload = finished
      script.onerror = finished
      document.head.append(script)
    })
  }
  const webApp = window.Telegram?.WebApp
  if (!webApp) return undefined
  if (webApp.initData) {
    try {
      const response = await fetch('/telegram/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: webApp.initData }),
        signal: AbortSignal.timeout(5000),
      })
      const validation = await response.json() as { valid?: boolean }
      document.documentElement.dataset.telegramVerified = validation.valid === true ? 'true' : 'false'
    } catch {
      document.documentElement.dataset.telegramVerified = 'false'
    }
  }
  const search = telegramPresetSearch(window.location.search, webApp.initDataUnsafe?.start_param)
  window.history.replaceState(null, '', `${window.location.pathname}?${search}${window.location.hash}`)
  webApp.expand()
  webApp.ready()
  return webApp
}

export function applyTelegramColors(webApp: TelegramWebApp): void {
  const colors = {
    bg_color: '--page',
    secondary_bg_color: '--surface-soft',
    section_bg_color: '--surface',
    text_color: '--text',
    hint_color: '--muted',
    button_color: '--accent',
    link_color: '--accent-bright',
  }
  for (const [telegramColor, appColor] of Object.entries(colors)) {
    const value = webApp.themeParams[telegramColor]
    if (value && /^#[0-9a-f]{6}$/i.test(value)) document.documentElement.style.setProperty(appColor, value)
    else document.documentElement.style.removeProperty(appColor)
  }
  webApp.setHeaderColor('bg_color')
  const background = webApp.themeParams.bg_color
  if (background && /^#[0-9a-f]{6}$/i.test(background)) webApp.setBackgroundColor(background)
}
