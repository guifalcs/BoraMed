import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const STORAGE_PREFIX = 'bm_cache_';

/**
 * Lightweight stale-while-revalidate cache using sessionStorage.
 * Returns cached data instantly while the caller revalidates in background.
 */
@Injectable({ providedIn: 'root' })
export class CacheService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly memoryCache = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    if (!this.isBrowser) return null;

    // Check memory first
    const memEntry = this.memoryCache.get(key) as CacheEntry<T> | undefined;
    if (memEntry) return memEntry.data;

    // Fall back to sessionStorage
    try {
      const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
      if (!raw) return null;
      const entry = JSON.parse(raw) as CacheEntry<T>;
      // Store in memory for faster subsequent reads
      this.memoryCache.set(key, entry);
      return entry.data;
    } catch {
      return null;
    }
  }

  set<T>(key: string, data: T): void {
    if (!this.isBrowser) return;

    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    this.memoryCache.set(key, entry);

    try {
      sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
    } catch {
      // Quota exceeded — memory cache still works
    }
  }

  isStale(key: string, ttlMs: number = DEFAULT_TTL_MS): boolean {
    if (!this.isBrowser) return true;

    const memEntry = this.memoryCache.get(key);
    if (memEntry) return Date.now() - memEntry.timestamp > ttlMs;

    try {
      const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
      if (!raw) return true;
      const entry = JSON.parse(raw) as CacheEntry<unknown>;
      return Date.now() - entry.timestamp > ttlMs;
    } catch {
      return true;
    }
  }

  remove(key: string): void {
    this.memoryCache.delete(key);
    if (this.isBrowser) {
      try {
        sessionStorage.removeItem(STORAGE_PREFIX + key);
      } catch { /* noop */ }
    }
  }

  clear(): void {
    this.memoryCache.clear();
    if (this.isBrowser) {
      try {
        const keys: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k?.startsWith(STORAGE_PREFIX)) keys.push(k);
        }
        for (const k of keys) sessionStorage.removeItem(k);
      } catch { /* noop */ }
    }
  }
}
