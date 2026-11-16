/** A failure of the local run-ownership snapshot, before provider transport. */
export class ChatProgressValidationError extends Error {
  readonly stage = "run_ownership_validation";
  readonly databaseCode: string | null;
  readonly retryable: boolean;

  constructor(error: unknown) {
    // Drizzle wraps driver errors in cause. Inspect structured codes only;
    // query text, parameters and driver messages must never become diagnostics.
    const seen = new Set<unknown>();
    let databaseCode: string | null = null;
    for (let value = error; value && typeof value === "object" && !seen.has(value) && seen.size < 8;) {
      seen.add(value);
      const record = value as { code?: unknown; cause?: unknown };
      if (typeof record.code === "string" && (
        diagnosticSqlStates.has(record.code) || driverConnectionCodes.has(record.code)
      )) {
        databaseCode = record.code;
        break;
      }
      value = record.cause;
    }
    const retryable = databaseCode !== null && (
      transientSqlStates.has(databaseCode) || driverConnectionCodes.has(databaseCode)
    );
    super(`Run progress validation failed before provider transport (${databaseCode ?? "unknown"}; ${retryable ? "transient database failure" : "non-retryable local failure"})`);
    this.name = "ChatProgressValidationError";
    this.databaseCode = databaseCode;
    this.retryable = retryable;
  }
}

const transientSqlStates = new Set([
  "40001", "40P01", "55P03", // serialization, deadlock, lock unavailable
  "53300", "57P01", "57P02", "57P03", // capacity or server shutdown/startup
  "08000", "08001", "08003", "08006", // connection failures
]);
const driverConnectionCodes = new Set([
  "CONNECT_TIMEOUT", "CONNECTION_CLOSED", "CONNECTION_DESTROYED",
  "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE",
]);

// Only known diagnostic tokens may leave this boundary, even if an arbitrary
// driver error uses a five-character string that resembles SQLSTATE.
const diagnosticSqlStates = new Set([
  ...transientSqlStates,
  "42501", "22P02", "28P01", "25P02", "42P01", "42703",
  "23503", "23505", "57014", "XX000", "0A000",
]);
