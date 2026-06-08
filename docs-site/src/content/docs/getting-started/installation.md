---
title: Installation
description: Install @smplcty/db and its pg peer dependency.
---

```sh
pnpm add @smplcty/db pg
pnpm add -D @types/pg
```

Requires **Node ≥ 20** and **`pg` ≥ 8**. `pg` is a
[peer dependency](https://node-postgres.com) — `@smplcty/db` uses
whichever version your service installs.

## Loading environment variables

The library does **not** call `dotenv/config`. Load `.env` at the edge
of your application — for example with Node's built-in flag:

```sh
node --env-file=.env dist/server.js
```

`connect()` and `resolveDatabaseUrl()` read `process.env` at call time,
so make sure your variables are set before the module that calls them is
imported.

Continue to the [Quick start](/simplicity-db/getting-started/quick-start/).
