import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

/**
 * Nothing runs on the server: the editor lives in the browser and talks to
 * the shell through the SSH terminal's own session. Termix needs a backend
 * entry for every plugin, so this is it.
 */
export function activate(_ctx: PluginContext): void {}
