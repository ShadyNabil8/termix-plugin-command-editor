import { describe, expect, it } from "vitest";
import {
  captureCommand,
  learnPrompt,
  screenLines,
  splitPrompt,
} from "../../src/frontend/capture";

const screen = (...lines: string[]) => lines.join("\n");

describe("splitPrompt", () => {
  it.each([
    ["user@host:~$ ls -la", "user@host:~$ ", "ls -la"],
    [
      "root@box:/etc# systemctl restart nginx",
      "root@box:/etc# ",
      "systemctl restart nginx",
    ],
    ["[me@centos tmp]$ echo hi", "[me@centos tmp]$ ", "echo hi"],
    ["host% git status", "host% ", "git status"],
    ["me@host ~> set -x FOO 1", "me@host ~> ", "set -x FOO 1"],
    ["❯ cargo build", "❯ ", "cargo build"],
    ["λ make", "λ ", "make"],
    ["PS C:\\Users\\me> Get-ChildItem", "PS C:\\Users\\me> ", "Get-ChildItem"],
    ["➜  repo git:(main) ✗ git push", "➜  repo git:(main) ✗ ", "git push"],
    [">>> print(1)", ">>> ", "print(1)"],
  ])("splits %j", (line, prompt, command) => {
    expect(splitPrompt(line)).toEqual({ prompt, command });
  });

  it("keeps > and $ that belong to the command", () => {
    expect(splitPrompt("user@h:~$ echo $HOME > out.txt")).toEqual({
      prompt: "user@h:~$ ",
      command: "echo $HOME > out.txt",
    });
  });

  it("reads a bare prompt as an empty command", () => {
    expect(splitPrompt("user@h:~$")?.command).toBe("");
  });

  it("prefers a learned prompt over the patterns", () => {
    expect(splitPrompt("weird::: do $ thing", "weird::: ")).toEqual({
      prompt: "weird::: ",
      command: "do $ thing",
    });
  });

  it("matches a learned prompt on a bare line without its trailing space", () => {
    expect(splitPrompt("weird:::", "weird::: ")?.command).toBe("");
  });

  it("gives up on a line with no prompt", () => {
    expect(splitPrompt("plain output")).toBeNull();
  });
});

describe("captureCommand", () => {
  it("takes the bottom line's command", () => {
    expect(
      captureCommand(
        screen("total 0", "user@h:~$ ls", "a b", "user@h:~$ vim notes.md"),
      ),
    ).toEqual({ prompt: "user@h:~$ ", command: "vim notes.md" });
  });

  it("ignores blank lines and trailing spaces at the bottom", () => {
    expect(captureCommand("user@h:~$ echo hi   \n\n\n").command).toBe(
      "echo hi",
    );
  });

  it("returns an empty command for an empty screen", () => {
    expect(captureCommand("")).toEqual({ command: "", prompt: null });
  });

  it("takes a multi-line command whole when the learned prompt starts it", () => {
    const text = screen(
      "old output",
      "user@h:~$ for f in *.log; do",
      '  gzip "$f"',
      "done",
    );
    expect(captureCommand(text, "user@h:~$ ")).toEqual({
      prompt: "user@h:~$ ",
      command: 'for f in *.log; do\n  gzip "$f"\ndone',
    });
  });

  it("stops at another prompt instead of walking into old output", () => {
    // Learned at ~, then the user changed directory.
    const text = screen("user@h:~$ cd /tmp", "user@h:/tmp% ", "continued");
    expect(captureCommand(text, "user@h:~$ ").command).toBe("continued");
  });

  it("falls back to the whole bottom line when no prompt is recognised", () => {
    expect(captureCommand("some program output").command).toBe(
      "some program output",
    );
  });
});

describe("learnPrompt", () => {
  it("reads the prompt in front of an inserted line", () => {
    expect(learnPrompt("x\nuser@h:~/src$ git log", "git log")).toBe(
      "user@h:~/src$ ",
    );
  });

  it("does not learn from multi-line text or a mismatch", () => {
    expect(learnPrompt("user@h:~$ a", "a\nb")).toBeNull();
    expect(learnPrompt("user@h:~$ a", "b")).toBeNull();
    expect(learnPrompt("ls", "ls")).toBeNull();
  });
});

describe("screenLines", () => {
  it("drops carriage returns and the blank tail", () => {
    expect(screenLines("a\r\nb  \n\n")).toEqual(["a", "b"]);
  });
});
