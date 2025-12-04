import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createLogger, isDebugEnabled } from "../lib/logger";

const log = createLogger("State");

const { STATE_DIR, NODE_ENV } = process.env;

/** Default state directory */
const DEFAULT_STATE_DIR = ".state";

/** State file name */
const STATE_FILE_NAME = "embed-bot-state.json";

/** Recent tokens history size per channel */
const RECENT_TOKENS_LIMIT = 50;

/** State data structure */
type StateData = {
  /** Version for future migrations */
  version: number;
  /** Last updated timestamp */
  updatedAt: string;
  /** Recent random tokens per channel (to avoid repeats) */
  recentTokens: Record<string, number[]>;
  /** Last random post timestamp per channel (ISO string) */
  lastRandomPost: Record<string, string>;
  /** Custom state data (extensible) */
  custom: Record<string, unknown>;
};

/** Default empty state */
const createDefaultState = (): StateData => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  recentTokens: {},
  lastRandomPost: {},
  custom: {},
});

/**
 * State manager for persisting bot state across restarts
 */
class StateManager {
  private readonly filePath: string;
  private readonly enablePersistence: boolean;

  private state: StateData = createDefaultState();
  private loaded = false;
  private dirty = false;

  constructor(options: { filePath: string; enablePersistence: boolean }) {
    this.filePath = options.filePath;
    this.enablePersistence = options.enablePersistence;
  }

