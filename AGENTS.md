# AGENTS.md

This repo is a [Termix](https://github.com/Termix-SSH/Termix) plugin. These notes are for AI coding tools.

## Read first

Before changing anything, read `node_modules/@termix-ssh/plugin-sdk/PLUGIN-GUIDE.md`. It covers the
manifest, backend, database, frontend, UI, testing, releasing and submitting to the community registry,
and it matches the SDK version installed here. If it is missing, run `npm install`. If it is still missing,
the SDK is older than 1.0.6: run `npm install -D @termix-ssh/plugin-sdk@latest` or read
https://docs.termix.site/develop instead.

If the guide and the SDK's TypeScript types disagree, the types are right.

## Commands

```bash
npm run build        # bundle into dist/
npm test             # run the tests
npm run typecheck    # type check
npm run validate     # check manifest.json, migrations, changelog and docs
npm run pack         # write <id>-<version>.tmxplug
npm run format       # format with Prettier
```

`npx termix-plugin dev --server <url> --key <tmx_...>` installs the plugin on a Termix server with
developer mode on and reinstalls it on every save. Don't start it unless the user asks.

## Layouts and themes

A plugin can also be a layout (`contributes.layouts`, capability `ui:layout`, `app.registerLayout` in the
frontend, shell state from `useShell()`) or add themes (`contributes.themes`, capability `ui:theme`, one CSS
file per theme scoped under `.<id>`). A theme only plugin has no `src/`: just `manifest.json`, `themes/*.css`,
`locales/` and a test that runs `validateThemeCss()`. The guide's "Layouts and themes" section has the rules.

## Done means

- `npm test`, `npm run typecheck`, `npm run validate`, `npm run build` and `npm run format:check` pass
- New UI text is in `locales/en.json`
- `docs/` and the section below still match what the plugin does
- User facing changes are in `CHANGELOG.md` under the version they ship in

## About this plugin

Keep this section current when the plugin changes: what it does, how it is put together, decisions that
aren't obvious from the code, and anything that has bitten you before.

- What it does: opens the command at the prompt of an SSH terminal in a floating CodeMirror editor, and
  puts the edited text back (Insert) or runs it (Run). Frontend only, capability `ui:surface`.
- The SSH Terminal plugin owns the terminals. This plugin fills two of its slots:
  - `terminal.toolbar` button: its action gets a `TerminalSlotApi` with `getBufferText()` and `sessionId()`.
  - `terminal.overlay` component: mounted over every session, gets `send(type, data)` (raw input with
    `send("input", ...)`) and `subscribe()` (non-data server messages, `sessionCreated` carries the id).
  - Neither knows the other, so `src/frontend/bridge.ts` pairs them per session: focus first (a clicked
    toolbar button keeps focus in its own tab, which is what makes split panes work), then session id, then
    the last touched terminal.
- Without a cached buffer the hotkey clicks this plugin's own toolbar button (found by the icon's
  `data-command-editor-icon` marker) so the terminal hands over its slot API. With no toolbar it reads
  xterm's DOM rows (`screen-dom.ts`), which only works because the SSH terminal uses xterm's DOM renderer.
- Opening never types into the session. Insert sends Ctrl+E Ctrl+U (or Esc for PowerShell), then pastes by
  dispatching a synthetic `paste` event on xterm's textarea, the same path as Ctrl+V, so bracketed paste
  keeps multi-line text from running. `terminal.sendToActive` is the fallback.
- Ctrl+Shift+E is taken by Termix (sidebar panel toggle), hence Ctrl+Shift+X. The overlay catches it in the
  capture phase on the tab root, before xterm. Core can't ship an active default keybinding for a plugin
  action; `registerKeybindingDefault` only lists the built-in key.
- The editor window stops key propagation with a native listener, or app shortcuts (Ctrl+Shift+Enter zooms
  a pane) fire too. React's onKeyDown is not enough: Insert/Run unmount the window inside the key event.
- Insert, Run and Esc close the window on a `setTimeout(0)`, after the key event. Closing refocuses xterm,
  and the SSH terminal forwards Ctrl+Shift+Enter it sees to the split view, which zoomed the pane.
- A split moves a terminal into a new pane, so the overlay looks its DOM up from its anchor every time
  (`entry.root` is a getter) and listens on `document`, not on an element captured at mount.
- Newer SSH Terminal versions pass overlays `input` (`getTextToCursor`, `paste`, `isAlternateScreen`,
  `isBracketedPaste`) and mount the overlay slot in the desktop local terminal too. When `input` is there
  it wins over the toolbar pairing and the DOM read (`entry.input` in bridge.ts). Keep the old path: the
  Docker image ships SSH Terminal 1.0.3, which has no `input`. The upstream change is the
  `feat/overlay-terminal-access` branch of Plugin-SSH-Terminal.
