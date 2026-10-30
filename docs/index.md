Command Editor opens the command you are typing in a real editor window, floating over the terminal. Edit long or multi-line commands with a normal text editor, then put the result back at the prompt or run it. It works in every SSH terminal, and in the desktop app's local terminal once SSH Terminal supports it (see Limits), with nothing to install on the server.

## Open the editor

With a command typed (or an empty prompt) in a terminal, do one of these:

- Press **Ctrl+Shift+X**.
- Click **Edit command** in the terminal toolbar.
- Open the command palette and pick **Edit command**.

You can also bind any key to **Edit the current command** in Settings, Keybindings. To use only that key, turn off **Open with Ctrl+Shift+X** in Settings, under Command Editor.

## Edit and send it back

The editor has shell highlighting, line numbers, search and replace (Ctrl+F) and multiple cursors (Alt+click).

| Key              | What it does                                                                   |
| ---------------- | ------------------------------------------------------------------------------ |
| Ctrl+Enter       | **Insert**: replaces the line at the prompt with your text, without running it |
| Ctrl+Shift+Enter | **Run**: replaces the line and presses Enter                                   |
| Esc              | **Cancel**: closes the editor and leaves the prompt as it was                  |

On a Mac use ⌘ instead of Ctrl. Drag the title bar to move the window, drag its bottom right corner to resize it, and double-click the title bar to fill the terminal. The size and place are remembered.

## How it works

Opening the editor only reads the screen, so it never types anything into your session. Command Editor finds the prompt at the bottom of the screen and puts the text after it into the editor. Once you have inserted a command, it knows your exact prompt and splits the next one without guessing.

When you insert or run, it clears the line with your shell's own keys, Ctrl+E then Ctrl+U, and then pastes your text the same way Ctrl+V does. Nothing runs on the server except your shell, so it works the same over SSH, through jump hosts and inside containers.

Multi-line commands go in as one paste. Modern shells (bash 5.1 and newer, zsh, fish) keep them in the line editor until you press Enter. Older shells without bracketed paste run each line as it arrives, and the editor shows a reminder when your text has more than one line.

## Settings

Each user can change these in Settings, under Command Editor:

- **Open with Ctrl+Shift+X**: the built-in key.
- **Replace the line with**: Ctrl+E, Ctrl+U for bash, zsh, fish and most shells and REPLs. Esc for PowerShell. Nothing, to insert at the cursor. The editor's **Replace current line** box turns replacing off for one insert.
- **Editor font size** and **Wrap long lines**.

## Limits

- The desktop app's local terminal and a few extras need a newer SSH Terminal plugin, one that gives plugins access to the prompt. With it, Command Editor reads exactly the line the cursor is on, skips anything drawn below it (like a tmux status bar), stays closed while a full-screen program like vim is open, and warns when a shell would run a multi-line paste line by line. With older versions everything else works the same.
- If your prompt has no `$`, `#`, `%`, `>` or similar at its end, the first guess may include part of the prompt. Fix it in the editor; after the first insert the exact prompt is known.
- With an older SSH Terminal, the editor still opens inside full-screen programs (vim, less), and Insert sends Ctrl+E and Ctrl+U to that program. Close it first.
- Shells that show a grey suggestion after the cursor (fish, zsh-autosuggestions) may include that suggestion in the first guess.
