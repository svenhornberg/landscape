// Einlesen der Datendateien: YAML-Stammdaten, Frontmatter und
// Markdown-Tabellen.
//
// Hier entstehen nur strukturelle Befunde (Datei fehlt, YAML kaputt,
// Frontmatter fehlt, Zeile unvollständig). Alles, was IDs gegeneinander
// prüft, steht in `validate.ts`.
//
// Der Import ist voll qualifiziert und auf eine Version festgelegt. Beim
// Aufruf über eine URL gilt die Import-Map dieses Repos nicht, ein blosses
// "@std/yaml" wäre dort nicht auflösbar.

import { parse as yamlLies } from "jsr:@std/yaml@1.0.10";

import {
  type Abteilung,
  type Aufgabe,
  type Geschaeftsfeld,
  type Objekt,
  type Pos,
  pos,
  type System,
} from "./model.ts";
import { type Befund, fehler } from "./befund.ts";

/**
 * Eine Zuordnungszeile, so wie sie in der Tabelle steht. Die IDs sind noch
 * ungeprüft, `aufgabe` ist der rohe Text (z. B. `angebot.erstellen`).
 */
export interface Rohzeile {
  abteilung: string;
  aufgabe: string;
  system: string;
  anmerkung: string;
  pos: Pos;
}

/** Eine Datei unter `data/zuordnungen/`. */
export interface Zuordnungsdatei {
  /** Wert aus dem Frontmatter, noch ungeprüft. */
  gf: string;
  gfPos: Pos;
  zeilen: Rohzeile[];
}

/** Alles Eingelesene, mit den Fundstellen der Stammdaten-Einträge. */
export interface Rohdaten {
  geschaeftsfelder: Geschaeftsfeld[];
  abteilungen: Abteilung[];
  systeme: System[];
  objekte: Objekt[];
  dateien: Zuordnungsdatei[];

  /** Fundstellen parallel zu den Listen oben. */
  posGeschaeftsfelder: Pos[];
  posAbteilungen: Pos[];
  posSysteme: Pos[];
  posSystemeStatus: Pos[];
  posObjekte: Pos[];
  posObjekteArt: Pos[];
  posAufgaben: Pos[][];
}

function leereRohdaten(): Rohdaten {
  return {
    geschaeftsfelder: [],
    abteilungen: [],
    systeme: [],
    objekte: [],
    dateien: [],
    posGeschaeftsfelder: [],
    posAbteilungen: [],
    posSysteme: [],
    posSystemeStatus: [],
    posObjekte: [],
    posObjekteArt: [],
    posAufgaben: [],
  };
}

/** Anzahl der gelesenen Tabellenzeilen über alle Zuordnungsdateien. */
export function anzahlZuordnungen(roh: Rohdaten): number {
  return roh.dateien.reduce((summe, d) => summe + d.zeilen.length, 0);
}

const SYSTEME = "data/systeme.yaml";
const ORGANISATION = "data/organisation.yaml";
const AUFGABEN = "data/aufgaben.yaml";
const ZUORDNUNGEN = "data/zuordnungen";

/** Liest das Verzeichnis `wurzel` komplett ein. */
export function lies(wurzel: string, befunde: Befund[]): Rohdaten {
  const roh = leereRohdaten();
  const data = `${wurzel}/data`;

  if (!istVerzeichnis(data)) {
    befunde.push(
      fehler(pos("data"), `Verzeichnis "data" nicht gefunden in ${wurzel}`),
    );
    return roh;
  }

  // Ein komplett leeres `data/` ist ein gueltiger Startpunkt: das Werkzeug ist
  // generisch, die Daten gehoeren dem Repo, in dem es laeuft. Erst wenn ein
  // Teil da ist und ein anderer fehlt, ist das ein Fehler.
  if (istLeererStart(data)) return roh;

  liesSysteme(wurzel, roh, befunde);
  liesOrganisation(wurzel, roh, befunde);
  liesAufgaben(wurzel, roh, befunde);
  liesZuordnungen(wurzel, roh, befunde);

  return roh;
}

function istVerzeichnis(pfad: string): boolean {
  try {
    return Deno.statSync(pfad).isDirectory;
  } catch {
    return false;
  }
}

function istDatei(pfad: string): boolean {
  try {
    return Deno.statSync(pfad).isFile;
  } catch {
    return false;
  }
}

/**
 * True, wenn keine der drei Stammdatendateien und keine Zuordnungsdatei
 * existiert.
 */
