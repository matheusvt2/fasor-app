/**
 * E18-A1 (R-E8): the read CLIs (`friction-read-cli.ts`, `users-read-cli.ts`) run their read,
 * then close the database. A failure to close is swallowed, so it never replaces the read's
 * own error as the one logged (a `finally` that throws would).
 */
export async function readThenEnd<T>(read: () => Promise<T>, end: () => Promise<unknown>): Promise<T> {
  try {
    return await read();
  } finally {
    await end().catch(() => undefined);
  }
}
