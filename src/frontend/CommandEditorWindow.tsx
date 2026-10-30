import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import CodeMirror, {
  EditorSelection,
  EditorView,
  Prec,
  keymap,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import {
  StreamLanguage,
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { searchPanelOpen } from "@codemirror/search";
import { Maximize2, Minimize2, Play, CornerDownLeft, X } from "lucide-react";
import { useTheme, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { EditCommandIcon } from "./icon";

export interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Bounds {
  width: number;
  height: number;
}

const STORAGE_KEY = "command-editor:window";
const MARGIN = 8;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 180;

/** Keeps the window inside the terminal area it floats over. */
export function clampGeometry(geometry: Geometry, bounds: Bounds): Geometry {
  const width = Math.max(
    Math.min(MIN_WIDTH, bounds.width - MARGIN * 2),
    Math.min(geometry.width, bounds.width - MARGIN * 2),
  );
  const height = Math.max(
    Math.min(MIN_HEIGHT, bounds.height - MARGIN * 2),
    Math.min(geometry.height, bounds.height - MARGIN * 2),
  );
  const x = Math.min(
    Math.max(MARGIN, geometry.x),
    Math.max(MARGIN, bounds.width - width - MARGIN),
  );
  const y = Math.min(
    Math.max(MARGIN, geometry.y),
    Math.max(MARGIN, bounds.height - height - MARGIN),
  );
  return { x, y, width, height };
}

function defaultGeometry(bounds: Bounds): Geometry {
  const width = Math.min(760, bounds.width - MARGIN * 2);
  const height = Math.min(340, bounds.height - MARGIN * 2);
  return {
    width,
    height,
    x: (bounds.width - width) / 2,
    y: Math.max(MARGIN, bounds.height - height - MARGIN * 4),
  };
}

function loadGeometry(bounds: Bounds): Geometry {
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as Geometry | null;
    if (
      saved &&
      [saved.x, saved.y, saved.width, saved.height].every(Number.isFinite)
    ) {
      return clampGeometry(saved, bounds);
    }
  } catch {
    // Storage blocked or bad JSON: start from the default.
  }
  return clampGeometry(defaultGeometry(bounds), bounds);
}

function saveGeometry(geometry: Geometry): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(geometry));
  } catch {
    // Not remembering the size is fine.
  }
}

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

export interface CommandEditorWindowProps {
  /** The terminal area the window floats over. */
  container: HTMLElement;
  initialText: string;
  /** Shown in the title bar, e.g. the host name. */
  label?: string;
  fontSize: number;
  wrapLines: boolean;
  /** Clear the prompt's current text before inserting (the default). */
  replaceLine: boolean;
  /** Whether the shell takes a multi-line paste whole; null when unknown. */
  bracketedPaste: boolean | null;
  mobile: boolean;
  onApply: (text: string, options: { run: boolean; replace: boolean }) => void;
  onCancel: () => void;
}

