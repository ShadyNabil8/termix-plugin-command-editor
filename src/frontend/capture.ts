/**
 * Works out the command typed at the prompt from what the terminal shows.
 *
 * Nothing here talks to the shell. Reading the screen is safe in any state
 * (a full-screen app, a password prompt), so the editor can always open and
 * cancel without side effects. The guess is only a prefill the user sees and
 * can fix; replacing the line later uses the shell's own line-editing keys.
 */

/** Characters prompts commonly end with, before the separating space. */
const PROMPT_END = /[$#%>❯➜λ»→](?:\s|$)/u;

/** PowerShell: `PS C:\Users\me> ` (also over SSH to a Windows host). */
const POWERSHELL = /^PS [^>]*>\s?/;

/** oh-my-zsh's robbyrussell theme: `➜  dir git:(main) ✗ `. */
const ROBBYRUSSELL = /^➜\s+\S+\s+(?:git:\([^)]*\)\s+(?:✗\s+)?)?/u;

/** How many screen lines back a multi-line command is looked for. */
const MAX_COMMAND_LINES = 50;

export interface Capture {
  /** The command as the editor should show it. */
  command: string;
  /** The prompt text in front of it, when one was recognised. */
  prompt: string | null;
}

/** The screen text's lines, trailing spaces and blank tail removed. */
export function screenLines(text: string): string[] {
  const lines = text.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) lines[i] = lines[i].trimEnd();
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Splits one screen line into prompt and command. `learned` is the bare
 * prompt seen earlier in this session, which beats any pattern.
 */
export function splitPrompt(
  line: string,
  learned?: string | null,
): Capture | null {
  if (learned && startsWithPrompt(line, learned)) {
    return { prompt: learned, command: dropSeparator(line, learned) };
  }
  const known = POWERSHELL.exec(line) ?? ROBBYRUSSELL.exec(line);
  if (known) {
    return { prompt: known[0], command: line.slice(known[0].length) };
  }
  // The first terminator wins: a command can contain `> ` or `$ ` itself,
  // the prompt in front of it cannot come after it.
  const end = PROMPT_END.exec(line);
  if (!end) return null;
  const promptEnd = end.index + end[0].length;
  return { prompt: line.slice(0, promptEnd), command: line.slice(promptEnd) };
}

/** The screen trims trailing spaces, so a bare prompt loses its last one. */
function startsWithPrompt(line: string, prompt: string): boolean {
  return line.startsWith(prompt) || line === prompt.trimEnd();
}

/** A learned prompt was stored without its trailing space; skip that one. */
function dropSeparator(line: string, prompt: string): string {
  const rest = line.slice(prompt.length);
  return /\s$/.test(prompt) ? rest : rest.replace(/^ /, "");
}

/**
 * The command at the bottom of the screen.
 *
 * A command spanning several lines (pasted earlier, or continued) is taken
 * whole only when the bottom line has no prompt and the nearest prompt above
 * it is the learned one. Any other prompt-looking line stops the search: the
 * prompt may have changed since (a `cd`), and walking further on a guess
 * could pull program output into the editor.
 */
export function captureCommand(
  screenText: string,
  learned?: string | null,
): Capture {
  const lines = screenLines(screenText);
  if (lines.length === 0) return { command: "", prompt: null };
  const last = lines[lines.length - 1];

  const direct = splitPrompt(last, learned);
  if (direct) return direct;

  if (learned) {
    const stop = Math.max(0, lines.length - MAX_COMMAND_LINES);
    for (let i = lines.length - 2; i >= stop; i--) {
      if (startsWithPrompt(lines[i], learned)) {
        const first = dropSeparator(lines[i], learned);
        return {
          prompt: learned,
          command: [first, ...lines.slice(i + 1)].join("\n"),
        };
      }
      if (splitPrompt(lines[i])) break;
    }
  }

  return { command: last, prompt: null };
}

/**
 * After a single line was inserted, the bottom line is prompt + that text,
 * which tells the exact prompt. Null when it cannot be told.
 */
export function learnPrompt(
  screenText: string,
  inserted: string,
): string | null {
  if (!inserted || inserted.includes("\n")) return null;
  const lines = screenLines(screenText);
  const last = lines[lines.length - 1] ?? "";
  const typed = inserted.trimEnd();
  if (!typed || !last.endsWith(typed) || last.length === typed.length) {
    return null;
  }
  const prompt = last.slice(0, last.length - typed.length);
  return prompt.trim() ? prompt : null;
}
