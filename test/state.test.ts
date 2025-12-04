import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createStateManager, type StateManager } from "../src/state";

const TEST_STATE_DIR = join(process.cwd(), ".state-test");
const TEST_STATE_FILE = join(TEST_STATE_DIR, "test-state.json");

describe("StateManager", () => {
  let manager: StateManager;

  beforeEach(async () => {
    // Clean up test directory
    await rm(TEST_STATE_DIR, { recursive: true, force: true });
    await mkdir(TEST_STATE_DIR, { recursive: true });

    // Create manager with persistence enabled for testing file operations
    manager = createStateManager({
      filePath: TEST_STATE_FILE,
      enablePersistence: true,
    });
  });

  afterEach(async () => {
    manager.reset();
    await rm(TEST_STATE_DIR, { recursive: true, force: true });
  });

  describe("load", () => {
    it("starts with empty state when no file exists", async () => {
      await manager.load();

      expect(manager.isLoaded()).toBe(true);
      expect(manager.getRecentTokens("channel1")).toEqual([]);
    });

    it("loads existing state from file", async () => {
      const existingState = {
        version: 1,
        updatedAt: "2024-01-01T00:00:00.000Z",
        recentTokens: { channel1: [1, 2, 3] },
        custom: { foo: "bar" },
      };
      await writeFile(TEST_STATE_FILE, JSON.stringify(existingState));

      await manager.load();

      expect(manager.getRecentTokens("channel1")).toEqual([1, 2, 3]);
      expect(manager.getCustom("foo")).toBe("bar");
    });

    it("only loads once", async () => {
      await manager.load();
      manager.addRecentToken("channel1", 42);

      // Second load should not reset state
      await manager.load();

      expect(manager.getRecentTokens("channel1")).toContain(42);
    });

    it("handles invalid JSON gracefully", async () => {
      await writeFile(TEST_STATE_FILE, "not valid json");

      // Should not throw
      await manager.load();

      expect(manager.isLoaded()).toBe(true);
    });
  });

  describe("save", () => {
    it("saves state to file", async () => {
      await manager.load();
      manager.addRecentToken("channel1", 100);
      await manager.save();

      const content = await readFile(TEST_STATE_FILE, "utf8");
      const saved = JSON.parse(content);

      expect(saved.recentTokens.channel1).toContain(100);
      expect(saved.version).toBe(1);
      expect(saved.updatedAt).toBeDefined();
    });

    it("does not save when not dirty", async () => {
      await manager.load();
      await manager.save();

      // File should not exist since nothing was modified
      await expect(readFile(TEST_STATE_FILE)).rejects.toThrow();
    });

    it("clears dirty flag after save", async () => {
      await manager.load();
      manager.addRecentToken("channel1", 1);

      expect(manager.isDirty()).toBe(true);

      await manager.save();

      expect(manager.isDirty()).toBe(false);
    });
  });

  describe("recentTokens", () => {
    beforeEach(async () => {
      await manager.load();
    });

    it("adds tokens to recent history", () => {
      manager.addRecentToken("channel1", 42);
      manager.addRecentToken("channel1", 43);

      const recent = manager.getRecentTokens("channel1");

      expect(recent).toEqual([43, 42]);
    });

    it("prevents duplicates and moves to front", () => {
      manager.addRecentToken("channel1", 1);
      manager.addRecentToken("channel1", 2);
      manager.addRecentToken("channel1", 1); // duplicate

      const recent = manager.getRecentTokens("channel1");

      expect(recent).toEqual([1, 2]);
    });

    it("limits history size", () => {
      // Add more than limit
      const limit = 50;
      for (let i = 0; i < limit + 10; i++) {
        manager.addRecentToken("channel1", i);
      }

      const recent = manager.getRecentTokens("channel1");

      expect(recent.length).toBe(limit);
      expect(recent.at(0)).toBe(limit + 9); // Most recent
    });

    it("tracks separate history per channel", () => {
      manager.addRecentToken("channel1", 1);
      manager.addRecentToken("channel2", 2);

      expect(manager.getRecentTokens("channel1")).toEqual([1]);
      expect(manager.getRecentTokens("channel2")).toEqual([2]);
    });

    it("checks if token was recently sent", () => {
      manager.addRecentToken("channel1", 42);

      expect(manager.wasRecentlySent("channel1", 42)).toBe(true);
      expect(manager.wasRecentlySent("channel1", 99)).toBe(false);
      expect(manager.wasRecentlySent("channel2", 42)).toBe(false);
    });

    it("clears recent tokens for a channel", () => {
      manager.addRecentToken("channel1", 1);
      manager.addRecentToken("channel1", 2);
      manager.clearRecentTokens("channel1");

      expect(manager.getRecentTokens("channel1")).toEqual([]);
    });
  });

  describe("custom state", () => {
    beforeEach(async () => {
      await manager.load();
    });

    it("gets and sets custom values", () => {
      manager.setCustom("myKey", { nested: "value" });

      const result = manager.getCustom<{ nested: string }>("myKey");

      expect(result).toEqual({ nested: "value" });
    });

    it("returns undefined for missing keys", () => {
      expect(manager.getCustom("nonexistent")).toBeUndefined();
    });

    it("deletes custom values", () => {
      manager.setCustom("toDelete", "value");

      const deleted = manager.deleteCustom("toDelete");

      expect(deleted).toBe(true);
      expect(manager.getCustom("toDelete")).toBeUndefined();
    });

    it("returns false when deleting non-existent key", () => {
      const deleted = manager.deleteCustom("nonexistent");

      expect(deleted).toBe(false);
    });

    it("persists custom values", async () => {
      manager.setCustom("persistent", 123);
      await manager.save();

      // Create new manager and load
      const manager2 = createStateManager({
        filePath: TEST_STATE_FILE,
        enablePersistence: true,
      });
      await manager2.load();

      expect(manager2.getCustom("persistent")).toBe(123);
    });
  });

  describe("persistence disabled", () => {
    it("does not save when persistence is disabled", async () => {
      const inMemoryManager = createStateManager({
        filePath: TEST_STATE_FILE,
        enablePersistence: false,
      });

      await inMemoryManager.load();
      inMemoryManager.addRecentToken("channel1", 42);
      await inMemoryManager.save();

      // File should not exist
      await expect(readFile(TEST_STATE_FILE)).rejects.toThrow();
    });

    it("still works in-memory when persistence is disabled", async () => {
      const inMemoryManager = createStateManager({
        filePath: TEST_STATE_FILE,
        enablePersistence: false,
      });

      await inMemoryManager.load();
      inMemoryManager.addRecentToken("channel1", 42);

      expect(inMemoryManager.wasRecentlySent("channel1", 42)).toBe(true);
    });
  });

  describe("reset", () => {
    it("resets state to defaults", async () => {
      await manager.load();
      manager.addRecentToken("channel1", 42);
      manager.setCustom("key", "value");

      manager.reset();

      expect(manager.isLoaded()).toBe(false);
      expect(manager.isDirty()).toBe(false);
      expect(manager.getRecentTokens("channel1")).toEqual([]);
      expect(manager.getCustom("key")).toBeUndefined();
    });
  });
});
