import { readConfig } from './config.js'
import { runBot } from './runtime.js'

void Promise.resolve().then(async () => {
  const args = process.argv.slice(2)
  if (args.some((argument) => argument === '--once-weer' || argument.startsWith('--once-weer='))) {
    const { onceWeer } = await import('./once-weer.js')
    await onceWeer(args, process.env)
  } else await runBot(readConfig(process.env, args))
}).catch(() => {
  console.error('Bot kon niet starten; controleer configuratie, netwerk en actieve poller.')
  process.exitCode = 1
})
