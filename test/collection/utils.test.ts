import { isValidTokenId, randomTokenId } from "../../src/config/collection";
import type { CollectionConfig } from "../../src/lib/types";

const testCollection: CollectionConfig = {
  prefix: "",
  address: "0x1234567890abcdef1234567890abcdef12345678",
  name: "Test Collection",
  chain: "ethereum",
  minTokenId: 1,
  maxTokenId: 100,
};

describe("isValidTokenId", () => {
  it("returns true for valid token IDs", () => {
    expect(isValidTokenId(testCollection, 1)).toBe(true);
    expect(isValidTokenId(testCollection, 50)).toBe(true);
    expect(isValidTokenId(testCollection, 100)).toBe(true);
  });

  it("returns false for invalid token IDs", () => {
    expect(isValidTokenId(testCollection, 0)).toBe(false);
    expect(isValidTokenId(testCollection, 101)).toBe(false);
    expect(isValidTokenId(testCollection, -1)).toBe(false);
    expect(isValidTokenId(testCollection, Number.NaN)).toBe(false);
  });

  it("handles zero-based collections", () => {
    const zeroBasedCollection = { ...testCollection, minTokenId: 0 };
    expect(isValidTokenId(zeroBasedCollection, 0)).toBe(true);
  });
});

describe("randomTokenId", () => {
  it("generates IDs within collection range", () => {
    const iterations = 100;
    for (let i = 0; i < iterations; i++) {
      const id = randomTokenId(testCollection);
      expect(id).toBeGreaterThanOrEqual(testCollection.minTokenId);
      expect(id).toBeLessThanOrEqual(testCollection.maxTokenId);
    }
  });

  it("works with single token range", () => {
    const singleCollection = {
      ...testCollection,
      minTokenId: 42,
      maxTokenId: 42,
    };
    expect(randomTokenId(singleCollection)).toBe(42);
  });
});
