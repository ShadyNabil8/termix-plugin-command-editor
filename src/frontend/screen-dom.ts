/**
 * Reads the visible terminal rows from xterm's DOM renderer, down to the row
 * the cursor is on. Only a fallback for when the terminal has not handed this
 * plugin its buffer yet (its toolbar is hidden): wrapped lines show as
 * separate rows here, and only the visible screen is there.
 */
export function readScreenFromDom(root: Element | null): string | null {
  const rows = root?.querySelector(".xterm-rows");
  if (!rows) return null;
  const lines: string[] = [];
  for (const row of Array.from(rows.children)) {
    lines.push((row.textContent ?? "").replace(/ /g, " ").trimEnd());
    // Anything below the cursor is not part of the command line.
    if (row.querySelector(".xterm-cursor")) break;
  }
  return lines.join("\n");
}

/** The xterm input element, to give focus back after the editor closes. */
export function terminalInput(root: Element | null): HTMLElement | null {
  return root?.querySelector<HTMLElement>(".xterm-helper-textarea") ?? null;
}
