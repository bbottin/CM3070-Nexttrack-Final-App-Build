// src/cache/memoryCache.js

class MemoryCache {
  constructor(ttlSeconds = 3600) {
    this.cache = new Map();
    this.ttl = ttlSeconds * 1000;
  }

  /**
   * Set a value in cache with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to store
   */
  set(key, value) {
    this.cache.set(key, {
      value: value,
      expiry: Date.now() + this.ttl,
    });
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null if expired/missing
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and is not expired
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache stats
   * @returns {Object} { size, keys }
   */
  stats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Export singleton instance
const cache = new MemoryCache(3600); // 1 hour TTL

module.exports = { cache, MemoryCache };
