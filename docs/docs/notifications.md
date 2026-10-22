---
title: "notifications"
---

# notifications

<p class="tagline">tiny.notify — banners, clicks, buttons and replies</p>

`tiny.notify()` shows a desktop notification: a Notification Center banner on macOS, a toast on Windows, and whatever the desktop's notification service shows on Linux. Clicking it, or one of its buttons, comes back to your app as an event.

The backend has the same call as `app.notify(title, body, opts)`, and hears clicks and buttons through the [`onNotificationClick` and `onNotificationAction` hooks](./backend#hooks).

## showing a notification {#notify}

```js
tiny.notify('Export finished', 'report.pdf is ready', { id: 'export-42', sound: true });
```

`tiny.notify(title, body?, opts?)`:

| option | |
|---|---|
| `id` | your id for this notification, passed back on clicks and button presses. Set it whenever you want to hear back — on Linux nothing is reported without one |
| `subtitle` | a second line under the title (on Linux it's joined to the body) |
| `sound` | `true` plays the notification sound |
| `actions` | buttons and reply fields — see [buttons and replies](#actions) |

It never rejects, so there's no need to `await` it or catch errors. It resolves `true` once the notification has been handed to the OS — whether or not a banner appears, since the user may have turned notifications off for your app. The one exception is `tinyjs dev` on macOS, where it resolves `false` if the fallback banner couldn't be shown.

## clicks {#clicks}

```js
const stop = tiny.app.onNotificationClick((id) => {
  if (id === 'export-42') tiny.app.shell.reveal(exportPath);
});
```

`tiny.app.onNotificationClick(fn)` calls `fn(id)` when a notification is clicked, and returns a function that removes the handler. Clicks are reported for notifications sent with an `id`, except where noted under [each OS](#os).

## buttons and replies {#actions}

```js
tiny.notify('New message', 'from Alex: lunch?', {
  id: 'msg-881',
  actions: [
    { id: 'reply', title: 'Reply', reply: true, placeholder: 'Message…' },
    { id: 'mute', title: 'Mute thread', destructive: true },
  ],
});

tiny.app.onNotificationAction(({ id, action, reply }) => {
  if (action === 'reply') sendReply(id, reply);   // reply: the typed text
  if (action === 'mute') muteThread(id);
});
```

Each action is `{ id, title }` plus:

| field | |
|---|---|
| `reply` | show a text field instead of a plain button; what's typed arrives as `reply` |
| `placeholder` | placeholder text for the field |
| `buttonTitle` | the label of the field's send button, if different from `title` (macOS) |
| `destructive` | show the button in red (macOS) |

`tiny.app.onNotificationAction(fn)` calls `fn({ id, action, reply })`: the notification's `id`, the action's `id`, and the typed text (`''` for a plain button). It returns a function that removes the handler. Clicking the notification itself, rather than a button, calls `onNotificationClick` instead.

Check support before relying on them: `tiny.system.capabilities()` reports `notificationActions` and `notificationReply`.

## on each OS {#os}

| | shown as | clicks | buttons | reply field |
|---|---|:-:|:-:|:-:|
| **macOS, signed** — any real signing identity, including Apple Development | a Notification Center banner with your app's icon | ✓ | ✓ | ✓ |
| **macOS, `tinyjs dev` or ad-hoc signed** | a plain banner shown through AppleScript, credited to Script Editor | — | — | — |
| **Windows** | a toast, or a tray balloon where toasts aren't available | ✓ | ✓ | one per notification |
| **Linux** | the desktop's notification service | with an `id` | with an `id` | — (shows as a plain button, `reply` is `''`) |

Notification Center refuses ad-hoc-signed apps, which is why `tinyjs dev` and a build without a [`signIdentity`](./config#signIdentity) fall back to AppleScript. Test clicks and buttons in a signed build.

## permission (macOS) {#permission}

The first notification from a signed app asks the user for permission. If they've turned notifications off for your app, notifications are dropped without an error. To find out first:

```js
const status = await tiny.app.permissions.check('notifications');
// 'granted', 'denied', 'undetermined' — or 'unsupported' outside a packaged .app
if (status === 'undetermined') await tiny.app.permissions.request('notifications');
```

See [permissions](./permissions). Windows and Linux have no per-app permission for notifications, and answer `'granted'`.

## in the backend {#backend}

```js
export async function init(app) {
  app.notify('Sync complete', '12 files updated', { id: 'sync' });
}

export function onNotificationClick(id, app) {
  if (id === 'sync') app.win.show();
}

export function onNotificationAction({ id, action, reply }, app) {
  // same shape as the page's onNotificationAction
}
```

The page events are also on `tiny.api.on` as `'notification-click'` and `'notification-action'`. The older object form, `app.notify({ title, body, … })`, still works but logs a deprecation warning.

In an [`api`](./config#api) gate the call is `notify`; the `"wrapper"` preset allows it.
