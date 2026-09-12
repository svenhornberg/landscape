// Datenstrukturen der Stammdaten und das JSON-Modell für das Frontend.
//
// Das Werkzeug liefert nur das validierte Modell. Alle Kennzahlen (Redundanz,
// White Spots, max je Zelle) rechnet das Frontend selbst aus den Rohdaten,
// damit diese Logik an genau einer Stelle liegt.

/** Erlaubte Werte für `status` in `systeme.yaml`. */
export const STATUS_WERTE = ["aktiv", "auslaufend", "geplant"];

/** Erlaubtes Muster für alle IDs: `[a-z0-9-]+`. */
export function idGueltig(id: string): boolean {
  return /^[a-z0-9-]+$/.test(id);
}

/** Ein System aus `systeme.yaml`. */
export interface System {
  id: string;
  name: string;
  verantwortlich: string | null;
  /**
   * Bewusst als freier String gelesen: ein unerlaubter Wert soll eine
   * Validierungsmeldung mit Datei und Zeile werden, kein Parse-Fehler.
   */
  status: string;
  seit: number | null;
  ende: number | null;
  notiz: string | null;
}

/** Ein Geschäftsfeld aus `organisation.yaml`. */
export interface Geschaeftsfeld {
  id: string;
  name: string;
  /**
   * Zentralfunktion: Zuordnungen hier gelten in jedem Geschäftsfeld mit. Die
   * Abteilungen darin gibt es einmal für alle, nicht je Geschäftsfeld.
   */
  zentral: boolean;
}

/** Eine Abteilung aus `organisation.yaml`. */
export interface Abteilung {
  id: string;
  name: string;
  /** In welchen Säulen die Abteilung arbeitet. */
  geschaeftsfelder: string[];
  /**
   * Für welche Objekte sie zuständig ist. Das ist die Zuständigkeitsregel,
   * aus der sich White Spots ergeben.
   */
  bearbeitet: string[];
}

/** Eine Aufgabe innerhalb eines Objekts. */
export interface Aufgabe {
  id: string;
  name: string;
}

/**
 * Ein Objekt aus `aufgaben.yaml`. Objekt und Aufgabe zusammen ergeben die
 * Capability, referenziert als `objekt.aufgabe`.
 */
export interface Objekt {
  id: string;
  name: string;
  aufgaben: Aufgabe[];
}

/**
 * Ein geprüfter Weg: Abteilung erledigt eine Aufgabe in einem Geschäftsfeld
 * mit einem System.
 */
export interface Zuordnung {
  gf: string;
  abteilung: string;
  objekt: string;
  aufgabe: string;
  system: string;
  anmerkung: string;
  /**
   * Datei und Zeile, damit das Frontend bei jedem Weg zeigen kann, wo er
   * herkommt, z. B. `data/zuordnungen/geschaeftskunden.md:14`.
   */
  quelle: string;
}

/**
 * Das vollständige Modell, wie es `serve` als JSON ausliefert und `make` in
 * die HTML-Datei einbettet.
 */
export interface Modell {
  generiert: string;
  geschaeftsfelder: Geschaeftsfeld[];
  abteilungen: Abteilung[];
  systeme: System[];
  objekte: Objekt[];
  zuordnungen: Zuordnung[];
  warnungen: string[];
}

/**
 * Stelle in einer Datei. `zeile` ist 1-basiert; 0 bedeutet "keine Zeile
 * bekannt" und wird beim Ausgeben weggelassen.
 */
export interface Pos {
  /** Pfad relativ zum übergebenen Wurzelverzeichnis, immer mit `/`. */
  datei: string;
  zeile: number;
}

export function pos(datei: string, zeile = 0): Pos {
  return { datei, zeile };
}

export function posText(p: Pos): string {
  return p.zeile > 0 ? `${p.datei}:${p.zeile}` : p.datei;
}

/** Sortierreihenfolge: erst Datei, dann Zeile. */
export function posVergleich(a: Pos, b: Pos): number {
  if (a.datei !== b.datei) return a.datei < b.datei ? -1 : 1;
  return a.zeile - b.zeile;
}
