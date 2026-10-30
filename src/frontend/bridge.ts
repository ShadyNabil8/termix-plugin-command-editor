import { readScreenFromDom } from "./screen-dom";

/**
 * The SSH terminal hands plugins two separate things per session: toolbar
 * actions get a TerminalSlotApi (which can read the buffer), and the overlay
 * slot gets a component mounted over the terminal (which can type raw input
 * and draw the editor). Neither knows about the other, so this pairs them.
 */

/** What the SSH terminal passes a toolbar action (terminal-slots.ts). */
export interface TerminalSlotApi {
  host?: { id?: number | string; name?: string } | null;
  getBufferText: () => string;
  sessionId: () => string | null;
  runCommand: (command: string) => void;
}

/**
 * What newer SSH terminals give an overlay to work at the prompt with
 * (terminal-slots.ts). Older ones leave it out, and the local terminal only
 * exists with it.
 */
export interface TerminalInputAccess {
  getTextToCursor: () => string;
  paste: (text: string) => void;
  isAlternateScreen: () => boolean;
  isBracketedPaste: () => boolean;
}

/** What the SSH terminal passes an overlay component (terminal-slots.ts). */
export interface TerminalOverlayProps {
  host?: { id?: number | string; name?: string } | null;
  subscribe: (
    listener: (message: { type: string; [key: string]: unknown }) => void,
  ) => () => void;
  send: (type: string, data?: unknown) => void;
  input?: TerminalInputAccess;
}

/** One mounted overlay, i.e. one live SSH terminal. */
export interface OverlayEntry {
  /** The tab's root: toolbar plus terminal area. */
  root: HTMLElement;
  sessionId: string | null;
  /** The terminal's own prompt access, when it offers one. */
  input?: TerminalInputAccess;
  /** Opens the editor over this terminal with the screen text it reads. */
  open: (screenText: string | null) => void;
}

/** Where the editor was asked to open from. */
export type OpenSource =
  | { kind: "toolbar"; slotApi: TerminalSlotApi }
  | { kind: "overlay"; entry: OverlayEntry }
  | { kind: "focus" };

export interface Bridge {
  addOverlay: (entry: OverlayEntry) => () => void;
  /** Marks an overlay as the one the user last worked in. */
  touch: (entry: OverlayEntry) => void;
  open: (source: OpenSource) => boolean;
  /** The screen text of a session, when its terminal shared its buffer. */
  readScreen: (entry: OverlayEntry) => string | null;
  learnedPrompt: (entry: OverlayEntry) => string | null;
  setLearnedPrompt: (entry: OverlayEntry, prompt: string) => void;
}

/** Marks this plugin's toolbar icon, so the overlay can find the button. */
export const ICON_MARKER = "data-command-editor-icon";

export function createBridge(doc: Document = document): Bridge {
  const overlays = new Set<OverlayEntry>();
  // Paired on a toolbar click, so the terminal's buffer is known from then on.
  const slotApis = new WeakMap<OverlayEntry, TerminalSlotApi>();
  const prompts = new WeakMap<OverlayEntry, string>();
  let lastTouched: OverlayEntry | null = null;

  const holding = (element: Element | null) =>
    element
      ? ([...overlays].find((entry) => entry.root.contains(element)) ?? null)
      : null;

  const bySession = (sessionId: string | null) =>
    sessionId
      ? ([...overlays].find((entry) => entry.sessionId === sessionId) ?? null)
      : null;

  const focused = () =>
    holding(doc.activeElement) ??
    (lastTouched && overlays.has(lastTouched) ? lastTouched : null) ??
    (overlays.size === 1 ? [...overlays][0] : null);

  const readScreen = (entry: OverlayEntry) => {
    if (entry.input) {
      try {
        return entry.input.getTextToCursor();
      } catch {
        // Fall back to what the toolbar or the DOM can tell.
      }
    }
    const api = slotApis.get(entry);
    if (api) {
      try {
        const text = api.getBufferText();
        if (text) return text;
      } catch {
        // A terminal that went away; fall through to the DOM.
      }
    }
    return readScreenFromDom(entry.root);
  };

  /**
   * Without the buffer, press this plugin's own toolbar button: the terminal
   * then calls the action with its slot API, and the editor opens from there.
   */
  const viaToolbar = (entry: OverlayEntry) => {
    const button = entry.root
      .querySelector(`[data-terminal-toolbar] [${ICON_MARKER}]`)
      ?.closest("button");
    if (!button) return false;
    button.click();
    return true;
  };

  return {
    addOverlay(entry) {
      overlays.add(entry);
      return () => {
        overlays.delete(entry);
        if (lastTouched === entry) lastTouched = null;
      };
    },
    touch(entry) {
      lastTouched = entry;
    },
    open(source) {
      if (source.kind === "toolbar") {
        // A clicked toolbar button keeps focus in its own tab; a split view
        // has one toolbar per pane, so focus is the precise answer.
        const entry =
          holding(doc.activeElement) ??
          bySession(source.slotApi.sessionId()) ??
          focused();
        if (!entry) return false;
        slotApis.set(entry, source.slotApi);
        lastTouched = entry;
        entry.open(readScreen(entry));
        return true;
      }
      const entry = source.kind === "overlay" ? source.entry : focused();
      if (!entry) return false;
      lastTouched = entry;
      if (!entry.input && !slotApis.has(entry) && viaToolbar(entry)) {
        return true;
      }
      entry.open(readScreen(entry));
      return true;
    },
    readScreen,
    learnedPrompt: (entry) => prompts.get(entry) ?? null,
    setLearnedPrompt: (entry, prompt) => prompts.set(entry, prompt),
  };
}
