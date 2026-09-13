// The anti-bot honeypot the API checks (`website`): a field a person never
// sees — off-screen, out of the tab order, autofill off — that form-filling
// bots fill anyway. A non-empty value makes the API answer "ok" and do
// nothing. Render it once inside every public form that posts to a
// mail-sending route (contact, bespoke enquiry, order request, trade
// application, forgot password) and send its value as `website`.
//
// A plain function called from JSX (`{honeypotField(website, setWebsite)}`)
// rather than a <Component>: the storefront's ESLint has no React plugin, so
// an import used only as a JSX tag reads as unused.
export const honeypotField = (value, onChange) => (
  <div className="sr-only" aria-hidden="true">
    <input
      type="text"
      name="website"
      tabIndex={-1}
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
)
