<div align="center">

<h1>Command Editor for Termix</h1>

<p>Edit the command you are typing in a real editor, in any SSH terminal</p>

</div>

<br />

## Overview

Long or multi-line commands are hard to edit at a prompt. Command Editor opens the command you are typing in a floating editor over the [Termix](https://github.com/Termix-SSH/Termix) terminal. You get shell highlighting, search and replace, and multiple cursors, then put the command back at the prompt or run it.

Nothing is installed on the server. It uses your shell's own line-editing keys and a normal paste, so it works the same on every host you reach over SSH.

<br />

## Features

- Opens with **Ctrl+Shift+X**, the terminal toolbar, the command palette, or a key you bind
- **Ctrl+Enter** inserts the edited command at the prompt, **Ctrl+Shift+Enter** runs it, **Esc** cancels
- Multi-line commands go in as one bracketed paste, so they wait for Enter instead of running line by line
- A floating window you can move, resize and maximize, and it remembers its size
- Opening only reads the screen, so cancelling never changes your session
- Settings for the key, how the line is cleared (bash, zsh and fish, or PowerShell), font size and line wrapping

See [docs/index.md](docs/index.md) for the full guide.

<br />

## Install

Download `command-editor-<version>.tmxplug` from the releases, then in Termix open Plugins and choose Install from file. Until the plugin is in the registry, turn on Plugin developer mode in Settings, General first.

Termix 26.10 or newer with the SSH Terminal plugin. The desktop app's local terminal needs an SSH Terminal version that gives plugins access to the prompt.

<br />

## Develop

You need Node 24 and a Termix server you are an admin on (a local Docker one is fine).

```bash
npm install
npm test
npm run typecheck
npm run validate
npm run build
```

To try it live, turn on Plugin developer mode in Settings, General, make an API key under Settings, API keys, then:

```bash
npx termix-plugin dev --server http://localhost:8080 --key tmx_your_key
```

It rebuilds and reinstalls on every save. Reload the page to see frontend changes.

<br />

## License

Apache-2.0
