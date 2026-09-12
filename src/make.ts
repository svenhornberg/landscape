// `bplan make`: baut das Modell und schreibt eine eigenständige HTML-Datei.
//
// Das Frontend kommt als Text-Import herein und gehört damit zum Modulgraphen:
// läuft `bplan` über eine URL, lädt Deno die HTML-Datei mit und legt sie in
// denselben Cache wie den Code. `make` ersetzt darin den Platzhalter durch das
// Modell als JSON. Die entstehende Datei ist per Mail verschickbar und
// funktioniert per Doppelklick ohne Server.

import FRONTEND from "../frontend/index.html" with { type: "text" };

import type { Modell } from "./model.ts";

/** Stelle im Frontend, an die das Modell kommt. */
const PLATZHALTER = "<!--MODEL-->";

/** Setzt das Modell in das Frontend ein. */
export function seite(modell: Modell): string {
  if (!FRONTEND.includes(PLATZHALTER)) {
    throw new Error(`im Frontend fehlt der Platzhalter ${PLATZHALTER}`);
  }
  return FRONTEND.replaceAll(PLATZHALTER, fuerScriptTag(JSON.stringify(modell)));
}

/** Das Frontend, wie `serve` es unverändert ausliefert. */
export function frontend(): string {
  return FRONTEND;
}

/**
 * Ersetzt jedes `<` durch seine JSON-Escape-Form. In der Ausgabe von
 * `JSON.stringify` steht `<` nur innerhalb von Zeichenketten, das Ergebnis
 * bleibt also gültiges JSON. Damit kann keine Anmerkung mit einem
 * schließenden Script-Tag das eingebettete Modell vorzeitig beenden.
 */
function fuerScriptTag(json: string): string {
  return json.replaceAll("<", "\\u003c");
}

export function groesse(bytes: number): string {
  if (bytes < 1024) return `${bytes} Bytes`;
  if (bytes < 1024 * 1024) return `${Math.floor(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Legt fehlende Zwischenverzeichnisse an und schreibt die Datei. */
export function schreibe(ausgabe: string, html: string): number {
  const ordner = ausgabe.replace(/\/+[^/]*$/, "");
  if (ordner !== "" && ordner !== ausgabe) {
    Deno.mkdirSync(ordner, { recursive: true });
  }
  const bytes = new TextEncoder().encode(html);
  Deno.writeFileSync(ausgabe, bytes);
  return bytes.length;
}
