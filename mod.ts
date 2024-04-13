/**
 * Options for {@link kvMemoize}.
 */
export interface KvMemoizeOptions<
  K extends Deno.KvKey,
  A extends Deno.KvKey,
  R,
> {
  /**
   * The time in milliseconds until the cached result expires.
   */
  expireIn?:
    | ((this: void, result: R, ...args: A) => number | undefined)
    | number
    | undefined;

  /**
   * Whether to recalculate the result if it was already cached.
   *
   * Runs whenever the result is retrieved from the cache.
   *
   * A nullish result will always be recalculated.
   *
   * Defaults to never recalculating the result if not nullish.
   */
  shouldRecalculate?:
    | ((this: void, result: NonNullable<R>, ...args: A) => boolean)
    | undefined;

  /**
   * Whether to cache the result after computing it.
   *
   * Runs whenever a new result is computed.
   *
   * A nullish result will never be cached.
   *
   * Defaults to always caching the result if not nullish.
   */
  shouldCache?:
    | ((this: void, result: NonNullable<R>, ...args: A) => boolean)
    | undefined;

  /**
   * Override the default {@link Deno.Kv} set and get methods.
   */
  kv?: {
    /**
     * Custom {@link Deno.Kv.get} method.
     *
     * @default (db,key)=>db.get(key).then(entry=>entry.value)
     */
    get: (this: void, db: Deno.Kv, key: [...K, ...A]) => Promise<R | undefined>;

    /**
     * Custom {@link Deno.Kv.set} method.
     *
     * @default (db,key,value,options)=>db.set(key,value,options)
     */
    set: (
      this: void,
      db: Deno.Kv,
      key: [...K, ...A],
      value: R,
      options: { expireIn?: number },
    ) => Promise<void>;
  };
}

/**
 * Returns a function that caches the result of the given function in the {@link Deno.Kv} store.
 */
export function kvMemoize<K extends Deno.KvKey, A extends Deno.KvKey, R>(
  db: Deno.Kv,
  key: K,
  fn: (...args: A) => Promise<R>,
  options?: KvMemoizeOptions<K, A, R>,
): (...args: A) => Promise<R> {
  const cache = new Map<string, Promise<R>>();

  return (...args) => {
    const cacheKey = stringifyKey(args);
    const cachedPromise = cache.get(cacheKey);

    if (cachedPromise) return cachedPromise;

    const promise = (async () => {
      const cachedResult = options?.kv?.get
        ? await options.kv.get(db, [...key, ...args])
        : (await db.get<R>([...key, ...args])).value;

      if (cachedResult != null) {
        if (!options?.shouldRecalculate?.(cachedResult, ...args)) {
          return cachedResult;
        }
      }

      const result = await fn(...args);

      const expireIn = typeof options?.expireIn === "function"
        ? options.expireIn(result, ...args)
        : options?.expireIn;

      if (result != null) {
        if (options?.shouldCache?.(result, ...args) ?? true) {
          if (options?.kv?.set) {
            await options.kv.set(db, [...key, ...args], result, { expireIn });
          } else {
            await db.set([...key, ...args], result, { expireIn });
          }
        }
      }

      return result;
    })().finally(() => cache.delete(cacheKey));

    cache.set(cacheKey, promise);
    return promise;
  };
}

const stringifyKey = (key: Deno.KvKey) =>
  key
    .map((v) => v instanceof Uint8Array ? Array.from(v) : v)
    .map((v) => JSON.stringify(v))
    .join(".");
