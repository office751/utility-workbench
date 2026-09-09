// Typing for the monday-sdk-js browser bundle we import directly (the package's
// own .ts typings fail our strict tsconfig). Only the calls the Runbook makes.
declare module 'monday-sdk-js/dist/main.js' {
  const init: (options?: Record<string, unknown>) => unknown
  export default init
}
