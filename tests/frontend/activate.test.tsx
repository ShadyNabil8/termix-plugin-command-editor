import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import {
  renderWithApp,
  type RenderedPluginApp,
} from "@termix-ssh/plugin-sdk/testing";
import type { PluginManifest } from "@termix-ssh/plugin-sdk/manifest";
import * as plugin from "../../src/frontend/index";
import manifestJson from "../../manifest.json";
import locales from "../../locales/en.json";

const manifest = manifestJson as unknown as PluginManifest;

let rendered: RenderedPluginApp | null = null;

afterEach(async () => {
  await rendered?.deactivate();
  rendered = null;
  document.body.innerHTML = "";
});

/**
 * Mounts the overlay the way the SSH terminal does, next to an xterm. The
 * overlay's tab root is the parent of the element the slot renders into.
 */
function mountOverlay(
  app: RenderedPluginApp,
  extra: Record<string, unknown> = {},
) {
  const listeners = new Set<
    (message: { type: string; [key: string]: unknown }) => void
  >();
  const send = vi.fn();
  const subscribe = (listener: (message: { type: string }) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const area = app.renderSlot("terminal.overlay", {
    host: { id: 1, name: "web-1" },
    subscribe,
    send,
    ...extra,
  });
  const xterm = document.createElement("div");
  xterm.className = "xterm";
  xterm.innerHTML = `
    <textarea class="xterm-helper-textarea"></textarea>
    <div class="xterm-rows">
      <div>user@h:~$&nbsp;echo&nbsp;dom<span class="xterm-cursor"> </span></div>
    </div>`;
  area.appendChild(xterm);
  const emit = (message: { type: string; [key: string]: unknown }) =>
    act(() => listeners.forEach((listener) => listener(message)));
  return { area, send, emit };
}

const pressHotkey = (target: Element) =>
  fireEvent.keyDown(target, {
    key: "X",
    code: "KeyX",
    ctrlKey: true,
    shiftKey: true,
  });

describe(`${manifest.id} activate`, () => {
  it("fills the terminal's slots and adds a key and palette entry", async () => {
    rendered = await renderWithApp(plugin, { manifest, locales });
    expect(rendered.registered.slot("terminal.toolbar")).toEqual([
      "command-editor.open",
    ]);
    expect(rendered.registered.slot("terminal.overlay")).toEqual([
      "command-editor.overlay",
    ]);
    expect(rendered.registered.actions()).toContain("command-editor.open");
    expect(rendered.registered.keybindingActions()).toEqual(
      expect.arrayContaining([expect.stringContaining("open")]),
    );
  });

  it("survives disable then enable", async () => {
    rendered = await renderWithApp(plugin, { manifest, locales });
    await rendered.deactivate();
    rendered = await renderWithApp(plugin, { manifest, locales });
    expect(rendered.registered.slot("terminal.toolbar")).toHaveLength(1);
  });
});

describe("overlay", () => {
  it("opens on the hotkey with the typed command, and cancels without typing", async () => {
    rendered = await renderWithApp(plugin, { manifest, locales });
    const { area, send } = mountOverlay(rendered);

    pressHotkey(area.querySelector("textarea")!);
    const dialog = await screen.findByRole("dialog", {
      name: locales.editor.title,
    });
    expect(dialog.textContent).toContain("echo dom");
    expect(dialog.textContent).toContain("web-1");

    fireEvent.click(
      screen.getAllByRole("button", { name: locales.editor.cancel })[0],
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("clears the line, puts the text back and runs it", async () => {
    rendered = await renderWithApp(plugin, { manifest, locales });
    const { area, send, emit } = mountOverlay(rendered);
    emit({ type: "sessionCreated", sessionId: "s1" });

    pressHotkey(area.querySelector("textarea")!);
    await screen.findByRole("dialog");
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(locales.editor.run) }),
    );

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send).toHaveBeenNthCalledWith(1, "input", "\x05\x15");
    expect(send).toHaveBeenNthCalledWith(2, "input", "\r");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes when the session ends", async () => {
    rendered = await renderWithApp(plugin, { manifest, locales });
    const { area, emit } = mountOverlay(rendered);
    pressHotkey(area.querySelector("textarea")!);
    await screen.findByRole("dialog");
    emit({ type: "session_closed" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  describe("with the terminal's input access (local terminal, SSH Terminal 1.3)", () => {
    const access = (overrides: Record<string, unknown> = {}) => ({
      getTextToCursor: vi.fn(() => "PS C:/Users/me> Get-Process"),
      paste: vi.fn(),
      isAlternateScreen: vi.fn(() => false),
      isBracketedPaste: vi.fn(() => true),
      ...overrides,
    });

    it("reads the prompt from the terminal and pastes through it", async () => {
      rendered = await renderWithApp(plugin, { manifest, locales });
      const input = access();
      const { area, send } = mountOverlay(rendered, { host: undefined, input });

      pressHotkey(area.querySelector("textarea")!);
      const dialog = await screen.findByRole("dialog");
      expect(dialog.textContent).toContain("Get-Process");

      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(locales.editor.insert) }),
      );
      await vi.waitFor(() => expect(input.paste).toHaveBeenCalled());
      expect(send).toHaveBeenCalledWith("input", "\x05\x15");
      expect(input.paste).toHaveBeenCalledWith("Get-Process");
    });

    it("stays closed while a full-screen program has the terminal", async () => {
      rendered = await renderWithApp(plugin, { manifest, locales });
      const input = access({ isAlternateScreen: vi.fn(() => true) });
      const { area, send } = mountOverlay(rendered, { input });
      pressHotkey(area.querySelector("textarea")!);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(send).not.toHaveBeenCalled();
    });
  });
});
