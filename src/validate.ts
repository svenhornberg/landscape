// Die Regeln aus SPEC.md, Abschnitt "Validierung".
//
// Fehler blockieren `serve` und `make`, Warnungen werden nur angezeigt.
// Jeder Befund trägt eine Fundstelle mit Datei und, wo möglich, Zeile.
//
// Regelnummern (F = Fehler, W = Warnung) werden in den Tests referenziert:
//
// F1  Unbekannte Abteilung in einer Zuordnung
// F2  Unbekanntes Objekt in einer Aufgabenreferenz
// F3  Unbekannte Aufgabe innerhalb eines bekannten Objekts
// F4  Unbekanntes System in einer Zuordnung
// F5  Unbekanntes Geschäftsfeld im Frontmatter
// F6  Doppelte ID innerhalb einer Stammdatendatei
// F7  Aufgabenreferenz ohne Punkt
// F8  Frontmatter fehlt oder ist unvollständig
// F9  `bearbeitet` oder `geschaeftsfelder` referenziert eine unbekannte ID
// F10 Status eines Systems nicht aus der erlaubten Menge
// F11 ID verletzt das Muster [a-z0-9-]+
// F12 Zuordnungszeile mit leerer Pflichtspalte
// F13 Datei fehlt oder ist nicht lesbar
//
// W1  Exakt doppelte Zeile
// W2  Zuordnung in einem Geschäftsfeld, in dem die Abteilung nicht arbeitet
// W3  Zuordnung für ein Objekt, das nicht in `bearbeitet` steht
// W4  System ohne einzige Zuordnung
// W5  Abteilung ohne einzige Zuordnung
// W6  `auslaufend` ohne `ende`
// W7  Abteilung ist für kein Objekt zuständig (`bearbeitet` leer)

import {
  idGueltig,
  type Modell,
  type Pos,
  pos,
  posText,
  posVergleich,
  STATUS_WERTE,
  type Zuordnung,
} from "./model.ts";
import { type Befund, fehler, warnung } from "./befund.ts";
import { anzahlZuordnungen, lies, type Rohdaten, type Rohzeile } from "./parse.ts";

export type { Befund };

/** Ergebnis eines Laufs von `bplan validate`. */
export interface Ergebnis {
  /** Wird von `make` und `serve` ausgeliefert. */
  modell: Modell;
  befunde: Befund[];
  /** Anzahl gelesener Zuordnungsdateien, für die Zusammenfassungszeile. */
  dateien: number;
  /** Anzahl gelesener Tabellenzeilen, auch der fehlerhaften. */
  zuordnungen: number;
}

export function anzahlFehler(e: Ergebnis): number {
  return e.befunde.filter((b) => b.schwere === "Fehler").length;
}

export function anzahlWarnungen(e: Ergebnis): number {
  return e.befunde.filter((b) => b.schwere === "Warnung").length;
}

export function hatFehler(e: Ergebnis): boolean {
  return anzahlFehler(e) > 0;
}

/** Nichts gefunden und nichts zu meckern: ein frisch geleertes `data/`. */
export function istLeer(e: Ergebnis): boolean {
  return e.befunde.length === 0 &&
    e.modell.systeme.length === 0 &&
    e.modell.abteilungen.length === 0 &&
    e.modell.objekte.length === 0 &&
    e.modell.zuordnungen.length === 0;
}

/** Liest `wurzel` ein, prüft alle Regeln und baut das Modell. */
export function pruefe(wurzel: string): Ergebnis {
  const befunde: Befund[] = [];
  const roh = lies(wurzel, befunde);

  pruefeIdMuster(roh, befunde);
  pruefeDoppelteIds(roh, befunde);
  pruefeSysteme(roh, befunde);
  pruefeAbteilungsreferenzen(roh, befunde);

  const zuordnungen = pruefeZuordnungen(roh, befunde);
  pruefeUngenutzt(roh, zuordnungen, befunde);

  befunde.sort((a, b) => {
    if (a.schwere !== b.schwere) return a.schwere === "Fehler" ? -1 : 1;
    const nachPos = posVergleich(a.pos, b.pos);
    if (nachPos !== 0) return nachPos;
    return a.text < b.text ? -1 : a.text > b.text ? 1 : 0;
  });

  const warnungen = befunde
    .filter((b) => b.schwere === "Warnung")
    .map((b) => `${posText(b.pos)}  ${b.text}`);

  return {
    dateien: roh.dateien.length,
    zuordnungen: anzahlZuordnungen(roh),
    modell: {
      generiert: jetzt(),
      geschaeftsfelder: roh.geschaeftsfelder,
      abteilungen: roh.abteilungen,
      systeme: roh.systeme,
      objekte: roh.objekte,
      zuordnungen,
      warnungen,
    },
    befunde,
  };
}

