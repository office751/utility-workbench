/**
 * login.mjs — ONE-TIME (and occasional) login.
 *
 * Opens a real Chrome window pointed at the county portal, using a dedicated
 * browser profile stored in PROFILE_DIR. You log in normally (Tyler ID), then
 * press Enter here — Playwright saves that session into PROFILE_DIR, and the
 * nightly scan reuses it. No password is ever stored or typed by the script;
 * only the logged-in *session* is kept, the same way your browser remembers you.
 *
 * Re-run this whenever the scan reports it's logged out (typically once a month
 * or so, whenever the portal expires the session).
 */
import { chromium } from 'playwright'
import 'dotenv/config'
import readline from 'node:readline'

const PROFILE_DIR = process.env.PROFILE_DIR || './profile'
const PORTAL = 'https://selfservice.marionfl.org/energov_prod/selfservice#/home'

console.log('\nOpening the Marion County portal in a dedicated browser…')
console.log('→ Log in as you normally would (Tyler ID).')
console.log('→ Then come back to THIS terminal and press Enter to save the session.\n')

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1280, height: 900 },
})
const page = ctx.pages()[0] || (await ctx.newPage())
await page.goto(PORTAL).catch(() => {})

await new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question('Press Enter once you are fully logged in… ', () => {
    rl.close()
    resolve()
  })
})

await ctx.close() // persists cookies/session into PROFILE_DIR
console.log(`\n✓ Session saved to ${PROFILE_DIR}. You can now run:  npm run scan -- --permit 2025020809 --dry-run\n`)
