import {
  assertEquals,
  assertObjectMatch,
  assertRejects,
} from "https://deno.land/std@0.221.0/assert/mod.ts";
import { delay } from "https://deno.land/std@0.221.0/async/mod.ts";
import { kvMemoize } from "./mod.ts";

const db = await Deno.openKv();

// clear db
for await (const entry of db.list({ prefix: [] })) {
  await db.delete(entry.key);
}

Deno.test("works with numbers", async () => {
  let counter = 0;

  const fn = async (a: number, b: number) => {
    counter++;
    return a + b;
  };

  const memoFn = kvMemoize(db, ["numbers"], fn);

  assertObjectMatch(await db.get(["numbers", 1, 2]), { versionstamp: null });
  assertEquals(await memoFn(1, 2), 3);
  assertEquals(counter, 1);
  assertObjectMatch(await db.get(["numbers", 1, 2]), { value: 3 });

  assertObjectMatch(await db.get(["numbers", 2, 1]), { versionstamp: null });
  assertEquals(await memoFn(2, 1), 3);
  assertEquals(counter, 2);
  assertObjectMatch(await db.get(["numbers", 2, 1]), { value: 3 });

  assertEquals(await memoFn(1, 2), 3);
  assertEquals(counter, 2);
});

Deno.test("works with strings", async () => {
  let counter = 0;

  const fn = async (a: string, b: string) => {
    counter++;
    return a + b;
  };

  const memoFn = kvMemoize(db, ["strings"], fn);

  assertObjectMatch(await db.get(["strings", "a", "b"]), {
    versionstamp: null,
  });
  assertEquals(await memoFn("a", "b"), "ab");
  assertEquals(counter, 1);
  assertObjectMatch(await db.get(["strings", "a", "b"]), { value: "ab" });

  assertObjectMatch(await db.get(["strings", "b", "a"]), {
    versionstamp: null,
  });
  assertEquals(await memoFn("b", "a"), "ba");
  assertEquals(counter, 2);
  assertObjectMatch(await db.get(["strings", "b", "a"]), { value: "ba" });

  assertEquals(await memoFn("a", "b"), "ab");
  assertEquals(counter, 2);
});

Deno.test("works with booleans", async () => {
  let counter = 0;

  const fn = async (a: boolean, b: boolean) => {
    counter++;
    return a && b;
  };

  const memoFn = kvMemoize(db, ["booleans"], fn);

  assertObjectMatch(await db.get(["booleans", true, true]), {
    versionstamp: null,
  });
  assertEquals(await memoFn(true, true), true);
  assertEquals(counter, 1);
  assertObjectMatch(await db.get(["booleans", true, true]), { value: true });

  assertObjectMatch(await db.get(["booleans", true, false]), {
    versionstamp: null,
  });
  assertEquals(await memoFn(true, false), false);
  assertEquals(counter, 2);
  assertObjectMatch(await db.get(["booleans", true, false]), { value: false });

  assertEquals(await memoFn(true, true), true);
  assertEquals(counter, 2);
});

Deno.test("works with variadic arguments", async () => {
  let counter = 0;

  const fn = async (...args: (string | number)[]) => {
    counter++;
    return args.join(" ");
  };

  const memoFn = kvMemoize(db, ["variadic"], fn);

  assertEquals(await memoFn("a", "b"), "a b");
  assertEquals(counter, 1);
  assertObjectMatch(await db.get(["variadic", "a", "b"]), { value: "a b" });

  assertEquals(await memoFn(1, 2, 3), "1 2 3");
  assertEquals(counter, 2);
  assertObjectMatch(await db.get(["variadic", 1, 2, 3]), { value: "1 2 3" });

  assertEquals(await memoFn("a", "b", 1, 2), "a b 1 2");
  assertEquals(counter, 3);
  assertObjectMatch(await db.get(["variadic", "a", "b", 1, 2]), {
    value: "a b 1 2",
  });

  assertEquals(await memoFn("a", "b"), "a b");
  assertEquals(counter, 3);

  assertEquals(await memoFn(1, 2, 3), "1 2 3");
  assertEquals(counter, 3);
});

Deno.test("never caches nullish results", async () => {
  let counter = 0;

  const fn = async (test: boolean, value: string) => {
    counter++;
    if (test) {
      return value;
    }
  };

  const memoFn = kvMemoize(db, ["nullishCache"], fn);

  assertEquals(await memoFn(true, "test"), "test");
  assertEquals(counter, 1);

  assertEquals(await memoFn(true, "test"), "test");
  assertEquals(counter, 1);

  assertEquals(await memoFn(false, "test"), undefined);
  assertEquals(counter, 2);

  assertEquals(await memoFn(false, "test"), undefined);
  assertEquals(counter, 3);
});

Deno.test("always recalculates nullish results", async () => {
  let counter = 0;

  const fn = async (test: boolean, value: number) => {
    counter++;
    return test ? value : null;
  };

  const memoFn = kvMemoize(db, ["nullishRecalculate"], fn);

  await db.set(["nullishRecalculate", true, 1], null);

  assertEquals(await memoFn(true, 1), 1);
  assertEquals(counter, 1);

  assertEquals(await memoFn(true, 1), 1);
  assertEquals(counter, 1);

  assertEquals(await memoFn(false, 1), null);
  assertEquals(counter, 2);
});

