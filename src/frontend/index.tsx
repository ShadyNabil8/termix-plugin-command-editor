import type { ComponentType } from "react";
import { toast } from "sonner";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { createBridge, type TerminalSlotApi } from "./bridge";
import { createEditorOverlay } from "./EditorOverlay";
import { EditCommandIcon } from "./icon";

const OPEN_ACTION = "command-editor.open";

/**
 * Edit the command at the prompt in a real editor, in any SSH terminal.
 *
 * The SSH terminal plugin owns the terminals; this plugin only fills the
 * places it offers: a toolbar button (which hands over the screen buffer) and
 * an overlay mounted over each session (which can type into it and draws the
 * editor window). bridge.ts pairs the two for each session.
 */
export function activate(app: TermixApp): void {
  const bridge = createBridge();
  const openFocused = () => {
    if (!bridge.open({ kind: "focus" })) toast.info(app.t("editor.noTerminal"));
  };

  app.registerAction(OPEN_ACTION, ((slotApi?: TerminalSlotApi) => {
    if (slotApi) bridge.open({ kind: "toolbar", slotApi });
    else openFocused();
  }) as never);
  app.registerSlotContribution("terminal.toolbar", {
    actionId: OPEN_ACTION,
    titleKey: "editor.open",
    icon: EditCommandIcon,
    kind: "button",
  });

  app.registerSlotContribution("terminal.overlay", {
    actionId: "command-editor.overlay",
    titleKey: "editor.title",
    kind: "component",
    component: createEditorOverlay(bridge) as unknown as ComponentType<
      Record<string, unknown>
    >,
  });

  // Bindable in Settings, Keybindings. The terminal hands the key on while
  // it has focus, so the focused terminal is the one to edit.
  app.registerKeybindingAction({
    id: "open",
    titleKey: "keybindings.open",
    scope: "session",
    run: openFocused,
  });
  // Lists the built-in key, which the overlay handles itself.
  app.registerKeybindingDefault({
    id: "default-open",
    combo: {
      key: "x",
      isCode: false,
      ctrl: true,
      alt: false,
      shift: true,
      meta: false,
    },
    descriptionKey: "keybindings.defaultOpen",
  });

  app.registerPaletteEntry({
    id: "open",
    titleKey: "editor.open",
    icon: EditCommandIcon,
    keywords: ["command", "edit", "editor", "multiline", "terminal"],
    scope: "global",
    run: openFocused,
  });
}
