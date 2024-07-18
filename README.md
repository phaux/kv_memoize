# Deno KvMemoize

[![deno doc](https://doc.deno.land/badge.svg)](https://deno.land/x/kv_memoize/mod.ts?s=kvMemoize)

This library provides a utility function for memoization using Deno KV.
It allows you to cache the results of expensive function calls and return the cached result when the same inputs occur again.

> [!WARNING]
> 
> Deprecated. Use https://github.com/phaux/mega-memoize

## Example

```ts
import { kvMemoize } from "https://deno.land/x/kv_memoize/mod.ts";

const expensiveFunction = async (a: number, b: number) => {
  console.log("Running expensive function");
  return a + b;
};

const db = await Deno.openKv();

const memoizedFunction = kvMemoize(db, ["expensiveResults"], expensiveFunction);

console.log(await memoizedFunction(1, 2)); // Logs "Running expensive function" and prints 3
console.log(await memoizedFunction(1, 2)); // Prints 3
```
