import { afterEach, describe, expect, it, vi } from "vitest";

const invokeAction = vi.fn(async () => true);
vi.mock("@termix-ssh/plugin-sdk/frontend", () => ({ invokeAction }));

const { applyCommand, clearKeys, pasteIntoTerminal } =
  await import("../../src/frontend/apply");

function terminal(onPaste?: (event: ClipboardEvent) => void) {
  const root = document.createElement("div");
  root.innerHTML = `<div class="xterm"><textarea class="xterm-helper-textarea"></textarea></div>`;
  if (onPaste)
    root
      .querySelector(".xterm")!
      .addEventListener("paste", onPaste as EventListener, true);
  document.body.appendChild(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = "";
  invokeAction.mockClear();
});

describe("clearKeys", () => {
  it("sends the shell's line-editing keys", () => {
    expect(clearKeys("readline")).toBe("\x05\x15");
    expect(clearKeys("escape")).toBe("\x1b");
    expect(clearKeys("none")).toBe("");
  });
});

describe("applyCommand", () => {
  it("clears, then falls back to the terminal action, then runs", async () => {
    const order: string[] = [];
    invokeAction.mockImplementationOnce(async (...args: unknown[]) => {
      order.push(`paste:${String(args[1])}`);
      return true;
    });
    await applyCommand({
      root: terminal(),
      sendRaw: (data) => order.push(`raw:${JSON.stringify(data)}`),
      text: "ls -la",
      clear: "readline",
      run: true,
    });
    expect(order).toEqual([
      'raw:"\\u0005\\u0015"',
      "paste:ls -la",
      'raw:"\\r"',
    ]);
    expect(invokeAction).toHaveBeenCalledWith(
      "terminal.sendToActive",
      "ls -la",
      {
        run: false,
      },
    );
  });

  it("inserts at the cursor without clearing or running", async () => {
    const sendRaw = vi.fn();
    await applyCommand({
      root: terminal(),
      sendRaw,
      text: "x",
      clear: "none",
      run: false,
    });
    expect(sendRaw).not.toHaveBeenCalled();
    expect(invokeAction).toHaveBeenCalledOnce();
  });

  it("only clears when the text is empty", async () => {
    const sendRaw = vi.fn();
    await applyCommand({
      root: terminal(),
      sendRaw,
      text: "",
      clear: "readline",
      run: false,
    });
    expect(sendRaw).toHaveBeenCalledWith("\x05\x15");
    expect(invokeAction).not.toHaveBeenCalled();
  });
});

describe("pasteIntoTerminal", () => {
  it("is false when the terminal does not take the paste", () => {
    expect(pasteIntoTerminal(terminal(), "a")).toBe(false);
  });

  it("is false without a terminal input", () => {
    expect(pasteIntoTerminal(document.createElement("div"), "a")).toBe(false);
  });
});
