// Small helper: race a promise against a timeout. Rejects with a friendly error
// if the promise doesn't resolve within `ms` milliseconds.
export function withTimeout(promise, ms, label = 'operation') {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`))
    }, ms)
    promise.then(v => { clearTimeout(t); resolve(v) })
           .catch(e => { clearTimeout(t); reject(e) })
  })
}
