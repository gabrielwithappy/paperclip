import { describe, expect, it } from "vitest";
import { ChatProgressValidationError } from "./progress-validation-error.js";

describe("run progress validation diagnostics", () => {
  it.each(["40001", "40P01", "55P03", "08006", "CONNECT_TIMEOUT", "CONNECTION_CLOSED"])(
    "recognizes structured transient %s through a Drizzle cause without exposing SQL", code => {
      const error = new ChatProgressValidationError(new Error("PRIVATE query and parameters", {
        cause: Object.assign(new Error("PRIVATE provider token"), { code }),
      }));
      expect(error.retryable).toBe(true);
      expect(error.databaseCode).toBe(code);
      expect(error.message).not.toContain("PRIVATE");
      expect(error.cause).toBeUndefined();
    },
  );
  it.each(["42501", "22P02", "28P01", "25P02", "CONNECTION_ENDED", "private-secret", "TOKEN"])(
    "does not retry permanent or unsupported %s", code => {
      const error = new ChatProgressValidationError(Object.assign(new Error("PRIVATE"), { code }));
      expect(error.retryable).toBe(false);
      expect(error.message).not.toContain("PRIVATE");
      expect(error.message).not.toContain("private-secret");
      expect(error.message).not.toContain("TOKEN");
    },
  );
  it("does not infer a transient failure from free text or loop on causes", () => {
    const cause = new Error("40001 CONNECTION_CLOSED PRIVATE");
    cause.cause = cause;
    const error = new ChatProgressValidationError(cause);
    expect(error.databaseCode).toBeNull();
    expect(error.retryable).toBe(false);
    expect(error.message).not.toContain("PRIVATE");
  });
});
