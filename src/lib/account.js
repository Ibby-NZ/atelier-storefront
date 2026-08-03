// Trade-account state, derived from the user object GET /auth/me returns
// ({ id, email, name, role, trade_approved }).
//
// A trade account is created by /trade-application with `role: 'trade'` and
// `trade_approved: false`, and the back office flips the flag by hand — there is
// no self-serve approval and no notification. Until something on the site says
// so, an applicant cannot tell an approved account from a pending one, because
// the API simply withholds `trade_price_cents` in both cases and every price
// looks identical to the logged-out view.
//
// Pure functions, no fetching: `src/lib/auth.js` owns the request, this owns the
// meaning. Kept out of catalogue.js so that module stays about products.

export const TRADE_STATUS = Object.freeze({
  /** Not a trade account (anonymous, customer, or staff). */
  NONE: 'none',
  /** Applied, awaiting manual back-office approval. Behaves as a customer. */
  PENDING: 'pending',
  /** Approved: the API sends trade pricing to this account. */
  APPROVED: 'approved',
})

/**
 * @param {object|null|undefined} user — the /auth/me user, or null when logged out.
 * @returns {'none'|'pending'|'approved'}
 */
export function tradeStatus(user) {
  if (!user || user.role !== 'trade') return TRADE_STATUS.NONE
  return user.trade_approved ? TRADE_STATUS.APPROVED : TRADE_STATUS.PENDING
}

/** True only for an account the API will actually send trade pricing to. */
export const isApprovedTrade = (user) => tradeStatus(user) === TRADE_STATUS.APPROVED

// Copy for the account page. `none` has no note: a customer account needs no
// banner about a programme it is not in.
const TRADE_STATUS_NOTES = Object.freeze({
  [TRADE_STATUS.PENDING]: Object.freeze({
    tone: 'pending',
    label: 'Trade application under review',
    // Effectively unreachable now — a pending trade account cannot sign in at
    // all (the API refuses login until approval) — but kept truthful in case a
    // session ever survives into this state.
    text: 'Your trade application is being reviewed by our team. You will be able to sign in and see trade pricing once it has been approved.',
  }),
  [TRADE_STATUS.APPROVED]: Object.freeze({
    tone: 'approved',
    label: 'Trade account approved',
    text: 'Trade pricing is showing across the catalogue whenever you are signed in.',
  }),
})

/**
 * The status note to show on the account page, or null when there is nothing to say.
 *
 * @param {object|null|undefined} user
 * @returns {{ tone: string, label: string, text: string }|null}
 */
export const tradeStatusNote = (user) => TRADE_STATUS_NOTES[tradeStatus(user)] ?? null
