import assert from "node:assert/strict";
import test from "node:test";
import { normalizeKenyanMobileNumber } from "./kenyan-phone";

test("normalizes valid Kenyan mobile numbers including the 01 prefix", () => {
  assert.equal(normalizeKenyanMobileNumber("0115361101"), "254115361101");
  assert.equal(normalizeKenyanMobileNumber("0712 345 678"), "254712345678");
  assert.equal(normalizeKenyanMobileNumber("+254115361101"), "254115361101");
});

test("rejects malformed or unsupported Kenyan mobile numbers", () => {
  assert.equal(normalizeKenyanMobileNumber("011536110"), null);
  assert.equal(normalizeKenyanMobileNumber("0215361101"), null);
  assert.equal(normalizeKenyanMobileNumber(""), null);
});
