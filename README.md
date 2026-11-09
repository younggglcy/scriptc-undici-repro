# scriptc undici shim under node_modules

This repository reproduces a scriptc bug: a program that imports `undici` fails to compile when scriptc is installed under a `node_modules` directory, which is how `npm install scriptc` installs it. The same compiler binary compiles the same program when its toolchain packages are copied to a directory without a `node_modules` path segment.

Reproduced with scriptc 0.4.9 on macOS arm64 and Linux x64, and with scriptc 0.4.10 on Linux x64.

## Program

```ts
import { request } from 'undici';
const response = await request(process.argv[2]!);
console.log(response.statusCode);
```

## Run

Install with Node.js 24 or later, then run the three modes:

```console
$ npm install
$ npm run repro      # compiler from node_modules: build fails
$ npm run control    # same binary, toolchain copied to .artifacts/toolchain: build and request pass
$ npm run baseline   # the program under Node: request passes
```

Each mode starts a local HTTP server and expects the program to print `200`. Logs are written to `.artifacts/`. Every build runs with `SCRIPTC_NO_CACHE=1`.

## Result

`npm run repro` with scriptc 0.4.10 fails while compiling the built-in undici implementation:

```text
…/node_modules/@scriptc/cli-linux-x64-gnu/dist/lib/declarations/shims/undici/core/pool.ts:200:27 - error SC1090: extending classes not declared in the program ('PoolBase') is not supported yet
…/node_modules/@scriptc/cli-linux-x64-gnu/dist/lib/declarations/shims/undici/v7.ts:119:1 - error SC1090: the reference to 'installGlobalFetchDispatcher' (a binding form with no lowering) is not supported yet
6 errors.
```

`npm run control` builds the program and prints `200`.
