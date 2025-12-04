/**
 * A simple Least Recently Used (LRU) cache implementation
 * Items are evicted when capacity is exceeded, starting with least recently accessed
 */
export class LRUCache<K, V> {
  private readonly cache: Map<K, V>;
  private readonly order: K[];
  private readonly capacity: number;

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error("LRU cache capacity must be positive");
    }
    this.capacity = capacity;
    this.cache = new Map();
    this.order = [];
  }

  /**
   * Get a value from the cache
   * Marks the key as recently used
   */
  get(key: K): V | undefined {
    if (this.cache.has(key)) {
      this.updateOrder(key);
    }
    return this.cache.get(key);
  }

  /**
   * Check if a key exists in the cache
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Add or update a value in the cache
   * Evicts the least recently used item if at capacity
   */
  put(key: K, value: V): void {
    // If key already exists, just update value and order
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      this.updateOrder(key);
      return;
    }

    // Evict if at capacity
    if (this.cache.size >= this.capacity) {
      const lru = this.order.shift();
      if (lru !== undefined) {
        this.cache.delete(lru);
      }
    }

    this.cache.set(key, value);
    this.order.push(key);
  }

  /**
   * Remove a key from the cache
   */
  delete(key: K): boolean {
    const existed = this.cache.delete(key);
    if (existed) {
      const index = this.order.indexOf(key);
      if (index !== -1) {
        this.order.splice(index, 1);
      }
    }
    return existed;
  }

  /**
   * Clear all items from the cache
   */
  clear(): void {
    this.cache.clear();
    this.order.length = 0;
  }

  /**
   * Get the current number of items in the cache
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys in the cache (oldest to newest)
   */
  keys(): K[] {
    return [...this.order];
  }

  /**
   * Move a key to the end of the order (most recently used)
   */
  private updateOrder(key: K): void {
    const index = this.order.indexOf(key);
    if (index !== -1) {
      this.order.splice(index, 1);
      this.order.push(key);
    }
  }
}
