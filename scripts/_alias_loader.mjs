import { pathToFileURL } from 'url'
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) return next(pathToFileURL(process.cwd() + '/' + specifier.slice(2)).href, context)
  return next(specifier, context)
}
