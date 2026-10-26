// Catch-all frontend route — enables SEO-friendly sublinks and direct deep-links
// (e.g. /multigrade, /admin, /plans) to load the same React SPA defined in app/page.js.
// The App then reads `window.location.pathname` on mount (see App's first useEffect)
// to switch to the correct in-app view automatically.
import App from '../page.js'
export default App
