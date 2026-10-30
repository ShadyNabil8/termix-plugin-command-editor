import { SquarePen } from "lucide-react";
import { ICON_MARKER } from "./bridge";

/**
 * The plugin's icon. The marker lets the overlay find this plugin's button
 * in the terminal toolbar (see bridge.ts).
 */
export function EditCommandIcon(props: { className?: string }) {
  return <SquarePen {...props} {...{ [ICON_MARKER]: "" }} />;
}
