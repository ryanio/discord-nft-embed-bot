import { LRUCache } from "../../src/lib/lru-cache";

describe("LRUCache", () => {
  describe("basic operations", () => {
    it("stores and retrieves values", () => {
      const cache = new LRUCache<string, number>(10);

      cache.put("a", 1);
      cache.put("b", 2);

      expect(cache.get("a")).toBe(1);
      expect(cache.get("b")).toBe(2);
    });

    it("returns undefined for missing keys", () => {
      const cache = new LRUCache<string, number>(10);

      expect(cache.get("missing")).toBeUndefined();
    });

    it("updates existing values", () => {
      const cache = new LRUCache<string, number>(10);

      cache.put("key", 1);
      cache.put("key", 2);

      expect(cache.get("key")).toBe(2);
    });

    it("checks if key exists with has()", () => {
      const cache = new LRUCache<string, number>(10);

      cache.put("exists", 42);

      expect(cache.has("exists")).toBe(true);
      expect(cache.has("missing")).toBe(false);
    });

    it("deletes keys", () => {
      const cache = new LRUCache<string, number>(10);

      cache.put("key", 1);

      const deleted = cache.delete("key");

      expect(deleted).toBe(true);
      expect(cache.get("key")).toBeUndefined();
      expect(cache.has("key")).toBe(false);
    });

    it("returns false when deleting non-existent key", () => {
      const cache = new LRUCache<string, number>(10);

      expect(cache.delete("missing")).toBe(false);
    });

    it("clears all entries", () => {
      const cache = new LRUCache<string, number>(10);

      cache.put("a", 1);
      cache.put("b", 2);
      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBeUndefined();
    });

    it("tracks size correctly", () => {
      const cache = new LRUCache<string, number>(10);

      expect(cache.size).toBe(0);

      cache.put("a", 1);
      expect(cache.size).toBe(1);

      cache.put("b", 2);
      expect(cache.size).toBe(2);

      cache.delete("a");
      expect(cache.size).toBe(1);
    });

    it("returns all keys", () => {
      const cache = new LRUCache<string, number>(10);

      cache.put("a", 1);
      cache.put("b", 2);
      cache.put("c", 3);

      const keys = cache.keys();

      expect(keys).toContain("a");
      expect(keys).toContain("b");
      expect(keys).toContain("c");
      expect(keys.length).toBe(3);
    });
  });

  describe("capacity management", () => {
    it("evicts least recently used when capacity is exceeded", () => {
      const cache = new LRUCache<string, number>(3);

      cache.put("a", 1);
      cache.put("b", 2);
      cache.put("c", 3);
      cache.put("d", 4); // Should evict 'a'

      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe(2);
      expect(cache.get("c")).toBe(3);
      expect(cache.get("d")).toBe(4);
      expect(cache.size).toBe(3);
    });

    it("get() refreshes item to most recently used", () => {
      const cache = new LRUCache<string, number>(3);

      cache.put("a", 1);
      cache.put("b", 2);
      cache.put("c", 3);

      // Access 'a' to make it recently used
      cache.get("a");

      cache.put("d", 4); // Should evict 'b' (now least recently used)

      expect(cache.get("a")).toBe(1);
      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("c")).toBe(3);
      expect(cache.get("d")).toBe(4);
    });

    it("put() refreshes existing item to most recently used", () => {
      const cache = new LRUCache<string, number>(3);

      cache.put("a", 1);
      cache.put("b", 2);
      cache.put("c", 3);

      // Update 'a' to refresh it
      cache.put("a", 100);

      cache.put("d", 4); // Should evict 'b'

      expect(cache.get("a")).toBe(100);
      expect(cache.get("b")).toBeUndefined();
    });

    it("handles capacity of 1", () => {
      const cache = new LRUCache<string, number>(1);

      cache.put("a", 1);
      expect(cache.get("a")).toBe(1);

      cache.put("b", 2);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe(2);
      expect(cache.size).toBe(1);
    });

    it("handles large number of items", () => {
      const capacity = 100;
      const cache = new LRUCache<number, number>(capacity);

      // Insert more items than capacity
      for (let i = 0; i < capacity * 2; i++) {
        cache.put(i, i * 10);
      }

      expect(cache.size).toBe(capacity);

      // Only the last 'capacity' items should remain
      for (let i = 0; i < capacity; i++) {
        expect(cache.get(i)).toBeUndefined();
      }

      for (let i = capacity; i < capacity * 2; i++) {
        expect(cache.get(i)).toBe(i * 10);
      }
    });
  });

  describe("edge cases", () => {
    it("works with different value types", () => {
      const cache = new LRUCache<string, { value: number }>(10);

      cache.put("obj", { value: 42 });

      expect(cache.get("obj")).toEqual({ value: 42 });
    });

    it("works with numeric keys", () => {
      const cache = new LRUCache<number, string>(10);

      cache.put(1, "one");
      cache.put(2, "two");

      expect(cache.get(1)).toBe("one");
      expect(cache.get(2)).toBe("two");
    });

    it("handles undefined values", () => {
      const cache = new LRUCache<string, undefined>(10);

      cache.put("undef", undefined);

      expect(cache.has("undef")).toBe(true);
      expect(cache.get("undef")).toBeUndefined();
    });

    it("handles null values", () => {
      const cache = new LRUCache<string, null>(10);

      cache.put("null", null);

      expect(cache.has("null")).toBe(true);
      expect(cache.get("null")).toBeNull();
    });

    it("throws error for non-positive capacity", () => {
      expect(() => new LRUCache(0)).toThrow("capacity must be positive");
      expect(() => new LRUCache(-1)).toThrow("capacity must be positive");
    });
  });
});
