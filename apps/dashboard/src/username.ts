/** Supabase Auth uses an internal email-shaped identifier; no mailbox is involved. */
export function usernameAddress(input: string): string {
  const username = input.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(username)) {
    throw new Error(
      "Use 3–32 letters, numbers, or underscores for your username.",
    );
  }
  return `${username}@users.hivemind.invalid`;
}