/** Ortszeit im Format `2026-09-12T14:03:00`, wie in SPEC.md. */
function jetzt(): string {
  const d = new Date();
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}T` +
    `${zwei(d.getHours())}:${zwei(d.getMinutes())}:${zwei(d.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// Stammdaten
// ---------------------------------------------------------------------------

/** Regel F11. */
function pruefeIdMuster(roh: Rohdaten, befunde: Befund[]): void {
  const melde = (art: string, id: string, stelle: Pos) => {
    if (!idGueltig(id)) {
      befunde.push(fehler(
        stelle,
        `${art}-ID "${id}" ist ungültig (erlaubt sind nur a-z, 0-9 und -)`,
      ));
    }
  };

  roh.geschaeftsfelder.forEach((gf, i) => {
    melde("Geschäftsfeld", gf.id, roh.posGeschaeftsfelder[i]);
  });
  roh.abteilungen.forEach((a, i) => melde("Abteilungs", a.id, roh.posAbteilungen[i]));
  roh.systeme.forEach((s, i) => melde("System", s.id, roh.posSysteme[i]));
  roh.objekte.forEach((o, i) => melde("Objekt", o.id, roh.posObjekte[i]));
  roh.objekte.forEach((o, i) => {
    const positionen = roh.posAufgaben[i] ?? [];
    o.aufgaben.forEach((a, j) => {
      melde("Aufgaben", a.id, positionen[j] ?? roh.posObjekte[i]);
    });
  });
}

/**
 * Regel F6. Geprüft wird je Liste, also je Namensraum: zwei gleiche IDs in
 * `geschaeftsfelder` und `abteilungen` stören sich nicht.
 */
function pruefeDoppelteIds(roh: Rohdaten, befunde: Befund[]): void {
  const doppelte = (
    art: string,
    ids: string[],
    positionen: Pos[],
    zusatz: string,
  ) => {
    const gesehen = new Map<string, number>();
    ids.forEach((id, i) => {
      const stelle = positionen[i] ?? pos("");
      const erste = gesehen.get(id);
      if (erste === undefined) {
        gesehen.set(id, i);
        return;
      }
      const ersteZeile = positionen[erste]?.zeile ?? 0;
      const hinweis = ersteZeile > 0 ? ` (schon in Zeile ${ersteZeile})` : "";
      befunde.push(fehler(stelle, `${art}-ID "${id}" ist doppelt${zusatz}${hinweis}`));
    });
  };

  doppelte(
    "Geschäftsfeld",
    roh.geschaeftsfelder.map((g) => g.id),
    roh.posGeschaeftsfelder,
    "",
  );
  doppelte("Abteilungs", roh.abteilungen.map((a) => a.id), roh.posAbteilungen, "");
  doppelte("System", roh.systeme.map((s) => s.id), roh.posSysteme, "");
  doppelte("Objekt", roh.objekte.map((o) => o.id), roh.posObjekte, "");
  roh.objekte.forEach((o, i) => {
    doppelte(
      "Aufgaben",
      o.aufgaben.map((a) => a.id),
      roh.posAufgaben[i] ?? [],
      ` in Objekt "${o.id}"`,
    );
  });
}

/** Regeln F10 und W6. */
function pruefeSysteme(roh: Rohdaten, befunde: Befund[]): void {
  const erlaubt = STATUS_WERTE.join(", ");
  roh.systeme.forEach((s, i) => {
    const stelle = roh.posSysteme[i] ?? pos("data/systeme.yaml");
    const statusStelle = roh.posSystemeStatus[i] ?? stelle;

    if (s.status === "") {
      befunde.push(fehler(
        stelle,
        `System "${s.id}" hat keinen Status (erlaubt: ${erlaubt})`,
      ));
    } else if (!STATUS_WERTE.includes(s.status)) {
      befunde.push(fehler(
        statusStelle,
        `Status "${s.status}" von System "${s.id}" ist nicht erlaubt (erlaubt: ${erlaubt})`,
      ));
    }

    if (s.status === "auslaufend" && s.ende === null) {
      befunde.push(warnung(
        stelle,
        `System "${s.id}" ist auslaufend, hat aber kein "ende"`,
      ));
    }
  });
}

/** Regeln F9 und W7. */
function pruefeAbteilungsreferenzen(roh: Rohdaten, befunde: Befund[]): void {
  roh.abteilungen.forEach((a, i) => {
    const stelle = roh.posAbteilungen[i] ?? pos("data/organisation.yaml");

    for (const gf of a.geschaeftsfelder) {
      if (roh.geschaeftsfelder.some((g) => g.id === gf)) continue;
      befunde.push(fehler(
        stelle,
        mitVorschlag(
          `Abteilung "${a.id}" verweist auf unbekanntes Geschäftsfeld "${gf}"`,
          vorschlag(gf, roh.geschaeftsfelder),
        ),
      ));
    }

    for (const objekt of a.bearbeitet) {
      if (roh.objekte.some((o) => o.id === objekt)) continue;
      befunde.push(fehler(
        stelle,
        mitVorschlag(
          `"bearbeitet" von Abteilung "${a.id}" verweist auf unbekanntes Objekt "${objekt}"`,
          vorschlag(objekt, roh.objekte),
        ),
      ));
    }

    if (a.bearbeitet.length === 0) {
      befunde.push(warnung(stelle, `Abteilung "${a.id}" ist für kein Objekt zuständig`));
    }
  });
}

// ---------------------------------------------------------------------------
// Zuordnungen
// ---------------------------------------------------------------------------

/**
 * Regeln F1 bis F5, F7 sowie W1 bis W3. Gibt die geprüften Zuordnungen für das
 * Modell zurück.
 */
function pruefeZuordnungen(roh: Rohdaten, befunde: Befund[]): Zuordnung[] {
  const ergebnis: Zuordnung[] = [];
  // Schlüssel der bereits gesehenen Wege, für Regel W1.
  const gesehen = new Map<string, Pos>();

  for (const datei of roh.dateien) {
    // Regel F5.
    const gfBekannt = roh.geschaeftsfelder.some((g) => g.id === datei.gf);
    if (!gfBekannt) {
      befunde.push(fehler(
        datei.gfPos,
        mitVorschlag(
          `Geschäftsfeld "${datei.gf}" unbekannt`,
          vorschlag(datei.gf, roh.geschaeftsfelder),
        ),
      ));
    }

    for (const zeile of datei.zeilen) {
      const stelle = zeile.pos;

      // Regel F1.
      const abteilung = roh.abteilungen.find((a) => a.id === zeile.abteilung);
      if (!abteilung) {
        befunde.push(fehler(
          stelle,
          mitVorschlag(
            `Abteilung "${zeile.abteilung}" unbekannt`,
            vorschlag(zeile.abteilung, roh.abteilungen),
          ),
        ));
      }

      // Regeln F7, F2, F3.
      const capability = pruefeCapability(roh, zeile, stelle, befunde);

      // Regel F4.
      const system = roh.systeme.find((s) => s.id === zeile.system);
      if (!system) {
        befunde.push(fehler(
          stelle,
          mitVorschlag(
            `System "${zeile.system}" unbekannt`,
            vorschlag(zeile.system, roh.systeme),
          ),
        ));
      }

      if (!abteilung || !capability || !system || !gfBekannt) continue;
      const [objekt, aufgabe] = capability;

      // Regel W2.
      if (!abteilung.geschaeftsfelder.includes(datei.gf)) {
        befunde.push(warnung(
          stelle,
          `Abteilung "${abteilung.id}" arbeitet laut organisation.yaml nicht im Geschäftsfeld "${datei.gf}"`,
        ));
      }

      // Regel W3.
      if (!abteilung.bearbeitet.includes(objekt)) {
        befunde.push(warnung(
          stelle,
          `Objekt "${objekt}" steht nicht in "bearbeitet" von Abteilung "${abteilung.id}" (entweder die Regel ergänzen oder die Zeile ist falsch)`,
        ));
      }

      // Regel W1.
      const schluessel = [datei.gf, abteilung.id, objekt, aufgabe, system.id].join(" ");
      const erste = gesehen.get(schluessel);
      if (erste) {
        // Innerhalb derselben Datei reicht die Zeile, sonst braucht es den
        // Dateinamen dazu.
        const wo = erste.datei === stelle.datei ? `Zeile ${erste.zeile}` : posText(erste);
        befunde.push(warnung(stelle, `Zeile ist exakt doppelt (schon in ${wo})`));
      } else {
        gesehen.set(schluessel, stelle);
      }

      ergebnis.push({
        gf: datei.gf,
        abteilung: abteilung.id,
        objekt,
        aufgabe,
        system: system.id,
        anmerkung: zeile.anmerkung,
        quelle: posText(stelle),
      });
    }
  }

  return ergebnis;
}

/** Zerlegt `objekt.aufgabe` und prüft beide Teile. Regeln F7, F2, F3. */
function pruefeCapability(
  roh: Rohdaten,
  zeile: Rohzeile,
  stelle: Pos,
  befunde: Befund[],
): [string, string] | null {
  const punkt = zeile.aufgabe.indexOf(".");
  if (punkt < 0) {
    befunde.push(fehler(
      stelle,
      `Aufgabe "${zeile.aufgabe}" hat keinen Punkt (erwartet wird objekt.aufgabe)`,
    ));
    return null;
  }
  const objektId = zeile.aufgabe.slice(0, punkt);
  const aufgabeId = zeile.aufgabe.slice(punkt + 1);

  const objekt = roh.objekte.find((o) => o.id === objektId);
  if (!objekt) {
    befunde.push(fehler(
      stelle,
      mitVorschlag(`Objekt "${objektId}" unbekannt`, vorschlag(objektId, roh.objekte)),
    ));
    return null;
  }

  if (objekt.aufgaben.some((a) => a.id === aufgabeId)) return [objektId, aufgabeId];

  const v = vorschlag(aufgabeId, objekt.aufgaben);
  const hinweis = v ? `; meintest du "${v}"?` : "";
  befunde.push(fehler(
    stelle,
    `Aufgabe "${zeile.aufgabe}" unbekannt (Objekt ${objekt.name} hat: ${
      objekt.aufgaben.map((a) => a.id).join(", ")
    }${hinweis})`,
  ));
  return null;
}

/** Regeln W4 und W5. */
function pruefeUngenutzt(
  roh: Rohdaten,
  zuordnungen: Zuordnung[],
  befunde: Befund[],
): void {
  const genutzteSysteme = new Set(zuordnungen.map((z) => z.system));
  const genutzteAbteilungen = new Set(zuordnungen.map((z) => z.abteilung));

  roh.systeme.forEach((s, i) => {
    if (genutzteSysteme.has(s.id)) return;
    befunde.push(warnung(
      roh.posSysteme[i] ?? pos("data/systeme.yaml"),
      `System "${s.id}" hat keine einzige Zuordnung`,
    ));
  });

  roh.abteilungen.forEach((a, i) => {
    if (genutzteAbteilungen.has(a.id)) return;
    befunde.push(warnung(
      roh.posAbteilungen[i] ?? pos("data/organisation.yaml"),
      `Abteilung "${a.id}" hat keine einzige Zuordnung`,
    ));
  });
}

// ---------------------------------------------------------------------------
// Vorschläge bei unbekannten IDs
// ---------------------------------------------------------------------------

/** Maximale Levenshtein-Distanz für einen Vorschlag, laut SPEC.md. */
const MAX_DISTANZ = 3;

/**
 * Sucht den ähnlichsten bekannten Wert. Verglichen wird klein geschrieben
 * sowohl mit der ID als auch mit dem Anzeigenamen, vorgeschlagen wird immer
 * die ID. So findet "shopsystem" das System "shop" mit dem Namen "Shopsystem",
 * was mit einem reinen ID-Vergleich nicht ginge.
 */
export function vorschlag(
  eingabe: string,
  kandidaten: readonly { id: string; name: string }[],
): string | null {
  const gesucht = eingabe.toLowerCase();
  let beste: { distanz: number; id: string } | null = null;
  for (const k of kandidaten) {
    const distanz = Math.min(
      levenshtein(gesucht, k.id.toLowerCase()),
      levenshtein(gesucht, k.name.toLowerCase()),
    );
    if (distanz <= MAX_DISTANZ && (beste === null || distanz < beste.distanz)) {
      beste = { distanz, id: k.id };
    }
  }
  return beste?.id ?? null;
}

function mitVorschlag(basis: string, v: string | null): string {
  return v === null ? basis : `${basis} (meintest du "${v}"?)`;
}

export function levenshtein(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  if (x.length === 0) return y.length;
  if (y.length === 0) return x.length;

  let vorherige = Array.from({ length: y.length + 1 }, (_, i) => i);
  let aktuelle = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    aktuelle[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const kosten = x[i - 1] === y[j - 1] ? 0 : 1;
      aktuelle[j] = Math.min(
        vorherige[j] + 1,
        aktuelle[j - 1] + 1,
        vorherige[j - 1] + kosten,
      );
    }
    [vorherige, aktuelle] = [aktuelle, vorherige];
  }
  return vorherige[y.length];
}
