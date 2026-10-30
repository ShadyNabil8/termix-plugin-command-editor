import { invokeAction } from "@termix-ssh/plugin-sdk/frontend";
import { terminalInput } from "./screen-dom";

/** How the line at the prompt is cleared before the edited text goes in. */
export type ClearMode = "readline" | "escape" | "none";

/**
 * The keys that clear the current line.
 *
 * - readline: Ctrl+E (end of line) then Ctrl+U (kill back to the start).
 *   bash, zsh, fish, sh, Python and most REPLs.
 * - escape: Esc, which reverts the line in PowerShell's PSReadLine.
 * - none: insert at the cursor and leave the line as it is.
 */
export function clearKeys(mode: ClearMode): string {
  if (mode === "readline") return "\x05\x15";
  if (mode === "escape") return "\x1b";
  return "";
}

export function isClearMode(value: unknown): value is ClearMode {
  return value === "readline" || value === "escape" || value === "none";
}

/**
 * Pastes text into this terminal the way Ctrl+V does: the terminal turns it
 * into input, wrapped in bracketed paste when the shell asked for it, so a
 * multi-line command lands in the line editor instead of running line by
 * line. True when the terminal took the paste.
 */
export function pasteIntoTerminal(root: Element, text: string): boolean {
  const input = terminalInput(root);
  if (
    !input ||
    typeof DataTransfer === "undefined" ||
    typeof ClipboardEvent === "undefined"
  ) {
    return false;
  }
  try {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    const event = new ClipboardEvent("paste", {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);
    return event.defaultPrevented;
  } catch {
    return false;
  }
}

export interface ApplyOptions {
  root: Element;
  /** Raw input on this session's socket. */
  sendRaw: (data: string) => void;
  /** The terminal's own paste, when it offers one. */
  paste?: (text: string) => void;
  text: string;
  clear: ClearMode;
  run: boolean;
}

/** Puts the edited command at the prompt, and runs it when asked. */
export async function applyCommand({
  root,
  sendRaw,
  paste,
  text,
  clear,
  run,
}: ApplyOptions): Promise<void> {
  const keys = clearKeys(clear);
  if (keys) sendRaw(keys);
  if (text && paste) {
    paste(text);
  } else if (text && !pasteIntoTerminal(root, text)) {
    // The terminal's own action, for the focused session.
    await invokeAction("terminal.sendToActive", text, { run: false });
  }
  if (run) sendRaw("\r");
}
