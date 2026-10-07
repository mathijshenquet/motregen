import { render } from 'solid-js/web'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles.css'
import App from './App'
import { loadTelegram } from './core/telegram'

async function startApp(): Promise<void> {
  const telegram = await loadTelegram()
  render(() => <App telegram={telegram} />, document.getElementById('root')!)
}

void startApp()
