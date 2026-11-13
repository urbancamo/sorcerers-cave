/** The message a person should see for a failed Convex call: the thrown Error's own text, without the "[CONVEX M(...)] Server Error" wrapping. */
export function errorText(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  const m = e instanceof Error ? e.message : '';
  const inner = /Uncaught Error: ([^\n]+)/.exec(m)?.[1];
  return (inner ?? m) || fallback;
}
