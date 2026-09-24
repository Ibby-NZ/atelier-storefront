// Accept / Reject for a quote the office has sent (24 Sep 2026) — one render
// function and one hook, shared by the /quote page (a guest's emailed link) and
// the orders panel in My Account (a signed-in client). The rules are in
// ./quoteReview.js; the API is the gate (409 once answered, 422 for a
// rejection with no reason).
//
// `quoteActions` is a plain FUNCTION returning JSX and is CALLED
// (quoteActions(order, ui)), never rendered as <Component/> — the orderView.jsx
// posture, because the store ESLint has no React plugin.

import { useState } from 'react'
import { canRespond, validateRejection, REJECTION_REASON_MAX } from './quoteReview.js'

const IDLE = Object.freeze({
  orderNumber: null,
  rejecting: false,
  reason: '',
  busy: false,
  error: '',
  fieldError: '',
})

// The API's words for an answer that is no longer possible are the machine's
// ("Cannot move an order from …"); the client gets a sentence instead.
const answerError = (err) => {
  if (err?.status === 409) return 'This quote has already been answered — refresh to see where it stands.'
  if (err?.status === 404) return 'This quote is no longer available.'
  return err?.message || 'We could not send your answer. Please try again.'
}

/**
 * The answer's state, for one order at a time.
 *
 * @param {{
 *   post: (order: object, accept: boolean, reason?: string) => Promise<{ order: object }>,
 *   onAnswered: (order: object, accept: boolean) => void,
 * }} options
 */
export function useQuoteAnswer({ post, onAnswered }) {
  const [state, setState] = useState(IDLE)

  const answer = async (order, accept) => {
    if (!accept) {
      const check = validateRejection(state.reason)
      if (!check.ok) {
        setState((current) => ({ ...current, fieldError: check.error }))
        return
      }
    }
    setState((current) => ({
      ...current,
      orderNumber: order.order_number,
      busy: true,
      error: '',
      fieldError: '',
    }))
    try {
      const body = await post(order, accept, accept ? undefined : state.reason.trim())
      setState(IDLE)
      onAnswered(body.order, accept)
    } catch (err) {
      const fieldError = err?.body?.errors?.find((entry) => entry.field === 'reason')?.message ?? ''
      setState((current) => ({
        ...current,
        busy: false,
        fieldError,
        error: fieldError ? '' : answerError(err),
      }))
    }
  }

  return {
    uiFor: (order) => (state.orderNumber === order.order_number ? state : IDLE),
    handlersFor: (order) => ({
      onAccept: () => answer(order, true),
      onStartReject: () => setState({ ...IDLE, orderNumber: order.order_number, rejecting: true }),
      onReasonChange: (reason) => setState((current) => ({ ...current, reason, fieldError: '' })),
      onSendReject: () => answer(order, false),
      onCancelReject: () => setState(IDLE),
    }),
  }
}

/**
 * The two buttons, and the reason box Reject opens. Null for an order that is
 * not waiting on an answer.
 *
 * @param {object} order
 * @param {object} ui `useQuoteAnswer`'s uiFor(order) and handlersFor(order), spread together
 */
export function quoteActions(order, ui) {
  if (!canRespond(order)) return null
  return (
    <div className="quote-actions">
      {ui.rejecting ? (
        <form
          className="quote-reject"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            ui.onSendReject()
          }}
        >
          <label className="field">
            <span>What should we change?</span>
            <textarea
              value={ui.reason}
              rows={3}
              maxLength={REJECTION_REASON_MAX}
              disabled={ui.busy}
              aria-invalid={ui.fieldError ? 'true' : undefined}
              onChange={(event) => ui.onReasonChange(event.target.value)}
            />
            {ui.fieldError && <span className="field-error">{ui.fieldError}</span>}
          </label>
          <div className="quote-actions-buttons">
            <button type="submit" className="btn btn-danger" disabled={ui.busy}>
              {ui.busy ? 'Sending…' : 'Send'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={ui.busy} onClick={ui.onCancelReject}>
              Back
            </button>
          </div>
        </form>
      ) : (
        <div className="quote-actions-buttons">
          <button type="button" className="btn btn-primary" disabled={ui.busy} onClick={ui.onAccept}>
            {ui.busy ? 'Sending…' : 'Accept quote'}
          </button>
          <button type="button" className="btn btn-ghost" disabled={ui.busy} onClick={ui.onStartReject}>
            Reject quote
          </button>
        </div>
      )}
      {ui.error && (
        <p className="field-error" role="alert">
          {ui.error}
        </p>
      )}
    </div>
  )
}
