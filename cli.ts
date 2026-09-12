// bplan - Bebauungsplan (Aufgabe x Abteilung -> System) aus versionierten
// Textdateien. Siehe SPEC.md.
//
// Läuft ohne Installation direkt aus dem öffentlichen Repo:
//
//   deno run --allow-read --allow-write \
//     https://raw.githubusercontent.com/svenhornberg/landscape/v0.2.0/cli.ts \
//     validate .

import {
  anzahlFehler,
  anzahlWarnungen,
  type Befund,
  type Ergebnis,
  hatFehler,
  istLeer,
  pruefe,
} from "./src/validate.ts";
import { posText } from "./src/model.ts";
import { groesse, schreibe, seite } from "./src/make.ts";
import { starte } from "./src/serve.ts";

const HILFE = `bplan - Bebauungsplan aus versionierten Textdateien

  bplan validate [PFAD]                     prüft die Datendateien, Exit 0 oder 1
  bplan make     [PFAD] [-o DATEI]          erzeugt eine eigenständige HTML-Datei
  bplan serve    [PFAD] [--port N] [--open] lokaler Webserver auf 127.0.0.1

PFAD ist das Verzeichnis mit data/, Vorgabe ist das aktuelle Verzeichnis.
Vorgabe für -o ist bebauungsplan.html.`;

if (import.meta.main) {
  Deno.exit(haupt(Deno.args));
}

export function haupt(args: string[]): number {
  const kommando = args[0];
  if (kommando === undefined || kommando === "--help" || kommando === "-h") {
    console.log(HILFE);
    return kommando === undefined ? 1 : 0;
  }

  const rest = args.slice(1);
  switch (kommando) {
    case "validate": {
      const ergebnis = pruefe(pfadAus(rest));
      zeige(ergebnis);
      return hatFehler(ergebnis) ? 1 : 0;
    }
    case "make": {
      const ausgabe = wert(rest, "-o", "--output") ?? "bebauungsplan.html";
      return baue(pfadAus(rest), ausgabe);
    }
    case "serve": {
      const port = Number(wert(rest, "--port") ?? 8080);
      return starte(pfadAus(rest), port, rest.includes("--open"));
    }
    default:
      console.error(`bplan: unbekanntes Kommando "${kommando}"\n`);
      console.error(HILFE);
      return 1;
  }
}

/** Erstes Argument, das keine Option und kein Optionswert ist. */
function pfadAus(rest: string[]): string {
  const mitWert = new Set(["-o", "--output", "--port"]);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (mitWert.has(a)) {
      i++;
      continue;
    }
    if (a.startsWith("-")) continue;
    return a;
  }
  return ".";
}

/** Wert einer Option, als `--name wert` oder `--name=wert`. */
function wert(rest: string[], ...namen: string[]): string | null {
  for (let i = 0; i < rest.length; i++) {
    for (const name of namen) {
      if (rest[i] === name) return rest[i + 1] ?? null;
      if (rest[i].startsWith(`${name}=`)) return rest[i].slice(name.length + 1);
    }
  }
  return null;
}

function baue(wurzel: string, ausgabe: string): number {
  const ergebnis = pruefe(wurzel);
  zeige(ergebnis);
  if (hatFehler(ergebnis)) {
    console.error("bplan make: abgebrochen, erst die Fehler beheben.");
    return 1;
  }

  let bytes: number;
  try {
    bytes = schreibe(ausgabe, seite(ergebnis.modell));
  } catch (grund) {
    const text = grund instanceof Error ? grund.message : String(grund);
    console.error(`bplan make: ${ausgabe} laesst sich nicht schreiben: ${text}`);
    return 1;
  }

  console.log(`${ausgabe} geschrieben, ${groesse(bytes)}`);
  return 0;
}

/**
 * Gibt Befunde und Zusammenfassung aus, im Format aus SPEC.md:
 *
 *     data/zuordnungen/geschaeftskunden.md:14  Fehler   System "shopsystem" unbekannt (meintest du "shop"?)
 *     3 Dateien, 212 Zuordnungen, 2 Fehler, 1 Warnung
 */
export function zeige(ergebnis: Ergebnis): void {
  const farbig = Deno.stdout.isTerminal() && !Deno.noColor;
  const breite = ergebnis.befunde.reduce(
    (max, b) => Math.max(max, [...posText(b.pos)].length),
    0,
  );

  for (const befund of ergebnis.befunde) {
    const ort = posText(befund.pos);
    const fuellung = " ".repeat(Math.max(0, breite - [...ort].length));
    console.log(`${ort}${fuellung}  ${schwereWort(befund, farbig)}  ${befund.text}`);
  }

  console.log([
    anzahl(ergebnis.dateien, "Datei", "Dateien"),
    anzahl(ergebnis.zuordnungen, "Zuordnung", "Zuordnungen"),
    anzahl(anzahlFehler(ergebnis), "Fehler", "Fehler"),
    anzahl(anzahlWarnungen(ergebnis), "Warnung", "Warnungen"),
  ].join(", "));

  if (istLeer(ergebnis)) {
    console.log(
      "Noch keine Daten unter data/. Erwartet werden systeme.yaml, " +
        "organisation.yaml, aufgaben.yaml und zuordnungen/<geschaeftsfeld>.md, " +
        "siehe SPEC.md.",
    );
  }
}

function schwereWort(befund: Befund, farbig: boolean): string {
  const wort = befund.schwere.padEnd(7);
  if (!farbig) return wort;
  const farbe = befund.schwere === "Fehler" ? "\x1b[31m" : "\x1b[33m";
  return `${farbe}${wort}\x1b[0m`;
}

function anzahl(n: number, einzahl: string, mehrzahl: string): string {
  return `${n} ${n === 1 ? einzahl : mehrzahl}`;
}
