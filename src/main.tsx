/**
 * main.tsx — the entry point of the whole app.
 *
 * Think of this as the "ignition switch". The browser loads index.html,
 * index.html loads this file, and this file tells React:
 *   "take the <div id="root"> in index.html and render our <App /> inside it."
 *
 * You will almost never need to edit this file again.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css' // global styles (applies to the whole page)
import Root from './Root.tsx' // auth gate → shows Login, then the App

// Find the empty <div id="root"> in index.html and mount React there.
// The "!" tells TypeScript "trust me, this element definitely exists".
createRoot(document.getElementById('root')!).render(
  // StrictMode is a development-only helper: it double-checks our code for
  // common React mistakes. It renders nothing visible and is automatically
  // stripped out of production builds.
  <StrictMode>
    <Root />
  </StrictMode>,
)