Deno.test("works with custom shouldCache", async () => {
  let counter = 0;

  const fn = async (a: string, b: string) => {
    counter++;
    return a + b;
  };

  const memoFn = kvMemoize(db, ["cache"], fn, {
    shouldCache: (result, _a, _b) => result !== "",
  });

  assertEquals(await memoFn("a", "b"), "ab");
  assertEquals(counter, 1);

  assertEquals(await memoFn("", ""), "");
  assertEquals(counter, 2);

  assertEquals(await memoFn("a", "b"), "ab");
  assertEquals(counter, 2);

  assertEquals(await memoFn("", ""), "");
  assertEquals(counter, 3);
});

Deno.test("works with custom shouldRecalculate", async () => {
  let counter = 0;

  const fn = async (a: number, b: number) => {
    counter++;
    return a + b;
  };

  const memoFn = kvMemoize(db, ["recalculate"], fn, {
    shouldRecalculate: (_result, a, b) => a === 0 || b === 0,
  });

  assertEquals(await memoFn(1, 2), 3);
  assertEquals(counter, 1);

  assertEquals(await memoFn(0, 0), 0);
  assertEquals(counter, 2);

  assertEquals(await memoFn(1, 2), 3);
  assertEquals(counter, 2);

  assertEquals(await memoFn(0, 0), 0);
  assertEquals(counter, 3);
});

Deno.test("works with custom db", async () => {
  let counter = 0;

  const cache = new Map<string, string>();

  const fn = async (a: number, b: string) => {
    counter++;
    return b.repeat(a);
  };

  const memoFn = kvMemoize(db, ["custom"], fn, {
    kv: {
      get: async (_db, key) => cache.get(key.join(":")),
      set: async (_db, key, value) => void cache.set(key.join(":"), value),
    },
  });

  assertEquals(cache.get("custom:1:a"), undefined);
  assertEquals(await memoFn(1, "a"), "a");
  assertEquals(counter, 1);
  assertEquals(cache.get("custom:1:a"), "a");

  assertEquals(cache.get("custom:2:b"), undefined);
  assertEquals(await memoFn(2, "b"), "bb");
  assertEquals(counter, 2);
  assertEquals(cache.get("custom:2:b"), "bb");

  cache.set("custom:3:c", "ccc");
  assertEquals(await memoFn(3, "c"), "ccc");
  assertEquals(counter, 2);
});

Deno.test("works with custom expireIn", async () => {
  let counter = 0;

  const cache = new Map<string, string>();

  const fn = async (a: number, b: string) => {
    counter++;
    return b.repeat(a);
  };

  const memoFn = kvMemoize(db, ["expire"], fn, {
    expireIn: (result, _a, _b) => result.length * 1000,
    kv: {
      get: async (_db, key) => cache.get(key.join(":")),
      set: async (_db, key, value, options) =>
        void cache.set(key.join(":"), `${value}:${options.expireIn}`),
    },
  });

  assertEquals(cache.get("expire:1:a"), undefined);
  assertEquals(await memoFn(1, "a"), "a");
  assertEquals(counter, 1);
  assertEquals(cache.get("expire:1:a"), "a:1000");

  assertEquals(cache.get("expire:2:b"), undefined);
  assertEquals(await memoFn(2, "b"), "bb");
  assertEquals(counter, 2);
  assertEquals(cache.get("expire:2:b"), "bb:2000");
});

Deno.test("never caches on throw", async () => {
  let counter = 0;

  const fn = async (a: number) => {
    counter++;
    if (a === 0) throw new Error("test");
    return a;
  };

  const memoFn = kvMemoize(db, ["throw"], fn);

  assertEquals(await memoFn(1), 1);
  assertEquals(counter, 1);

  assertEquals(await memoFn(-1), -1);
  assertEquals(counter, 2);

  await assertRejects(() => memoFn(0));
  assertEquals(counter, 3);

  await assertRejects(() => memoFn(0));
  assertEquals(counter, 4);
});

Deno.test("returns the same promise for concurrent calls", async () => {
  let counter = 0;
  let getCount = 0;
  let setCount = 0;
  const cache = new Map<string, number>();

  const fn = async (a: number) => {
    counter += a;
    await delay(100);
    if (a <= 0) throw new Error("test");
    return counter;
  };

  const memoFn = kvMemoize(db, ["concurrent"], fn, {
    kv: {
      get: async (_db, key) => {
        getCount++;
        await delay(100);
        return cache.get(key.join(":"));
      },
      set: async (_db, key, value) => {
        setCount++;
        await delay(100);
        cache.set(key.join(":"), value);
      },
    },
  });

  const promises1 = Array.from({ length: 10 }, () => memoFn(1));
  assertEquals(
    await Promise.all(promises1),
    Array.from({ length: 10 }, () => 1),
  );
  assertEquals(counter, 1);
  assertEquals(getCount, 1);
  assertEquals(setCount, 1);

  assertEquals(await memoFn(1), 1);
  assertEquals(getCount, 2);
  assertEquals(setCount, 1);

  const promises2 = Array.from({ length: 10 }, () => memoFn(2));
  assertEquals(
    await Promise.all(promises2),
    Array.from({ length: 10 }, () => 3),
  );
  assertEquals(counter, 3);
  assertEquals(getCount, 3);
  assertEquals(setCount, 2);

  const promises3 = Array.from({ length: 10 }, () => memoFn(-1));
  await assertRejects(() => Promise.all(promises3));
  assertEquals(counter, 2);
  assertEquals(getCount, 4);
  assertEquals(setCount, 2);
});