function istLeererStart(data: string): boolean {
  return !istDatei(`${data}/systeme.yaml`) &&
    !istDatei(`${data}/organisation.yaml`) &&
    !istDatei(`${data}/aufgaben.yaml`) &&
    mdDateien(`${data}/zuordnungen`).length === 0;
}

/**
 * Alle `.md`-Dateien eines Verzeichnisses, nach Name sortiert. Ein fehlendes
 * Verzeichnis ergibt eine leere Liste.
 */
function mdDateien(verzeichnis: string): string[] {
  let namen: string[];
  try {
    namen = [...Deno.readDirSync(verzeichnis)]
      .filter((e) => e.isFile && e.name.endsWith(".md"))
      .map((e) => e.name);
  } catch {
    return [];
  }
  namen.sort();
  return namen;
}

// ---------------------------------------------------------------------------
// YAML-Stammdaten
// ---------------------------------------------------------------------------

/**
 * Liest eine YAML-Datei. Bei einem Lese- oder Syntaxfehler entsteht ein Befund
 * und `null`. Eine leere Datei oder eine nur mit Kommentaren ist gültig und
 * ergibt einfach keine Einträge; so kann man eine Datei leeren und neu
 * anfangen.
 */
function liesYaml<T>(
  wurzel: string,
  rel: string,
  leer: T,
  bauen: (wert: unknown) => T,
  befunde: Befund[],
): { wert: T; text: string } | null {
  let text: string;
  try {
    text = Deno.readTextFileSync(`${wurzel}/${rel}`);
  } catch (grund) {
    if (grund instanceof Deno.errors.NotFound) {
      befunde.push(fehler(pos(rel), "Datei fehlt"));
    } else {
      befunde.push(
        fehler(pos(rel), `Datei nicht lesbar (${beschreibe(grund)})`),
      );
    }
    return null;
  }

  const nurKommentare = text.split("\n").every((z) => {
    const t = z.trim();
    return t === "" || t.startsWith("#");
  });
  if (nurKommentare) return { wert: leer, text };

  try {
    return { wert: bauen(yamlLies(text)), text };
  } catch (grund) {
    befunde.push(
      fehler(
        pos(rel, yamlZeile(grund)),
        `YAML nicht lesbar: ${beschreibe(grund)}`,
      ),
    );
    return null;
  }
}

function beschreibe(grund: unknown): string {
  return grund instanceof Error ? grund.message : String(grund);
}

/** Zeilennummer aus einer YAML-Fehlermeldung, 0 wenn keine drinsteht. */
function yamlZeile(grund: unknown): number {
  const treffer = /\((\d+):\d+\)|at line (\d+)/.exec(beschreibe(grund));
  if (!treffer) return 0;
  return Number(treffer[1] ?? treffer[2]);
}

// Die folgenden Umwandler entsprechen den serde-Strukturen der Rust-Fassung:
// `id` und `name` sind Pflicht, alles andere hat einen Vorgabewert. Ein
// falscher Aufbau wirft und wird oben zu "YAML nicht lesbar".

function pflichtText(wert: Record<string, unknown>, feld: string): string {
  const v = wert[feld];
  if (typeof v !== "string") {
    throw new TypeError(`Feld "${feld}" fehlt oder ist kein Text`);
  }
  return v;
}

function wahrheitswertOderFalse(wert: Record<string, unknown>, feld: string): boolean {
  const v = wert[feld];
  if (v === undefined || v === null) return false;
  if (typeof v === "boolean") return v;
  throw new TypeError(`Feld "${feld}" ist kein Wahrheitswert (true oder false)`);
}

function textOderNull(wert: Record<string, unknown>, feld: string): string | null {
  const v = wert[feld];
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  throw new TypeError(`Feld "${feld}" ist kein Text`);
}

function zahlOderNull(wert: Record<string, unknown>, feld: string): number | null {
  const v = wert[feld];
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return v;
  throw new TypeError(`Feld "${feld}" ist keine Zahl`);
}

function textliste(wert: Record<string, unknown>, feld: string): string[] {
  const v = wert[feld];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new TypeError(`Feld "${feld}" ist keine Liste`);
  return v.map((e) => {
    if (typeof e !== "string") throw new TypeError(`Feld "${feld}" enthält keinen Text`);
    return e;
  });
}

function alsObjekte(wert: unknown): Record<string, unknown>[] {
  if (wert === undefined || wert === null) return [];
  if (!Array.isArray(wert)) throw new TypeError("erwartet wird eine Liste");
  return wert.map((e) => {
    if (typeof e !== "object" || e === null || Array.isArray(e)) {
      throw new TypeError("erwartet werden Einträge mit Feldern");
    }
    return e as Record<string, unknown>;
  });
}

