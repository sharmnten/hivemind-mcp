import { describe, expect, it } from "vitest";
import { usernameAddress } from "../apps/dashboard/src/username.js";
describe("username identities", () => {
  it("canonicalizes case and whitespace to the same identity", () => {
    expect(usernameAddress("  Test_USER  ")).toBe(
      "test_user@users.hivemind.invalid",
    );
    expect(usernameAddress("test_user")).toBe(usernameAddress("TEST_USER"));
  });
  it.each([
    "ab",
    "a".repeat(33),
    "a@b.com",
    "user name",
    "user-name",
    "üser",
    "",
    "abc\nxyz",
  ])("rejects invalid username %s", (value) => {
    expect(() => usernameAddress(value)).toThrow("3–32");
  });
});
