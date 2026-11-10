import { describe, expect, it } from "vitest";
import { freshEnough, paymentEvent, sign, verifySignature } from "./webhook";

const secret = "test-secret-value";
const body = JSON.stringify({ event_id: "evt_1", type: "payment_succeeded", email: "a@b.com", plan: "starter" });

describe("webhook signature", () => {
  it("accepts a correct signature (with or without prefix)", () => {
    const s = sign(secret, body);
    expect(verifySignature(secret, body, s)).toBe(true);
    expect(verifySignature(secret, body, "sha256=" + s)).toBe(true);
  });
  it("rejects wrong secret, tampered body, missing or malformed headers", () => {
    const s = sign(secret, body);
    expect(verifySignature("other", body, s)).toBe(false);
    expect(verifySignature(secret, body + " ", s)).toBe(false);
    expect(verifySignature(secret, body, null)).toBe(false);
    expect(verifySignature(secret, body, "abc")).toBe(false);
    expect(verifySignature("", body, s)).toBe(false);
  });
});

describe("event format", () => {
  it("parses a valid event and applies defaults", () => {
    const e = paymentEvent.parse(JSON.parse(body));
    expect(e.period_days).toBe(30);
  });
  it("rejects unknown event types and bad emails", () => {
    expect(paymentEvent.safeParse({ event_id: "x1x", type: "refund", email: "a@b.com" }).success).toBe(false);
    expect(paymentEvent.safeParse({ event_id: "x1x", type: "payment_succeeded", email: "nope" }).success).toBe(false);
  });
  it("applies replay protection", () => {
    const now = Date.now();
    expect(freshEnough(Math.floor(now / 1000) - 30, now)).toBe(true);
    expect(freshEnough(Math.floor(now / 1000) - 3600, now)).toBe(false);
    expect(freshEnough(undefined, now)).toBe(true);
  });
});