function baueSysteme(wert: unknown): System[] {
  return alsObjekte(wert).map((e) => ({
    id: pflichtText(e, "id"),
    name: pflichtText(e, "name"),
    verantwortlich: textOderNull(e, "verantwortlich"),
    status: textOderNull(e, "status") ?? "",
    seit: zahlOderNull(e, "seit"),
    ende: zahlOderNull(e, "ende"),
    notiz: textOderNull(e, "notiz"),
  }));
}

function baueObjekte(wert: unknown): Objekt[] {
  return alsObjekte(wert).map((e) => ({
    id: pflichtText(e, "id"),
    name: pflichtText(e, "name"),
    art: textOderNull(e, "art") ?? "fachlich",
    aufgaben: alsObjekte(e.aufgaben).map((a): Aufgabe => ({
      id: pflichtText(a, "id"),
      name: pflichtText(a, "name"),
    })),
  }));
}

interface Organisation {
  geschaeftsfelder: Geschaeftsfeld[];
  abteilungen: Abteilung[];
}

function baueOrganisation(wert: unknown): Organisation {
  if (wert === undefined || wert === null) {
    return { geschaeftsfelder: [], abteilungen: [] };
  }
  if (typeof wert !== "object" || Array.isArray(wert)) {
    throw new TypeError("erwartet werden Felder geschaeftsfelder und abteilungen");
  }
  const o = wert as Record<string, unknown>;
  return {
    geschaeftsfelder: alsObjekte(o.geschaeftsfelder).map((e) => ({
      id: pflichtText(e, "id"),
      name: pflichtText(e, "name"),
      zentral: wahrheitswertOderFalse(e, "zentral"),
    })),
    abteilungen: alsObjekte(o.abteilungen).map((e) => ({
      id: pflichtText(e, "id"),
      name: pflichtText(e, "name"),
      geschaeftsfelder: textliste(e, "geschaeftsfelder"),
      bearbeitet: textliste(e, "bearbeitet"),
    })),
  };
}

function liesSysteme(wurzel: string, roh: Rohdaten, befunde: Befund[]): void {
  const gelesen = liesYaml<System[]>(wurzel, SYSTEME, [], baueSysteme, befunde);
  if (!gelesen) return;

  const index = new IdZeilen(gelesen.text);
  const zeilen = gelesen.text.split("\n");
  for (const s of gelesen.wert) {
    const zeile = index.nimm(s.id);
    roh.posSysteme.push(pos(SYSTEME, zeile));
    const statusZeile = schluesselZeile(zeilen, zeile, "status");
    roh.posSystemeStatus.push(pos(SYSTEME, statusZeile > 0 ? statusZeile : zeile));
  }
  roh.systeme = gelesen.wert;
}

function liesOrganisation(wurzel: string, roh: Rohdaten, befunde: Befund[]): void {
  const gelesen = liesYaml<Organisation>(
    wurzel,
    ORGANISATION,
    { geschaeftsfelder: [], abteilungen: [] },
    baueOrganisation,
    befunde,
  );
  if (!gelesen) return;

  const index = new IdZeilen(gelesen.text);
  for (const gf of gelesen.wert.geschaeftsfelder) {
    roh.posGeschaeftsfelder.push(pos(ORGANISATION, index.nimm(gf.id)));
  }
  for (const a of gelesen.wert.abteilungen) {
    roh.posAbteilungen.push(pos(ORGANISATION, index.nimm(a.id)));
  }
  roh.geschaeftsfelder = gelesen.wert.geschaeftsfelder;
  roh.abteilungen = gelesen.wert.abteilungen;
}

function liesAufgaben(wurzel: string, roh: Rohdaten, befunde: Befund[]): void {
  const gelesen = liesYaml<Objekt[]>(wurzel, AUFGABEN, [], baueObjekte, befunde);
  if (!gelesen) return;

  const index = new IdZeilen(gelesen.text);
  const zeilen = gelesen.text.split("\n");
  for (const o of gelesen.wert) {
    const zeile = index.nimm(o.id);
    roh.posObjekte.push(pos(AUFGABEN, zeile));
    const artZeile = schluesselZeile(zeilen, zeile, "art");
    roh.posObjekteArt.push(pos(AUFGABEN, artZeile > 0 ? artZeile : zeile));
    roh.posAufgaben.push(o.aufgaben.map((a) => pos(AUFGABEN, index.nimm(a.id))));
  }
  roh.objekte = gelesen.wert;
}