  /**
   * Load state from disk (or initialize fresh)
   */
  async load(): Promise<void> {
    if (this.loaded) {
      log.debug("State already loaded, skipping");
      return;
    }

    this.loaded = true;

    if (!this.enablePersistence) {
      log.debug("Persistence disabled, using in-memory state");
      return;
    }

    log.debug(`Loading state from ${this.filePath}`);

    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(content) as Partial<StateData>;
      this.applyParsedState(parsed);

      if (isDebugEnabled()) {
        log.debug(`State version: ${this.state.version}`);
        log.debug(`Last updated: ${this.state.updatedAt}`);
        for (const [channelId, tokens] of Object.entries(
          this.state.recentTokens
        )) {
          log.debug(`  Channel ${channelId}: ${tokens.length} tokens`);
        }
      }
    } catch (error) {
      const maybeErr = error as { code?: string };
      if (maybeErr.code === "ENOENT") {
        log.debug("No existing state file, starting fresh");
        return;
      }
      log.error("Failed to load state:", error);
    }
  }

  /**
   * Apply parsed state with validation
   */
  private applyParsedState(parsed: Partial<StateData>): void {
    if (parsed.version !== undefined) {
      this.state.version = parsed.version;
    }
    if (parsed.updatedAt !== undefined) {
      this.state.updatedAt = parsed.updatedAt;
    }
    if (parsed.recentTokens !== undefined) {
      this.state.recentTokens = parsed.recentTokens;
    }
    if (parsed.lastRandomPost !== undefined) {
      this.state.lastRandomPost = parsed.lastRandomPost;
    }
    if (parsed.custom !== undefined) {
      this.state.custom = parsed.custom;
    }
  }

  /**
   * Save state to disk
   */
  async save(): Promise<void> {
    if (!this.enablePersistence) {
      log.debug("Persistence disabled, skipping save");
      return;
    }

    if (!this.dirty) {
      log.debug("State not dirty, skipping save");
      return;
    }

    this.state.updatedAt = new Date().toISOString();

    try {
      const dir = dirname(this.filePath);
      await mkdir(dir, { recursive: true });
      await writeFile(
        this.filePath,
        JSON.stringify(this.state, null, 2),
        "utf8"
      );
      this.dirty = false;
      log.debug("Saved state to disk");
    } catch (error) {
      log.error("Failed to save state:", error);
    }
  }

  /**
   * Mark state as dirty (needs saving)
   */
  private markDirty(): void {
    this.dirty = true;
  }

  /**
   * Get recent token IDs for a channel
   */
  getRecentTokens(channelId: string): number[] {
    return this.state.recentTokens[channelId] ?? [];
  }

  /**
   * Add a token ID to recent history for a channel
   */
  addRecentToken(channelId: string, tokenId: number): void {
    const recent = this.state.recentTokens[channelId] ?? [];

    // Add to front, remove duplicates
    const filtered = recent.filter((id) => id !== tokenId);
    const updated = [tokenId, ...filtered].slice(0, RECENT_TOKENS_LIMIT);

    this.state.recentTokens[channelId] = updated;
    this.markDirty();

    log.debug(
      `Added token #${tokenId} to channel ${channelId} (${updated.length} total)`
    );
  }

  /**
   * Check if a token was recently sent to a channel
   */
  wasRecentlySent(channelId: string, tokenId: number): boolean {
    const recent = this.state.recentTokens[channelId] ?? [];
    const wasSent = recent.includes(tokenId);
    if (wasSent) {
      log.debug(`Token #${tokenId} was recently sent to channel ${channelId}`);
    }
    return wasSent;
  }

  /**
   * Clear recent tokens for a channel
   */
  clearRecentTokens(channelId: string): void {
    if (this.state.recentTokens[channelId] !== undefined) {
      const count = this.state.recentTokens[channelId].length;
      this.state.recentTokens[channelId] = [];
      this.markDirty();
      log.debug(`Cleared ${count} recent tokens for channel ${channelId}`);
    }
  }

  /**
   * Get the last random post timestamp for a channel
   * Returns undefined if no random post has been made
   */
  getLastRandomPost(channelId: string): Date | undefined {
    const timestamp = this.state.lastRandomPost[channelId];
    if (timestamp) {
      return new Date(timestamp);
    }
    return;
  }

  /**
   * Set the last random post timestamp for a channel
   */
  setLastRandomPost(channelId: string, timestamp: Date = new Date()): void {
    this.state.lastRandomPost[channelId] = timestamp.toISOString();
    this.markDirty();
    log.debug(
      `Set last random post for channel ${channelId}: ${timestamp.toISOString()}`
    );
  }

  /**
   * Check if enough time has passed since the last random post
   * Returns true if no last post exists or if intervalMs has passed
   */
  shouldPostRandom(channelId: string, intervalMs: number): boolean {
    const lastPost = this.getLastRandomPost(channelId);
    if (!lastPost) {
      log.debug(`No last random post for channel ${channelId}, should post`);
      return true;
    }
    const elapsed = Date.now() - lastPost.getTime();
    const shouldPost = elapsed >= intervalMs;
    log.debug(
      `Last random post for channel ${channelId} was ${Math.round(elapsed / 1000)}s ago, ` +
        `interval is ${Math.round(intervalMs / 1000)}s, should post: ${shouldPost}`
    );
    return shouldPost;
  }

  /**
   * Get a custom state value
   */
  getCustom<T>(key: string): T | undefined {
    return this.state.custom[key] as T | undefined;
  }

  /**
   * Set a custom state value
   */
  setCustom<T>(key: string, value: T): void {
    this.state.custom[key] = value;
    this.markDirty();
    log.debug(`Set custom state: ${key}`);
  }

  /**
   * Delete a custom state value
   */
  deleteCustom(key: string): boolean {
    if (key in this.state.custom) {
      const { [key]: _, ...rest } = this.state.custom;
      this.state.custom = rest;
      this.markDirty();
      log.debug(`Deleted custom state: ${key}`);
      return true;
    }
    return false;
  }

  /**
   * Get entire state (for debugging/testing)
   */
  getState(): Readonly<StateData> {
    return this.state;
  }

  /**
   * Get state info for display
   */
  getStateInfo(): { channelCount: number; totalTokens: number } {
    const channelCount = Object.keys(this.state.recentTokens).length;
    const totalTokens = Object.values(this.state.recentTokens).reduce(
      (sum, arr) => sum + arr.length,
      0
    );
    return { channelCount, totalTokens };
  }

  /**
   * Check if state has been loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Check if state needs saving
   */
  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * Reset state to defaults (useful for testing)
   */
  reset(): void {
    this.state = createDefaultState();
    this.dirty = false;
    this.loaded = false;
    log.debug("State reset to defaults");
  }
}

/** Singleton state manager instance */
let stateManager: StateManager | undefined;

/**
 * Get the default state manager instance
 */
export const getStateManager = (): StateManager => {
  if (stateManager) {
    return stateManager;
  }

  const rootDir = process.cwd();
  const stateDir = STATE_DIR ?? DEFAULT_STATE_DIR;
  const filePath = join(rootDir, stateDir, STATE_FILE_NAME);
  const enablePersistence = NODE_ENV !== "test";

  log.debug(`Initializing state manager: ${filePath}`);
  stateManager = new StateManager({ filePath, enablePersistence });
  return stateManager;
};

/**
 * Create a state manager with custom options (for testing)
 */
export const createStateManager = (options: {
  filePath: string;
  enablePersistence: boolean;
}): StateManager => new StateManager(options);

/**
 * Reset the singleton (for testing)
 */
export const resetStateManager = (): void => {
  stateManager = undefined;
};

export { StateManager };
export type { StateData };
