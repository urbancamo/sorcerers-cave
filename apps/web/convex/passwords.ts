import { normalizeUsername } from "./auth";

export const MIN_PASSWORD = 10;
const MAX_PASSWORD = 128;

/** Throws an Error whose message can be shown to the person setting the password. */
export function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD) throw new Error(`The password must be at least ${MIN_PASSWORD} characters.`);
  if (password.length > MAX_PASSWORD) throw new Error(`The password must be at most ${MAX_PASSWORD} characters.`);
}

/** The login name, lower-cased and checked: 3 to 40 characters of letters, digits, dot, dash and underscore, starting with a letter or digit. */
export function validateUsername(raw: string): string {
  const name = normalizeUsername(raw);
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(name)) {
    throw new Error("The username must be 3 to 40 characters: letters, digits, dot, dash or underscore, starting with a letter or digit.");
  }
  return name;
}