/**
 * Zeilennummern aller `id: <wert>`-Stellen einer YAML-Datei, gruppiert nach
 * Wert. Die Vorkommen werden in Dokumentreihenfolge herausgegeben, damit auch
 * doppelte IDs die jeweils richtige Zeile bekommen.
 */
class IdZeilen {
  #nachWert = new Map<string, number[]>();

  constructor(text: string) {
    const zeilen = text.split("\n");
    for (let nr = 0; nr < zeilen.length; nr++) {
      const zeile = zeilen[nr];
      let ab = 0;
      for (;;) {
        const stelle = zeile.indexOf("id:", ab);
        if (stelle < 0) break;
        const davor = zeile.slice(0, stelle).trimEnd();
        // Nur echte Schlüsselpositionen: Zeilenanfang, Listenelement oder
        // innerhalb einer Flow-Map wie `- {id: x, name: y}`.
        const istSchluessel = davor === "" || davor.endsWith("-") ||
          davor.endsWith("{") || davor.endsWith(",");
        if (istSchluessel) {
          const wert = wertAb(zeile.slice(stelle + 3));
          if (wert !== "") {
            const liste = this.#nachWert.get(wert);
            if (liste) liste.push(nr + 1);
            else this.#nachWert.set(wert, [nr + 1]);
          }
        }
        ab = stelle + 3;
      }
    }
  }

  /** Nächste Zeile für diesen Wert, 0 wenn keine mehr da ist. */
  nimm(id: string): number {
    return this.#nachWert.get(id)?.shift() ?? 0;
  }
}