export function CommandEditorWindow({
  container,
  initialText,
  label,
  fontSize,
  wrapLines,
  replaceLine,
  bracketedPaste,
  mobile,
  onApply,
  onCancel,
}: CommandEditorWindowProps) {
  const { t } = useTranslation();
  const dark = useTheme().theme === "dark";
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const [text, setText] = useState(initialText);
  const [replace, setReplace] = useState(replaceLine);
  const [maximized, setMaximized] = useState(false);
  const bounds = (): Bounds => ({
    width: container.clientWidth,
    height: container.clientHeight,
  });
  const [geometry, setGeometry] = useState<Geometry>(() =>
    loadGeometry(bounds()),
  );

  // The latest state for the editor's key handlers, built once.
  const latest = useRef({ text, replace, onApply, onCancel });
  latest.current = { text, replace, onApply, onCancel };

  const apply = (run: boolean) =>
    latest.current.onApply(latest.current.text, {
      run,
      replace: latest.current.replace,
    });

  // From a key, close only once the key event is over. Closing gives focus
  // back to the terminal, and the rest of the key (Ctrl+Shift+Enter) would
  // then reach it and the app: the terminal forwards that one to the split
  // view, which zooms the pane.
  const afterKey = (action: () => void) => {
    window.setTimeout(action, 0);
    return true;
  };

  // Follow the terminal when it resizes, so the window never ends up outside.
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setGeometry((current) => clampGeometry(current, bounds())),
    );
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container]);

  // Take the keyboard from the terminal, cursor at the end where the user
  // stopped typing. Focus again on the next frame: the key or click that
  // opened the editor may still hand focus back to xterm after this.
  const onCreateEditor = (view: EditorView) => {
    view.dispatch({
      selection: EditorSelection.cursor(view.state.doc.length),
    });
    view.focus();
    window.requestAnimationFrame(() => view.focus());
  };

  const extensions = useMemo(
    () => [
      StreamLanguage.define(shell),
      // Only syntax colours: the window takes Termix's own background.
      syntaxHighlighting(dark ? oneDarkHighlightStyle : defaultHighlightStyle),
      ...(wrapLines ? [EditorView.lineWrapping] : []),
      Prec.highest(
        keymap.of([
          { key: "Mod-Enter", run: () => afterKey(() => apply(false)) },
          { key: "Shift-Mod-Enter", run: () => afterKey(() => apply(true)) },
          {
            key: "Escape",
            // Esc closes the search panel first, then the editor.
            run: (view) => {
              if (searchPanelOpen(view.state)) return false;
              return afterKey(() => latest.current.onCancel());
            },
          },
        ]),
      ),
      EditorView.theme(
        {
          "&": {
            height: "100%",
            fontSize: `${fontSize}px`,
            backgroundColor: "transparent",
          },
          "&.cm-focused": { outline: "none" },
          ".cm-content": { caretColor: "currentColor" },
          "&.cm-focused .cm-cursor": { borderLeftColor: "currentColor" },
          ".cm-activeLine, .cm-activeLineGutter": {
            backgroundColor: "rgba(127,127,127,.08)",
          },
          ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, ::selection":
            { backgroundColor: "rgba(127,127,127,.35)" },
          ".cm-gutterElement": { color: "rgba(127,127,127,.8)" },
          ".cm-panels": {
            backgroundColor: "transparent",
            color: "inherit",
          },
          ".cm-scroller": {
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
            lineHeight: "1.5",
          },
          ".cm-gutters": {
            backgroundColor: "transparent",
            borderRight: "1px solid var(--border, rgba(127,127,127,.25))",
          },
        },
        { dark },
      ),
    ],
    // apply and onCancel read `latest`, so the editor is configured once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wrapLines, fontSize, dark],
  );

  const startDrag = (
    event: ReactPointerEvent<HTMLElement>,
    mode: "move" | "resize",
  ) => {
    if (maximized || mobile || event.button !== 0) return;
    if ((event.target as Element).closest("button") && mode === "move") return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const start = { x: event.clientX, y: event.clientY, geometry };
    const move = (moved: PointerEvent) => {
      const dx = moved.clientX - start.x;
      const dy = moved.clientY - start.y;
      const next =
        mode === "move"
          ? {
              ...start.geometry,
              x: start.geometry.x + dx,
              y: start.geometry.y + dy,
            }
          : {
              ...start.geometry,
              width: start.geometry.width + dx,
              height: start.geometry.height + dy,
            };
      setGeometry(clampGeometry(next, bounds()));
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setGeometry((current) => {
        saveGeometry(current);
        return current;
      });
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  // Keys typed here belong to the editor. Without this the app's own
  // shortcuts (Ctrl+Shift+Enter zooms a pane, Alt+1 switches tabs) would also
  // fire, since this window sits inside the terminal's tab. A native
  // listener, not React's: Insert and Run close the window inside the key
  // event, and React drops events for a component that is gone, so the
  // key would reach the app's handlers after all.
  const windowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = windowRef.current;
    if (!element) return;
    const keep = (event: Event) => event.stopPropagation();
    const types = ["keydown", "keyup", "keypress"] as const;
    for (const type of types) element.addEventListener(type, keep);
    return () => {
      for (const type of types) element.removeEventListener(type, keep);
    };
  }, []);

  const lineCount = text === "" ? 0 : text.split("\n").length;
  const multiline = text.includes("\n");
  const style = mobile
    ? { left: 0, right: 0, bottom: 0, height: "60%" }
    : maximized
      ? { left: MARGIN, top: MARGIN, right: MARGIN, bottom: MARGIN }
      : {
          left: geometry.x,
          top: geometry.y,
          width: geometry.width,
          height: geometry.height,
        };

  return (
    <div
      ref={windowRef}
      role="dialog"
      aria-modal="false"
      aria-label={t("editor.title")}
      data-command-editor-window=""
      className="absolute flex flex-col border border-border bg-background text-foreground"
      style={{ ...style, zIndex: 60 }}
    >
      <div
        className="flex h-7 shrink-0 select-none items-center gap-2 border-b border-border bg-sidebar px-2 text-xs"
        style={{ cursor: maximized || mobile ? "default" : "move" }}
        onPointerDown={(event) => startDrag(event, "move")}
        onDoubleClick={() => !mobile && setMaximized((value) => !value)}
      >
        <EditCommandIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium">{t("editor.title")}</span>
        {label && (
          <span className="truncate text-muted-foreground">{label}</span>
        )}
        <span className="flex-1" />
        {!mobile && (
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground"
            title={t(maximized ? "editor.restore" : "editor.maximize")}
            aria-label={t(maximized ? "editor.restore" : "editor.maximize")}
            onClick={() => setMaximized((value) => !value)}
          >
            {maximized ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
          </button>
        )}
        <button
          type="button"
          className="p-1 text-muted-foreground hover:text-foreground"
          title={`${t("editor.cancel")} (Esc)`}
          aria-label={t("editor.cancel")}
          onClick={onCancel}
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <CodeMirror
          ref={editorRef}
          value={initialText}
          height="100%"
          className="h-full"
          theme="none"
          basicSetup={{
            autocompletion: false,
            foldGutter: false,
            highlightActiveLineGutter: true,
          }}
          extensions={extensions}
          onCreateEditor={onCreateEditor}
          onChange={setText}
          aria-label={t("editor.title")}
        />
      </div>

      {multiline && bracketedPaste !== true && (
        <p
          className={`shrink-0 border-t border-border px-2 py-1 text-[11px] ${
            bracketedPaste === false
              ? "text-destructive"
              : "text-muted-foreground"
          }`}
        >
          {t(
            bracketedPaste === false
              ? "editor.multilineRuns"
              : "editor.multilineHint",
          )}
        </p>
      )}

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-2 py-1.5 text-xs">
        <label className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
          <input
            type="checkbox"
            checked={replace}
            onChange={(event) => setReplace(event.target.checked)}
          />
          {t("editor.replaceLine")}
        </label>
        <span className="text-muted-foreground">
          {t("editor.stats", { lines: lineCount, chars: text.length })}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          className="border border-border px-2 py-1 hover:bg-muted"
          onClick={onCancel}
        >
          {t("editor.cancel")}
        </button>
        <button
          type="button"
          className="flex items-center gap-1 border border-border px-2 py-1 hover:bg-muted"
          title={`${MOD}+Enter`}
          onClick={() => apply(false)}
        >
          <CornerDownLeft className="size-3.5" />
          {t("editor.insert")}
          {!mobile && (
            <kbd className="ml-1 text-[10px] text-muted-foreground">
              {MOD}+Enter
            </kbd>
          )}
        </button>
        <button
          type="button"
          className="flex items-center gap-1 border border-accent-brand px-2 py-1 text-accent-brand hover:bg-muted"
          title={`${MOD}+Shift+Enter`}
          onClick={() => apply(true)}
        >
          <Play className="size-3.5" />
          {t("editor.run")}
          {!mobile && (
            <kbd className="ml-1 text-[10px] text-muted-foreground">
              {MOD}+Shift+Enter
            </kbd>
          )}
        </button>
      </div>

      {!mobile && !maximized && (
        <div
          aria-hidden="true"
          className="absolute bottom-0 right-0 size-3"
          style={{ cursor: "nwse-resize" }}
          onPointerDown={(event) => startDrag(event, "resize")}
        />
      )}
    </div>
  );
}
