/**
 * main.tsx — the entry point of the whole app.
 *
 * Think of this as the "ignition switch". The browser loads index.html,
 * index.html loads this file, and this file tells React:
 *   "take the <div id="root"> in index.html and render our <App /> inside it."
 *
 * ONE special case lives here: the CLIENT SELECTIONS SHARE LINK
 * (#/select/<token>). A homeowner opening that link must get the public
 * fill-out page and NOTHING else — no login screen, no auth bootstrapping,
 * no workbench load. This is the only spot that runs before Root's auth
 * gate, which is exactly why the branch lives here. Hash-based on purpose:
 * it needs no server rewrites, and URL fragments never leave the browser,
 * so tokens don't end up in server logs.
 */
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css' // global styles (applies to the whole page)
import Root from './Root.tsx' // auth gate → shows Login, then the App

// A share link looks like https://…/#/select/3f2a…-uuid. Anything else —
// including the auth-link hashes (#type=invite…) — falls through to Root.
const shareToken = /^#\/select\/([A-Za-z0-9-]{4,64})$/.exec(window.location.hash)?.[1]
// Lazy = the public page's chunk is only downloaded when a share link opens.
// eslint-disable-next-line react-refresh/only-export-components -- entry file, never hot-reloaded; the lazy() wrapper must live outside render
const PublicSelect = lazy(() => import('./components/PublicSelect.tsx'))

// Find the empty <div id="root"> in index.html and mount React there.
// The "!" tells TypeScript "trust me, this element definitely exists".
createRoot(document.getElementById('root')!).render(
  // StrictMode is a development-only helper: it double-checks our code for
  // common React mistakes. It renders nothing visible and is automatically
  // stripped out of production builds.
  <StrictMode>
    {shareToken ? (
      <Suspense fallback={null}>
        <PublicSelect token={shareToken} />
      </Suspense>
    ) : (
      <Root />
    )}
  </StrictMode>,
)