/** Skalarer Wert hinter einem Schlüssel, bis `,` oder `}` oder Zeilenende. */
function wertAb(s: string): string {
  const t = s.trimStart();
  const treffer = /[,}]/.exec(t);
  let wert = (treffer ? t.slice(0, treffer.index) : t).trim();
  const kommentar = wert.indexOf(" #");
  if (kommentar >= 0) wert = wert.slice(0, kommentar).trimEnd();
  return wert.replace(/^["']+/, "").replace(/["']+$/, "");
}

/**
 * Sucht `schluessel:` im Block, der bei `idZeile` beginnt. 0 wenn nicht
 * gefunden.
 */
function schluesselZeile(zeilen: string[], idZeile: number, schluessel: string): number {
  if (idZeile === 0 || idZeile > zeilen.length) return 0;
  const muster = `${schluessel}:`;
  for (let i = idZeile - 1; i < zeilen.length; i++) {
    const z = zeilen[i];
    if (i === idZeile - 1) {
      // Flow-Map: `- {id: x, status: aktiv}`
      if (z.includes(muster)) return i + 1;
      continue;
    }
    const t = z.trimStart();
    if (t.startsWith("- ") || t.startsWith("-\t")) break;
    if (t.startsWith(muster)) return i + 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Zuordnungsdateien
// ---------------------------------------------------------------------------

function liesZuordnungen(wurzel: string, roh: Rohdaten, befunde: Befund[]): void {
  // Ein fehlendes oder leeres Verzeichnis ist kein Fehler: Stammdaten ohne
  // Zuordnungen sind ein normaler Zwischenstand beim Aufbau.
  for (const name of mdDateien(`${wurzel}/${ZUORDNUNGEN}`)) {
    const rel = `${ZUORDNUNGEN}/${name}`;
    let text: string;
    try {
      text = Deno.readTextFileSync(`${wurzel}/${rel}`);
    } catch (grund) {
      befunde.push(fehler(pos(rel), `Datei nicht lesbar (${beschreibe(grund)})`));
      continue;
    }
    const datei = liesZuordnungsdatei(rel, text, befunde);
    if (datei) roh.dateien.push(datei);
  }
}

function liesZuordnungsdatei(
  rel: string,
  text: string,
  befunde: Befund[],
): Zuordnungsdatei | null {
  const zeilen = text.split("\n");

  // Frontmatter: Block zwischen zwei `---` am Dateianfang. Regel F8.
  let erste = 0;
  while (erste < zeilen.length && zeilen[erste].trim() === "") erste++;
  if (erste >= zeilen.length || zeilen[erste].trim() !== "---") {
    befunde.push(fehler(
      pos(rel, 1),
      'Frontmatter fehlt (erwartet wird ein Block zwischen zwei "---" mit "geschaeftsfeld:")',
    ));
    return null;
  }

  let ende = -1;
  for (let i = erste + 1; i < zeilen.length; i++) {
    if (zeilen[i].trim() === "---") {
      ende = i;
      break;
    }
  }
  if (ende < 0) {
    befunde.push(fehler(
      pos(rel, erste + 1),
      'Frontmatter ist nicht geschlossen (zweites "---" fehlt)',
    ));
    return null;
  }

  const block = zeilen.slice(erste + 1, ende).join("\n");
  let gf: string;
  try {
    const geparst = yamlLies(block);
    if (
      typeof geparst !== "object" || geparst === null || Array.isArray(geparst) ||
      typeof (geparst as Record<string, unknown>).geschaeftsfeld !== "string"
    ) {
      throw new TypeError("kein geschaeftsfeld");
    }
    gf = (geparst as Record<string, string>).geschaeftsfeld;
  } catch {
    befunde.push(fehler(
      pos(rel, erste + 2),
      'Frontmatter enthält kein "geschaeftsfeld:"',
    ));
    return null;
  }

  let gfZeile = erste + 2;
  for (let i = erste + 1; i < ende; i++) {
    if (zeilen[i].trimStart().startsWith("geschaeftsfeld:")) {
      gfZeile = i + 1;
      break;
    }
  }

  const datei: Zuordnungsdatei = { gf, gfPos: pos(rel, gfZeile), zeilen: [] };

  // Tabellen einsammeln. Mehrere Tabellen je Datei sind erlaubt; alles andere
  // ist Freitext und wird ignoriert.
  let i = ende + 1;
  while (i < zeilen.length) {
    if (
      !istTabellenzeile(zeilen[i]) || i + 1 >= zeilen.length ||
      !istTrennzeile(zeilen[i + 1])
    ) {
      i++;
      continue;
    }
    const spalten = spaltenAusKopf(zellen(zeilen[i]));
    let j = i + 2;
    while (j < zeilen.length && istTabellenzeile(zeilen[j])) {
      if (spalten) {
        const z = zellen(zeilen[j]);
        const stelle = pos(rel, j + 1);
        const abteilung = hole(z, spalten.abteilung);
        const aufgabe = hole(z, spalten.aufgabe);
        const system = hole(z, spalten.system);

        // Regel F12: Pflichtspalte leer.
        const fehlend: string[] = [];
        if (abteilung === "") fehlend.push("Abteilung");
        if (aufgabe === "") fehlend.push("Aufgabe");
        if (system === "") fehlend.push("System");
        if (fehlend.length === 0) {
          datei.zeilen.push({
            abteilung,
            aufgabe,
            system,
            anmerkung: spalten.anmerkung === null ? "" : hole(z, spalten.anmerkung),
            pos: stelle,
          });
        } else {
          befunde.push(fehler(
            stelle,
            `Zeile unvollständig, Spalte ${fehlend.join(" und ")} ist leer`,
          ));
        }
      }
      j++;
    }
    i = j;
  }

  return datei;
}

/** Spaltenpositionen einer Tabellenkopfzeile. */
interface Spalten {
  abteilung: number;
  aufgabe: number;
  system: number;
  anmerkung: number | null;
}

/**
 * `null`, wenn die Tabelle nicht die Pflichtspalten hat. Solche Tabellen
 * werden komplett ignoriert.
 */
function spaltenAusKopf(kopf: string[]): Spalten | null {
  const finde = (name: string) =>
    kopf.findIndex((c) => c.trim().toLowerCase() === name.toLowerCase());
  const abteilung = finde("Abteilung");
  const aufgabe = finde("Aufgabe");
  const system = finde("System");
  if (abteilung < 0 || aufgabe < 0 || system < 0) return null;
  const anmerkung = finde("Anmerkung");
  return { abteilung, aufgabe, system, anmerkung: anmerkung < 0 ? null : anmerkung };
}

function hole(zeile: string[], spalte: number): string {
  return (zeile[spalte] ?? "").trim();
}

function istTabellenzeile(zeile: string): boolean {
  return zeile.trimStart().startsWith("|");
}

function istTrennzeile(zeile: string): boolean {
  if (!istTabellenzeile(zeile)) return false;
  const z = zellen(zeile);
  return z.length > 0 && z.every((roh) => {
    const c = roh.trim();
    return c.includes("-") &&
      [...c].every((ch) => ch === "-" || ch === ":" || ch === " ");
  });
}

/**
 * Zerlegt eine Tabellenzeile in getrimmte Zellen. Führendes und abschließendes
 * `|` entfallen, Leerzeichen um `|` sind egal.
 */
function zellen(zeile: string): string[] {
  let t = zeile.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}
