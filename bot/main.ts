import { readConfig } from './config.js'
import { runBot } from './runtime.js'

void Promise.resolve().then(() => runBot(readConfig(process.env, process.argv.slice(2)))).catch(() => {
  console.error('Bot kon niet starten; controleer configuratie, netwerk en actieve poller.')
  process.exitCode = 1
})
