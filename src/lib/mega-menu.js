// Header mega-menu controller (Maison direction).
//
// The panel opens on hover or keyboard focus of the Products item and closes on
// leaving the panel, hovering another nav item, Escape, or a click outside the
// header. Deliberately tiny and DOM-driven rather than a React island: the menu
// is a list of real links that must be in the served HTML for crawlers and for
// no-JS visitors, and Header.astro is static markup.
//
// The trigger is an <a href="/products">, not a <button>: with JS off, or on a
// touch device where there is no hover, it still navigates to the library. That
// is why nothing here calls preventDefault — opening the panel is additive.
//
// Below the desktop breakpoint the panel is hidden by CSS and the listeners are
// never attached, so the trigger behaves as a plain link.

const DESKTOP = '(min-width: 1025px)'
const OPEN_CLASS = 'is-mega-open'

/**
 * Wire the mega-menu inside `root`. Safe to call when the markup is absent.
 *
 * @param {ParentNode} [root]
 * @returns {void}
 */
export function initMegaMenu(root = document) {
  const header = root.querySelector('[data-mega-root]')
  if (!header) return

  const trigger = header.querySelector('[data-mega-trigger]')
  const panel = header.querySelector('[data-mega-panel]')
  if (!trigger || !panel) return

  // Hover has no meaning on a touch device, and the panel is display:none
  // below this width anyway — leaving it unwired keeps aria-expanded honest.
  const desktop = window.matchMedia(DESKTOP)
  if (!desktop.matches) return

  let open = false

  const setOpen = (next) => {
    if (next === open) return
    open = next
    header.classList.toggle(OPEN_CLASS, open)
    trigger.setAttribute('aria-expanded', String(open))
  }

  trigger.addEventListener('mouseenter', () => setOpen(true))
  trigger.addEventListener('focus', () => setOpen(true))

  // Hovering any OTHER nav item dismisses the panel — the handoff's rule, and
  // it stops the panel hanging over a link the visitor is reaching for.
  for (const item of header.querySelectorAll('[data-mega-dismiss]')) {
    item.addEventListener('mouseenter', () => setOpen(false))
    item.addEventListener('focus', () => setOpen(false))
  }

  panel.addEventListener('mouseleave', () => setOpen(false))
  header.addEventListener('mouseleave', () => setOpen(false))

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !open) return
    setOpen(false)
    trigger.focus()
  })

  // Tabbing past the last link in the panel, or clicking anywhere else on the
  // page, should put it away.
  document.addEventListener('focusin', (event) => {
    if (!open) return
    if (!header.contains(event.target)) setOpen(false)
  })

  document.addEventListener('click', (event) => {
    if (!open) return
    if (!header.contains(event.target)) setOpen(false)
  })
}
