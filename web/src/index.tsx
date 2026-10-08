import { render } from 'solid-js/web'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles.css'
import App from './App'
import { loadTelegram } from './core/telegram'

async function startApp(): Promise<void> {
  const root = document.getElementById('root')!
  if (new URLSearchParams(window.location.search).has('skywatch-render')) {
    const { default: SkywatchRender } = await import('./components/SkywatchRender')
    render(() => <SkywatchRender />, root)
    return
  }
  const telegram = await loadTelegram()
  render(() => <App telegram={telegram} />, root)
}

void startApp()
