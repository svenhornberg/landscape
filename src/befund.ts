// Ein einzelner Befund der Validierung. Eigene Datei, damit `parse.ts` und
// `validate.ts` sich nicht gegenseitig importieren müssen.

import type { Pos } from "./model.ts";

export type Schwere = "Fehler" | "Warnung";

export interface Befund {
  schwere: Schwere;
  pos: Pos;
  text: string;
}

export function fehler(pos: Pos, text: string): Befund {
  return { schwere: "Fehler", pos, text };
}

export function warnung(pos: Pos, text: string): Befund {
  return { schwere: "Warnung", pos, text };
}
