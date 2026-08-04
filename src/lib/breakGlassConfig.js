// Build-time break-glass credential, read once.
//
// Split out from ./breakGlass.js so that module stays pure and testable under
// `node --test`, where `import.meta.env` does not exist. The members are read
// individually (not by spreading `import.meta.env`) because that is the form
// Vite/Astro guarantee to replace statically at build time.
//
// PUBLIC_ prefix: the storefront's islands run in the browser, so the value has
// to be exposed to client bundles — which is also the reason the passphrase
// itself is never here, only its digest. See ./breakGlass.js.
//
// Unset vars ⇒ readBreakGlassConfig returns null ⇒ the feature does not exist in
// that build. That is the default: emergency access is opt-in per deployment.

import { readBreakGlassConfig } from './breakGlass.js'

export const BREAK_GLASS = readBreakGlassConfig({
  email: import.meta.env.PUBLIC_BREAKGLASS_EMAIL,
  passwordHash: import.meta.env.PUBLIC_BREAKGLASS_PASSWORD_SHA256,
  name: import.meta.env.PUBLIC_BREAKGLASS_NAME,
})

export const breakGlassEnabled = BREAK_GLASS !== null
