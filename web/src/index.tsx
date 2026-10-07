import { render } from 'solid-js/web'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles.css'
import App from './App'
import SkywatchRender from './components/SkywatchRender'

render(() => new URLSearchParams(location.search).has('skywatch-render') ? <SkywatchRender /> : <App />, document.getElementById('root')!)
