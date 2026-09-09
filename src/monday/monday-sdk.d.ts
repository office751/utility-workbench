// Our own typing for monday-sdk-js (tsconfig.app.json `paths` points here).
// The package's shipped .ts typings fail our strict tsconfig. Only the init
// function is typed; the client's methods are typed in mondayClient.ts.
declare const init: (options?: Record<string, unknown>) => unknown
export default init
