import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBridge,
  ICON_MARKER,
  type OverlayEntry,
  type TerminalSlotApi,
} from "../../src/frontend/bridge";
import { readScreenFromDom } from "../../src/frontend/screen-dom";

/** A terminal tab as the SSH terminal lays it out. */
function terminalTab(options: { toolbarButton?: boolean } = {}) {
  const root = document.createElement("div");
  root.innerHTML = `
    ${options.toolbarButton ? `<div data-terminal-toolbar><button type="button"><svg ${ICON_MARKER}=""></svg></button></div>` : ""}
    <div class="area">
      <div class="xterm">
        <textarea class="xterm-helper-textarea"></textarea>
        <div class="xterm-rows">
          <div>user@h:~$&nbsp;ls</div>
          <div>file</div>
          <div>user@h:~$&nbsp;echo&nbsp;dom<span class="xterm-cursor"> </span></div>
          <div></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);
  return root;
}

function entryFor(root: HTMLElement, sessionId: string | null = null) {
  const open = vi.fn<(screenText: string | null) => void>();
  const entry: OverlayEntry & { open: typeof open } = { root, sessionId, open };
  return entry;
}

function slotApi(sessionId: string, text: string): TerminalSlotApi {
  return {
    getBufferText: () => text,
    sessionId: () => sessionId,
    runCommand: vi.fn(),
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("bridge", () => {
  it("opens over the tab that holds focus when the toolbar is clicked", () => {
    const bridge = createBridge();
    const left = entryFor(terminalTab(), "s1");
    const right = entryFor(terminalTab(), "s2");
    bridge.addOverlay(left);
    bridge.addOverlay(right);
    right.root.querySelector<HTMLElement>("textarea")!.focus();

    // Even with a session id that points elsewhere (a pane that moved and
    // has not heard its id again), focus decides, and the clicked toolbar's
    // buffer is that tab's.
    expect(
      bridge.open({ kind: "toolbar", slotApi: slotApi("s1", "user@h:~$ x") }),
    ).toBe(true);
    expect(right.open).toHaveBeenCalledWith("user@h:~$ x");
    expect(left.open).not.toHaveBeenCalled();
  });

  it("falls back to the session id when focus is elsewhere", () => {
    const bridge = createBridge();
    const one = entryFor(terminalTab(), "s1");
    const two = entryFor(terminalTab(), "s2");
    bridge.addOverlay(one);
    bridge.addOverlay(two);
    bridge.open({
      kind: "toolbar",
      slotApi: slotApi("s2", "user@h:~$ from buffer"),
    });
    expect(two.open).toHaveBeenCalledWith("user@h:~$ from buffer");
  });

  it("reads the screen when the shared buffer comes back empty", () => {
    const bridge = createBridge();
    const entry = entryFor(terminalTab(), "s1");
    bridge.addOverlay(entry);
    bridge.open({ kind: "toolbar", slotApi: slotApi("s1", "") });
    expect(entry.open).toHaveBeenCalledWith(
      expect.stringContaining("echo dom"),
    );
  });

  it("reads the buffer the toolbar shared on later opens", () => {
    const bridge = createBridge();
    const entry = entryFor(terminalTab(), "s1");
    bridge.addOverlay(entry);
    bridge.open({
      kind: "toolbar",
      slotApi: slotApi("s1", "user@h:~$ buffered"),
    });
    entry.open.mockClear();
    bridge.open({ kind: "overlay", entry });
    expect(entry.open).toHaveBeenCalledWith("user@h:~$ buffered");
  });

  it("presses its own toolbar button when it has no buffer yet", () => {
    const bridge = createBridge();
    const root = terminalTab({ toolbarButton: true });
    const entry = entryFor(root, "s1");
    bridge.addOverlay(entry);
    const click = vi.fn();
    root.querySelector("button")!.addEventListener("click", click);
    bridge.open({ kind: "overlay", entry });
    expect(click).toHaveBeenCalledOnce();
    expect(entry.open).not.toHaveBeenCalled();
  });

  it("reads the screen from the DOM when there is no toolbar", () => {
    const bridge = createBridge();
    const entry = entryFor(terminalTab(), "s1");
    bridge.addOverlay(entry);
    bridge.open({ kind: "overlay", entry });
    expect(entry.open).toHaveBeenCalledWith(
      "user@h:~$ ls\nfile\nuser@h:~$ echo dom",
    );
  });

  it("uses the last touched terminal for the palette, and nothing when gone", () => {
    const bridge = createBridge();
    const one = entryFor(terminalTab());
    const two = entryFor(terminalTab());
    const removeOne = bridge.addOverlay(one);
    bridge.addOverlay(two);
    bridge.touch(one);
    bridge.open({ kind: "focus" });
    expect(one.open).toHaveBeenCalled();

    removeOne();
    bridge.touch(two);
    expect(bridge.open({ kind: "focus" })).toBe(true);
    expect(two.open).toHaveBeenCalled();
  });

  it("reports no terminal when none is mounted", () => {
    expect(createBridge().open({ kind: "focus" })).toBe(false);
  });

  it("keeps a learned prompt per terminal", () => {
    const bridge = createBridge();
    const entry = entryFor(terminalTab());
    bridge.setLearnedPrompt(entry, "user@h:~$ ");
    expect(bridge.learnedPrompt(entry)).toBe("user@h:~$ ");
    expect(bridge.learnedPrompt(entryFor(terminalTab()))).toBeNull();
  });
});

describe("readScreenFromDom", () => {
  it("returns null without a terminal", () => {
    expect(readScreenFromDom(document.createElement("div"))).toBeNull();
  });
});
