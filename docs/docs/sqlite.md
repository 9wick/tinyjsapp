---
title: "sqlite"
---

# sqlite

<p class="tagline">SQLite, built in — backend only</p>

SQLite ships in the runtime as `tjs:sqlite`, so an app gets a real database with no packages and nothing to install. It's for the [backend](./backend): the page has no `tjs` (importing a `tjs:*` module there throws `ReferenceError: tjs is not defined`), so query in the backend and hand results to the page through an `api` function.

```js
import { Database } from 'tjs:sqlite';

let db;

export async function init(app) {
  db = new Database((await app.paths()).data + '/notes.db');
  db.exec('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, text TEXT)');
}

export const api = {
  notes: () => db.prepare('SELECT * FROM notes').all(),
  addNote: ({ text }) =>
    db.prepare('INSERT INTO notes (text) VALUES (?) RETURNING id').all(text)[0].id,
};
```

```js
// page
const id = await tiny.api.call('addNote', { text: 'hello' });
const notes = await tiny.api.call('notes');   // [{ id: 1, text: 'hello' }]
```

Expose named operations like these rather than a general `query(sql)`, so the page — or a site the app loads — can't run arbitrary SQL.

## where to keep it {#where}

Put the file in `paths().data`, the app's own data folder:

- macOS: `~/Library/Application Support/<id>`
- Windows: `%APPDATA%\<id>`
- Linux: `~/.local/share/<id>`

`paths()` creates the folder before it answers. The folder is named after the app's [`id`](./config#id), so it survives updates and is separate for each app.

Not a relative path: `'./notes.db'` resolves against the process's working directory. Under `tinyjs dev` that happens to be the project folder, but a built app launched from Finder, the Start menu or a desktop launcher gets another one — often `/`, which isn't writable. And not inside the app: a file in the app bundle is replaced on every update.

For a folder of your own, create it first, and wait for it: `tjs.*` file calls are async, and `new Database()` on a folder that doesn't exist yet fails with "database not initialized".

```js
await tjs.makeDir(dir, { recursive: true });
db = new Database(dir + '/notes.db');
```

## the API {#api}

Calls are synchronous — no `await`.

| | |
|---|---|
| `new Database(path)` | open (or create) a database file; `':memory:'` for a temporary one |
| `db.exec(sql)` | run SQL with no results (`CREATE`, several statements at once) |
| `db.prepare(sql)` | a statement, for running with values |
| `stmt.all(...values)` | run it and return every row, as objects |
| `stmt.run(...values)` | run it, returning nothing |
| `stmt.finalize()` | free a statement you're done with |
| `db.transaction(fn)` | wrap `fn` in a transaction: returns a function that commits when `fn` returns and rolls back if it throws |
| `db.inTransaction` | `true` inside a transaction |
| `db.close()` | close the database |

Values bind by position (`?`) or by name:

```js
db.prepare('SELECT * FROM notes WHERE id = ?').all(1);
db.prepare('SELECT * FROM notes WHERE id = $id').all({ $id: 1 });
```

Wrap many writes in a transaction — it's much faster, and all-or-nothing:

```js
const insert = db.prepare('INSERT INTO notes (text) VALUES (?)');
const importNotes = db.transaction((texts) => {
  for (const t of texts) insert.run(t);
  return texts.length;
});
importNotes(['one', 'two', 'three']);   // 3
```

### coming from better-sqlite3 {#better-sqlite3}

The shape is similar, with fewer methods. A statement has only `all()`, `run()` and `finalize()`:

- no `get()` — use `.all(…)[0]`;
- `run()` returns nothing — for the new row's id, add `RETURNING id` and use `.all(…)[0].id`, or `SELECT last_insert_rowid()`.
