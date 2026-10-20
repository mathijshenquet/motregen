import { repositoryRoot, validateChanges } from './changelog'

try {
  validateChanges(repositoryRoot)
  console.log('Changelog geldig')
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Changelog ongeldig')
  process.exitCode = 1
}
