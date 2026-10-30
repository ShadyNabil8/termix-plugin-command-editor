import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSettings, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { useIsMobile } from "@termix-ssh/plugin-sdk/ui";
import type { Bridge, OverlayEntry, TerminalOverlayProps } from "./bridge";
import { captureCommand, learnPrompt } from "./capture";
import { applyCommand, isClearMode } from "./apply";
import { terminalInput } from "./screen-dom";
import { CommandEditorWindow } from "./CommandEditorWindow";

/** Messages that tell the overlay which server session it sits on. */
const SESSION_MESSAGES = new Set(["sessionCreated", "sessionAttached"]);

/** Ctrl+Shift+X, the built-in key. Ctrl+Shift+E is Termix's panel toggle. */
export function isDefaultHotkey(event: KeyboardEvent): boolean {
  return (
    event.ctrlKey &&
    event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    event.code === "KeyX"
  );
}

interface Settings {
  hotkey: boolean;
  clear: ReturnType<typeof readClear>;
  fontSize: number;
  wrapLines: boolean;
}

function readClear(value: unknown) {
  return isClearMode(value) ? value : "readline";
}

function readSettings(values: Record<string, unknown>): Settings {
  const fontSize = Number(values.fontSize);
  return {
    hotkey: values.defaultHotkey !== false,
    clear: readClear(values.clearMode),
    fontSize: Number.isFinite(fontSize) && fontSize >= 8 ? fontSize : 13,
    wrapLines: values.wrapLines !== false,
  };
}

/**
 * Mounted by the SSH terminal over every session (the terminal.overlay
 * slot). Invisible until opened; then draws the editor over its terminal.
 */
export function createEditorOverlay(bridge: Bridge) {
  return function CommandEditorOverlay(props: TerminalOverlayProps) {
    const anchorRef = useRef<HTMLSpanElement>(null);
    const entryRef = useRef<OverlayEntry | null>(null);
    const [container, setContainer] = useState<HTMLElement | null>(null);
    const [openText, setOpenText] = useState<string | null>(null);
    const { t } = useTranslation();
    const tRef = useRef(t);
    tRef.current = t;
    const inputRef = useRef(props.input);
    inputRef.current = props.input;
    const { values } = useSettings("user");
    const settings = readSettings(values);
    const settingsRef = useRef(settings);
    settingsRef.current = settings;
    const mobile = useIsMobile();
    const sendRef = useRef(props.send);
    sendRef.current = props.send;

    // Register with the bridge, keyed on the DOM this terminal owns. The
    // shell moves a terminal into another pane when a split opens, so the
    // DOM around it is looked up each time rather than kept.
    useEffect(() => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const area = () => anchor.parentElement ?? anchor;
      // The terminal area's parent also holds the terminal's toolbar.
      const root = () => area().parentElement ?? area();
      const entry: OverlayEntry = {
        get root() {
          return root();
        },
        get input() {
          return inputRef.current;
        },
        sessionId: null,
        open: (screenText) => {
          // Keys sent now would land in vim or less, not at a prompt.
          if (inputRef.current?.isAlternateScreen()) {
            toast.info(tRef.current("editor.fullScreen"));
            return;
          }
          const { command } = captureCommand(
            screenText ?? "",
            bridge.learnedPrompt(entry),
          );
          setContainer(area());
          setOpenText(command);
        },
      };
      entryRef.current = entry;
      const removeEntry = bridge.addOverlay(entry);

      const inside = (event: Event) =>
        event.target instanceof Node && root().contains(event.target);
      const onFocus = (event: FocusEvent) => {
        if (inside(event)) bridge.touch(entry);
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (!settingsRef.current.hotkey || !isDefaultHotkey(event)) return;
        if (!inside(event)) return;
        if (
          (event.target as Element).closest?.("[data-command-editor-window]")
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        bridge.open({ kind: "overlay", entry });
      };
      document.addEventListener("focusin", onFocus);
      // Capture runs before xterm sees the key.
      document.addEventListener("keydown", onKeyDown, true);
      return () => {
        document.removeEventListener("focusin", onFocus);
        document.removeEventListener("keydown", onKeyDown, true);
        removeEntry();
        entryRef.current = null;
      };
    }, []);

    useEffect(
      () =>
        props.subscribe((message) => {
          const entry = entryRef.current;
          if (!entry) return;
          if (
            SESSION_MESSAGES.has(message.type) &&
            typeof message.sessionId === "string"
          ) {
            entry.sessionId = message.sessionId;
          } else if (message.type === "session_closed") {
            entry.sessionId = null;
            setOpenText(null);
          }
        }),
      [props.subscribe],
    );

    const close = () => {
      setOpenText(null);
      const entry = entryRef.current;
      if (entry) terminalInput(entry.root)?.focus();
    };

    const apply = async (
      text: string,
      options: { run: boolean; replace: boolean },
    ) => {
      const entry = entryRef.current;
      close();
      if (!entry) return;
      await applyCommand({
        root: entry.root,
        sendRaw: (data) => sendRef.current("input", data),
        paste: entry.input?.paste,
        text,
        clear: options.replace
          ? settingsRef.current.clear === "none"
            ? "readline"
            : settingsRef.current.clear
          : "none",
        run: options.run,
      });
      if (!options.run) {
        // Once the line shows prompt + text, the exact prompt is known; the
        // next open then splits the line without guessing.
        window.setTimeout(() => {
          const screen = bridge.readScreen(entry);
          const prompt = screen ? learnPrompt(screen, text) : null;
          if (prompt) bridge.setLearnedPrompt(entry, prompt);
        }, 400);
      }
    };

    return (
      <>
        <span ref={anchorRef} hidden />
        {openText !== null && container && (
          <CommandEditorWindow
            container={container}
            initialText={openText}
            label={props.host?.name}
            fontSize={settings.fontSize}
            wrapLines={settings.wrapLines}
            replaceLine={settings.clear !== "none"}
            bracketedPaste={props.input?.isBracketedPaste() ?? null}
            mobile={mobile}
            onApply={(text, options) => void apply(text, options)}
            onCancel={close}
          />
        )}
      </>
    );
  };
}
