// Ein Testfall je Regel aus SPEC.md, Abschnitt "Validierung".
//
// Getestet wird über die aufgerufene CLI, damit auch die Ausgabe mit
// Datei:Zeile und Vorschlag mitgeprüft wird und nicht nur die interne
// Datenstruktur.

import { assert, assertEquals } from "jsr:@std/assert@1.0.19";

import { levenshtein, vorschlag } from "../src/validate.ts";

const CLI = new URL("../cli.ts", import.meta.url).pathname;
const BEISPIELE = new URL("../examples/", import.meta.url).pathname;

// ---------------------------------------------------------------------------
// Basisdatensatz: klein, gültig, ohne Warnungen. Jeder Test tauscht genau eine
// Datei aus und prüft die dadurch ausgelöste Regel.
// ---------------------------------------------------------------------------

const SYSTEME = `- id: shop
  name: Shopsystem
  status: aktiv
- id: erp
  name: ERP
  status: aktiv
`;

const ORGANISATION = `geschaeftsfelder:
  - id: gk
    name: Geschaeftskunden

abteilungen:
  - id: vertrieb
    name: Vertrieb
    geschaeftsfelder: [gk]
    bearbeitet: [angebot]
  - id: buchhaltung
    name: Buchhaltung
    geschaeftsfelder: [gk]
    bearbeitet: [rechnung]
`;

const AUFGABEN = `- id: angebot
  name: Angebot
  aufgaben:
    - {id: erstellen, name: erstellen}
    - {id: versenden, name: versenden}
- id: rechnung
  name: Rechnung
  aufgaben:
    - {id: erstellen, name: erstellen}
`;

/** Zeile 1 `---`, 2 Frontmatter, 3 `---`, 5 Kopf, 6 Trenner, ab 7 Daten. */
const ZUORDNUNGEN = `---
geschaeftsfeld: gk
---

| Abteilung   | Aufgabe            | System | Anmerkung |
|-------------|--------------------|--------|-----------|
| vertrieb    | angebot.erstellen  | shop   |           |
| vertrieb    | angebot.versenden  | shop   |           |
| buchhaltung | rechnung.erstellen | erp    |           |
`;

class Ausgabe {
  constructor(readonly code: number, readonly text: string) {}

  erwarte(teil: string): this {
    assert(
      this.text.includes(teil),
      `erwartet in der Ausgabe:\n  ${teil}\nbekommen:\n${this.text}`,
    );
    return this;
  }

  erwarteNicht(teil: string): this {
    assert(
      !this.text.includes(teil),
      `nicht erwartet in der Ausgabe:\n  ${teil}\nbekommen:\n${this.text}`,
    );
    return this;
  }

  erwarteCode(code: number): this {
    assertEquals(this.code, code, `falscher Exit-Code, Ausgabe:\n${this.text}`);
    return this;
  }
}

function starte(args: string[]): Ausgabe {
  const lauf = new Deno.Command(Deno.execPath(), {
    args: ["run", "--quiet", "--allow-read", "--allow-write", CLI, ...args],
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  const text = new TextDecoder();
  return new Ausgabe(
    lauf.code,
    text.decode(lauf.stdout) + text.decode(lauf.stderr),
  );
}

function validate(pfad: string): Ausgabe {
  return starte(["validate", pfad]);
}

function make(pfad: string, ausgabe: string): Ausgabe {
  return starte(["make", pfad, "-o", ausgabe]);
}

class Datensatz {
  readonly dir = Deno.makeTempDirSync();

  constructor() {
    this.schreibe("data/systeme.yaml", SYSTEME);
    this.schreibe("data/organisation.yaml", ORGANISATION);
    this.schreibe("data/aufgaben.yaml", AUFGABEN);
    this.schreibe("data/zuordnungen/gk.md", ZUORDNUNGEN);
  }

  schreibe(rel: string, inhalt: string): void {
    const pfad = `${this.dir}/${rel}`;
    Deno.mkdirSync(pfad.replace(/\/[^/]*$/, ""), { recursive: true });
    Deno.writeTextFileSync(pfad, inhalt);
  }

  loesche(rel: string): void {
    Deno.removeSync(`${this.dir}/${rel}`);
  }

  /**
   * Hängt Zeilen an die Zuordnungstabelle an. Die erste angehängte Zeile
   * landet auf Zeile 10.
   */
  zeilenAnhaengen(zeilen: string): void {
    this.schreibe("data/zuordnungen/gk.md", ZUORDNUNGEN + zeilen);
  }

  pruefe(): Ausgabe {
    return validate(this.dir);
  }

  /** Baut die HTML-Datei nach `rel` innerhalb des Datensatzes. */
  mache(rel: string): Ausgabe {
    return make(this.dir, `${this.dir}/${rel}`);
  }

  lies(rel: string): string {
    return Deno.readTextFileSync(`${this.dir}/${rel}`);
  }

  gibtEs(rel: string): boolean {
    try {
      Deno.statSync(`${this.dir}/${rel}`);
      return true;
    } catch {
      return false;
    }
  }

  weg(): void {
    Deno.removeSync(this.dir, { recursive: true });
  }
}

/** Meldet den Testfall an und räumt das Temp-Verzeichnis hinterher weg. */
function mitDatensatz(name: string, lauf: (d: Datensatz) => void): void {
  Deno.test(name, () => {
    const d = new Datensatz();
    try {
      lauf(d);
    } finally {
      d.weg();
    }
  });
}

/** Meldet einen Testfall mit leerem Temp-Verzeichnis an. */
function mitOrdner(name: string, lauf: (dir: string) => void): void {
  Deno.test(name, () => {
    const dir = Deno.makeTempDirSync();
    try {
      lauf(dir);
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  });
}

/**
 * Schneidet das eingebettete Modell aus einer von `make` erzeugten Datei.
 * Weil `make` jedes `<` maskiert, ist das erste `</script>` nach dem
 * Script-Tag verlaesslich dessen Ende.
 */
// deno-lint-ignore no-explicit-any
function modellAus(html: string): any {
  const START = '<script id="model" type="application/json">';
  const nachTag = html.split(START)[1];
  assert(nachTag !== undefined, "Script-Tag mit dem Modell nicht gefunden");
  const json = nachTag.split("</script>")[0];
  return JSON.parse(json);
}

function beispiel(name: string): string {
  return `${BEISPIELE}${name}`;
}

// ---------------------------------------------------------------------------
// Der Basisdatensatz selbst
// ---------------------------------------------------------------------------

mitDatensatz("basisdatensatz ist sauber", (d) => {
  d.pruefe()
    .erwarteCode(0)
    .erwarte("1 Datei, 3 Zuordnungen, 0 Fehler, 0 Warnungen")
    .erwarteNicht("Fehler  ")
    .erwarteNicht("Warnung  ");
});

// ---------------------------------------------------------------------------
// Fehler
// ---------------------------------------------------------------------------

mitDatensatz("F1 unbekannte Abteilung", (d) => {
  d.zeilenAnhaengen("| vertrib | angebot.erstellen | shop | |\n");
  d.pruefe()
    .erwarteCode(1)
    .erwarte("data/zuordnungen/gk.md:10")
    .erwarte('Abteilung "vertrib" unbekannt (meintest du "vertrieb"?)');
});

// Der Vorschlag kommt hier über den Anzeigenamen "Angebot".
mitDatensatz("F2 unbekanntes Objekt", (d) => {
  d.zeilenAnhaengen("| vertrieb | Angebot.erstellen | shop | |\n");
  d.pruefe()
    .erwarteCode(1)
    .erwarte("data/zuordnungen/gk.md:10")
    .erwarte('Objekt "Angebot" unbekannt (meintest du "angebot"?)');
});

mitDatensatz("F3 Objekt bekannt, Aufgabe nicht", (d) => {
  d.zeilenAnhaengen("| vertrieb | angebot.senden | shop | |\n");
  d.pruefe()
    .erwarteCode(1)
    .erwarte("data/zuordnungen/gk.md:10")
    .erwarte(
      'Aufgabe "angebot.senden" unbekannt (Objekt Angebot hat: erstellen, versenden; meintest du "versenden"?)',
    );
});

// Der Fall aus SPEC.md: ausgeschriebener Produktname statt der ID.
mitDatensatz("F4 unbekanntes System", (d) => {
  d.zeilenAnhaengen("| vertrieb | angebot.erstellen | shopsystem | |\n");
  d.pruefe()
    .erwarteCode(1)
    .erwarte("data/zuordnungen/gk.md:10")
    .erwarte('System "shopsystem" unbekannt (meintest du "shop"?)');
});

mitDatensatz("F5 unbekanntes Geschaeftsfeld im Frontmatter", (d) => {
  d.schreibe(
    "data/zuordnungen/gk.md",
    ZUORDNUNGEN.replace("geschaeftsfeld: gk", "geschaeftsfeld: gkx"),
  );
  d.pruefe()
    .erwarteCode(1)
    .erwarte("data/zuordnungen/gk.md:2")
    .erwarte('Geschäftsfeld "gkx" unbekannt (meintest du "gk"?)');
});

mitDatensatz("F6 doppelte ID in einer Stammdatendatei", (d) => {
  d.schreibe(
    "data/systeme.yaml",
    "- id: shop\n  name: Shopsystem\n  status: aktiv\n" +
      "- id: erp\n  name: ERP\n  status: aktiv\n" +
      "- id: shop\n  name: Zweiter Shop\n  status: aktiv\n",
  );
  d.pruefe()
    .erwarteCode(1)
    .erwarte("data/systeme.yaml:7")
    .erwarte('System-ID "shop" ist doppelt (schon in Zeile 1)');
});

mitDatensatz("F6 doppelte Aufgaben-ID innerhalb eines Objekts", (d) => {
  d.schreibe(
    "data/aufgaben.yaml",
    "- id: angebot\n  name: Angebot\n  aufgaben:\n" +
      "    - {id: erstellen, name: erstellen}\n" +
      "    - {id: versenden, name: versenden}\n" +
      "    - {id: erstellen, name: nochmal erstellen}\n" +
      "- id: rechnung\n  name: Rechnung\n  aufgaben:\n" +
      "    - {id: erstellen, name: erstellen}\n",
  );
  d.pruefe()
    .erwarteCode(1)
    .erwarte("data/aufgaben.yaml:6")
    .erwarte(
      'Aufgaben-ID "erstellen" ist doppelt in Objekt "angebot" (schon in Zeile 4)',
    );
});

mitDatensatz("F7 Aufgabenreferenz ohne Punkt", (d) => {
  d.zeilenAnhaengen("| vertrieb | angebot | shop | |\n");
  d.pruefe()
    .erwarteCode(1)
    .erwarte("data/zuordnungen/gk.md:10")
    .erwarte('Aufgabe "angebot" hat keinen Punkt (erwartet wird objekt.aufgabe)');
});

mitDatensatz("F8 Frontmatter fehlt", (d) => {
  d.schreibe(
    "data/zuordnungen/gk.md",
    "# Geschaeftskunden\n\n| Abteilung | Aufgabe | System |\n|---|---|---|\n" +
      "| vertrieb | angebot.erstellen | shop |\n",
  );
  d.pruefe()
    .erwarteCode(1)
    .erwarte("data/zuordnungen/gk.md:1")
    .erwarte("Frontmatter fehlt");
});

mitDatensatz("F8 Frontmatter ohne geschaeftsfeld", (d) => {
  d.schreibe(
    "data/zuordnungen/gk.md",
    ZUORDNUNGEN.replace("geschaeftsfeld: gk", "titel: Geschaeftskunden"),
  );
  d.pruefe().erwarteCode(1).erwarte('Frontmatter enthält kein "geschaeftsfeld:"');
});

mitDatensatz("F9 geschaeftsfelder einer Abteilung zeigt ins Leere", (d) => {
  d.schreibe(
    "data/organisation.yaml",
    ORGANISATION.replace(
      "geschaeftsfelder: [gk]\n    bearbeitet: [angebot]",
      "geschaeftsfelder: [gkx]\n    bearbeitet: [angebot]",
    ),
  );
  d.pruefe()
    .erwarteCode(1)
    .erwarte("data/organisation.yaml:6")
    .erwarte(
      'Abteilung "vertrieb" verweist auf unbekanntes Geschäftsfeld "gkx" (meintest du "gk"?)',
    );
});

mitDatensatz("F9 bearbeitet einer Abteilung zeigt ins Leere", (d) => {
  d.schreibe(
    "data/organisation.yaml",
    ORGANISATION.replace("bearbeitet: [angebot]", "bearbeitet: [angebott]"),
  );
  d.pruefe()
    .erwarteCode(1)
    .erwarte("data/organisation.yaml:6")
    .erwarte(
      '"bearbeitet" von Abteilung "vertrieb" verweist auf unbekanntes Objekt "angebott" (meintest du "angebot"?)',
    );
});

mitDatensatz("F10 Status nicht aus der erlaubten Menge", (d) => {
  d.schreibe(
    "data/systeme.yaml",
    SYSTEME.replace("status: aktiv\n- id: erp", "status: unklar\n- id: erp"),
  );
  d.pruefe()
    .erwarteCode(1)
    .erwarte("data/systeme.yaml:3")
    .erwarte(
      'Status "unklar" von System "shop" ist nicht erlaubt (erlaubt: aktiv, auslaufend, geplant)',
    );
});

mitDatensatz("F10 Status fehlt ganz", (d) => {
  d.schreibe(
    "data/systeme.yaml",
    "- id: shop\n  name: Shopsystem\n- id: erp\n  name: ERP\n  status: aktiv\n",
  );
  d.pruefe()
    .erwarteCode(1)
    .erwarte('System "shop" hat keinen Status (erlaubt: aktiv, auslaufend, geplant)');
});

mitDatensatz("zentral: true wird gelesen und landet im Modell", (d) => {
  d.schreibe(
    "data/organisation.yaml",
    ORGANISATION.replace(
      "    name: Geschaeftskunden\n",
      "    name: Geschaeftskunden\n  - id: zentral\n    name: Zentralfunktion\n    zentral: true\n",
    ),
  );
  d.pruefe().erwarteCode(0);
  d.mache("out/plan.html").erwarteCode(0);
  const html = d.lies("out/plan.html");
  assert(html.includes('"id":"zentral","name":"Zentralfunktion","zentral":true'), html);
  assert(html.includes('"id":"gk","name":"Geschaeftskunden","zentral":false'), html);
});

mitDatensatz("zentral muss true oder false sein", (d) => {
  d.schreibe(
    "data/organisation.yaml",
    ORGANISATION.replace(
      "    name: Geschaeftskunden\n",
      "    name: Geschaeftskunden\n    zentral: ja\n",
    ),
  );
  d.pruefe()
    .erwarteCode(1)
    .erwarte("data/organisation.yaml")
    .erwarte('Feld "zentral" ist kein Wahrheitswert (true oder false)');
});

mitDatensatz("F11 ID verletzt das Muster", (d) => {
  d.schreibe(
    "data/organisation.yaml",
    ORGANISATION.replace("- id: vertrieb", "- id: Vertrieb"),
  );
  d.pruefe()
    .erwarteCode(1)
    .erwarte("data/organisation.yaml:6")
    .erwarte('Abteilungs-ID "Vertrieb" ist ungültig (erlaubt sind nur a-z, 0-9 und -)');
});

mitDatensatz("F11 auch fuer Systeme mit Unterstrich", (d) => {
  d.schreibe("data/systeme.yaml", SYSTEME.replace("- id: erp", "- id: erp_alt"));
  d.pruefe()
    .erwarteCode(1)
    .erwarte('System-ID "erp_alt" ist ungültig (erlaubt sind nur a-z, 0-9 und -)');
});

mitDatensatz("F12 Pflichtspalte einer Zuordnungszeile ist leer", (d) => {
  d.zeilenAnhaengen("| vertrieb | angebot.erstellen |  | fehlendes System |\n");
  d.pruefe()
    .erwarteCode(1)
    .erwarte("data/zuordnungen/gk.md:10")
    .erwarte("Zeile unvollständig, Spalte System ist leer");
});

mitDatensatz("F13 Stammdatendatei fehlt", (d) => {
  d.loesche("data/systeme.yaml");
  d.pruefe().erwarteCode(1).erwarte("data/systeme.yaml").erwarte("Datei fehlt");
});

mitDatensatz("F13 kaputtes YAML", (d) => {
  d.schreibe("data/systeme.yaml", "- id: shop\n  name: Shopsystem\n   status: aktiv\n");
  d.pruefe().erwarteCode(1).erwarte("YAML nicht lesbar");
});

mitOrdner("F13 data-Verzeichnis gibt es gar nicht", (dir) => {
  validate(dir).erwarteCode(1).erwarte('Verzeichnis "data" nicht gefunden');
});

// ---------------------------------------------------------------------------
// Warnungen
// ---------------------------------------------------------------------------

mitDatensatz("W1 exakt doppelte Zeile", (d) => {
  d.zeilenAnhaengen("| vertrieb | angebot.erstellen | shop | |\n");
  d.pruefe()
    .erwarteCode(0)
    .erwarte("data/zuordnungen/gk.md:10")
    .erwarte("Zeile ist exakt doppelt (schon in Zeile 7)");
});

// Gleiche Aufgabe mit anderem System ist gewollte Redundanz, keine Doppelung.
mitDatensatz("W1 andere Systeme sind keine Doppelung", (d) => {
  d.zeilenAnhaengen("| vertrieb | angebot.erstellen | erp | zweiter Weg |\n");
  d.pruefe().erwarteCode(0).erwarteNicht("exakt doppelt");
});

mitDatensatz("W2 Abteilung arbeitet nicht im Geschaeftsfeld", (d) => {
  d.schreibe(
    "data/organisation.yaml",
    ORGANISATION
      .replace(
        "  - id: gk\n    name: Geschaeftskunden\n",
        "  - id: gk\n    name: Geschaeftskunden\n  - id: mp\n    name: Marktplatz\n",
      )
      .replace(
        "    geschaeftsfelder: [gk]\n    bearbeitet: [angebot]",
        "    geschaeftsfelder: [mp]\n    bearbeitet: [angebot]",
      ),
  );
  d.pruefe()
    .erwarteCode(0)
    .erwarte("data/zuordnungen/gk.md:7")
    .erwarte(
      'Abteilung "vertrieb" arbeitet laut organisation.yaml nicht im Geschäftsfeld "gk"',
    );
});

mitDatensatz("W3 Objekt steht nicht in bearbeitet", (d) => {
  d.zeilenAnhaengen("| vertrieb | rechnung.erstellen | erp | |\n");
  d.pruefe()
    .erwarteCode(0)
    .erwarte("data/zuordnungen/gk.md:10")
    .erwarte(
      'Objekt "rechnung" steht nicht in "bearbeitet" von Abteilung "vertrieb" (entweder die Regel ergänzen oder die Zeile ist falsch)',
    );
});

mitDatensatz("W4 System ohne Zuordnung", (d) => {
  d.schreibe(
    "data/systeme.yaml",
    `${SYSTEME}- id: mahn\n  name: Mahnlauf-Tool\n  status: aktiv\n`,
  );
  d.pruefe()
    .erwarteCode(0)
    .erwarte("data/systeme.yaml:7")
    .erwarte('System "mahn" hat keine einzige Zuordnung');
});

mitDatensatz("W5 Abteilung ohne Zuordnung", (d) => {
  d.schreibe(
    "data/organisation.yaml",
    `${ORGANISATION}  - id: mkt\n    name: Marketing\n    geschaeftsfelder: [gk]\n    bearbeitet: [angebot]\n`,
  );
  d.pruefe()
    .erwarteCode(0)
    .erwarte("data/organisation.yaml:14")
    .erwarte('Abteilung "mkt" hat keine einzige Zuordnung');
});

mitDatensatz("W6 auslaufendes System ohne ende", (d) => {
  d.schreibe(
    "data/systeme.yaml",
    SYSTEME.replace("status: aktiv\n- id: erp", "status: auslaufend\n- id: erp"),
  );
  d.pruefe()
    .erwarteCode(0)
    .erwarte("data/systeme.yaml:1")
    .erwarte('System "shop" ist auslaufend, hat aber kein "ende"');
});

mitDatensatz("W6 greift nicht, wenn ende gesetzt ist", (d) => {
  d.schreibe(
    "data/systeme.yaml",
    SYSTEME.replace(
      "status: aktiv\n- id: erp",
      "status: auslaufend\n  ende: 2027\n- id: erp",
    ),
  );
  d.pruefe().erwarteCode(0).erwarteNicht("auslaufend, hat aber kein");
});

// Ohne `bearbeitet` gibt es fuer die Abteilung keine White Spots, nur leere
// Zellen.
mitDatensatz("W7 Abteilung ist fuer kein Objekt zustaendig", (d) => {
  d.schreibe(
    "data/organisation.yaml",
    `${ORGANISATION}  - id: mkt\n    name: Marketing\n    geschaeftsfelder: [gk]\n    bearbeitet: []\n`,
  );
  d.pruefe()
    .erwarteCode(0)
    .erwarte("data/organisation.yaml:14")
    .erwarte('Abteilung "mkt" ist für kein Objekt zuständig');
});

// Damit der Git-Hook nicht wegen Kleinigkeiten blockiert.
mitDatensatz("Warnungen allein geben Exit 0", (d) => {
  d.schreibe(
    "data/systeme.yaml",
    `${SYSTEME}- id: mahn\n  name: Mahnlauf-Tool\n  status: aktiv\n`,
  );
  d.pruefe().erwarteCode(0).erwarte("0 Fehler, 1 Warnung");
});

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

// Mehrere Tabellen je Datei, Freitext dazwischen, uneinheitliche Leerzeichen,
// Kopfzeile in anderer Schreibweise, zusaetzliche und vertauschte Spalten.
mitDatensatz("Parser liest mehrere Tabellen und ignoriert den Rest", (d) => {
  d.schreibe(
    "data/zuordnungen/gk.md",
    `---
geschaeftsfeld: gk
---

# Geschaeftskunden

Freitext, der ignoriert wird. Auch mit | Pipe mittendrin.

## Vertrieb

| ABTEILUNG | Aufgabe | Quelle | System |
|---|---|---|---|
|vertrieb|angebot.erstellen|Interview 3.9.|shop|
|   vertrieb   |   angebot.versenden   |   |   shop   |

Diese Tabelle hat nicht die Pflichtspalten und wird ignoriert:

| System | Kosten |
|---|---|
| shop | 120000 |

## Buchhaltung

| Abteilung | Aufgabe | System | Anmerkung |
|-----------|---------|--------|-----------|
| buchhaltung | rechnung.erstellen | erp | Sammelrechnung |
`,
  );
  d.pruefe().erwarteCode(0).erwarte("1 Datei, 3 Zuordnungen, 0 Fehler, 0 Warnungen");
});

mitDatensatz("Parser fuehrt Dateien mit gleichem Geschaeftsfeld zusammen", (d) => {
  d.schreibe(
    "data/zuordnungen/gk-buchhaltung.md",
    "---\ngeschaeftsfeld: gk\n---\n\n| Abteilung | Aufgabe | System |\n|---|---|---|\n" +
      "| buchhaltung | rechnung.erstellen | erp |\n",
  );
  d.pruefe()
    .erwarteCode(0)
    .erwarte("2 Dateien, 4 Zuordnungen, 0 Fehler, 1 Warnung")
    // Gleiche Zeile in einer anderen Datei bleibt eine Doppelung, die Meldung
    // nennt dann die andere Datei.
    .erwarte("Zeile ist exakt doppelt (schon in data/zuordnungen/gk-buchhaltung.md:7)");
});

// ---------------------------------------------------------------------------
// Beispieldatensätze im Repo
// ---------------------------------------------------------------------------

Deno.test("demo laeuft sauber durch", () => {
  validate(beispiel("demo"))
    .erwarteCode(0)
    .erwarte("3 Dateien, 33 Zuordnungen, 0 Fehler, 0 Warnungen");
});

Deno.test("Tippfehler-Beispiel meldet Datei, Zeile und Vorschlag", () => {
  validate(beispiel("tippfehler"))
    .erwarteCode(1)
    .erwarte(
      'data/zuordnungen/geschaeftskunden.md:16  Fehler   Aufgabe "angebot.senden" unbekannt',
    )
    .erwarte(
      'data/zuordnungen/geschaeftskunden.md:17  Fehler   System "shopsystem" unbekannt (meintest du "shop"?)',
    )
    .erwarte(
      'data/zuordnungen/geschaeftskunden.md:18  Fehler   Abteilung "vertrib" unbekannt (meintest du "vertrieb"?)',
    )
    .erwarte("1 Datei, 6 Zuordnungen, 3 Fehler, 0 Warnungen");
});

// ---------------------------------------------------------------------------
// Platzhalter
// ---------------------------------------------------------------------------

Deno.test("serve ist noch Platzhalter", () => {
  starte(["serve", beispiel("demo")])
    .erwarte("noch nicht implementiert")
    .erwarte("Schritt 3");
});

// ---------------------------------------------------------------------------
// make: eigenständige HTML-Datei mit eingebettetem Modell
// ---------------------------------------------------------------------------

mitDatensatz("make bettet das Modell in die HTML-Datei ein", (d) => {
  d.mache("plan.html")
    .erwarteCode(0)
    .erwarte("1 Datei, 3 Zuordnungen, 0 Fehler, 0 Warnungen")
    .erwarte("plan.html geschrieben");

  const html = d.lies("plan.html");
  assert(!html.includes("<!--MODEL-->"), "der Platzhalter steht noch in der Ausgabe");

  const modell = modellAus(html);
  assertEquals(modell.geschaeftsfelder[0].id, "gk");
  assertEquals(modell.objekte[0].id, "angebot");
  assertEquals(modell.zuordnungen.length, 3);
  assertEquals(modell.zuordnungen[0].system, "shop");
  assertEquals(modell.zuordnungen[0].quelle, "data/zuordnungen/gk.md:7");
  assert(String(modell.generiert).includes("T"));
});

// Fehler blockieren `make`. Es darf dann auch keine halbe Datei entstehen.
mitDatensatz("make bricht bei Fehlern ab und schreibt nichts", (d) => {
  d.zeilenAnhaengen("| vertrieb | angebot.erstellen | shopsystem | |\n");
  d.mache("plan.html")
    .erwarteCode(1)
    .erwarte('System "shopsystem" unbekannt (meintest du "shop"?)')
    .erwarte("abgebrochen");
  assert(!d.gibtEs("plan.html"), "trotz Fehlern geschrieben");
});

// Warnungen halten `make` nicht auf und landen im Modell, damit das Frontend
// sie zeigen kann.
mitDatensatz("make laeuft bei Warnungen weiter und reicht sie durch", (d) => {
  d.schreibe(
    "data/systeme.yaml",
    `${SYSTEME}- id: mahn\n  name: Mahnlauf-Tool\n  status: auslaufend\n`,
  );
  d.mache("plan.html").erwarteCode(0).erwarte("2 Warnungen");

  const warnungen: string[] = modellAus(d.lies("plan.html")).warnungen;
  const zusammen = warnungen.join("\n");
  assert(
    zusammen.includes('System "mahn" hat keine einzige Zuordnung') &&
      zusammen.includes("data/systeme.yaml:7"),
    `unerwartete Warnungen: ${zusammen}`,
  );
});

// Der Deploy schreibt nach `out/index.html`, das Verzeichnis gibt es dort noch
// nicht.
mitDatensatz("make legt das Zielverzeichnis an", (d) => {
  d.mache("out/index.html").erwarteCode(0);
  assert(d.gibtEs("out/index.html"));
});

// Eine Anmerkung darf das Script-Tag mit dem Modell nicht vorzeitig schliessen.
// `modellAus` schneidet am ersten `</script>`; ginge die Maskierung verloren,
// waere der Ausschnitt kein gültiges JSON mehr.
mitDatensatz("make maskiert spitze Klammern im Modell", (d) => {
  d.zeilenAnhaengen(
    "| vertrieb | angebot.versenden | erp | Ende </script><img src=x> |\n",
  );
  d.mache("plan.html").erwarteCode(0);

  const zuordnungen = modellAus(d.lies("plan.html")).zuordnungen;
  assertEquals(
    zuordnungen[zuordnungen.length - 1].anmerkung,
    "Ende </script><img src=x>",
  );
});

// Die erzeugte Datei funktioniert per Doppelklick, also ohne Server und ohne
// Netz. Ein externer Verweis waere ein Rückschritt.
mitOrdner("make laeuft auf dem Demo-Beispiel ohne externe Verweise", (dir) => {
  const ziel = `${dir}/bebauungsplan.html`;
  make(beispiel("demo"), ziel).erwarteCode(0);

  const html = Deno.readTextFileSync(ziel);
  assert(
    !html.includes("http://") && !html.includes("https://"),
    "externer Verweis in der erzeugten Datei",
  );

  const modell = modellAus(html);
  assertEquals(modell.zuordnungen.length, 33);
  assertEquals(modell.warnungen.length, 0);
});

// ---------------------------------------------------------------------------
// Bei null anfangen
// ---------------------------------------------------------------------------

// Ein leeres `data/` ist ein gültiger Startpunkt, kein Fehler. Das Werkzeug ist
// generisch; wer neu anfangen will, leert das Verzeichnis.
mitOrdner("leeres data-Verzeichnis ist ein gueltiger Start", (dir) => {
  Deno.mkdirSync(`${dir}/data/zuordnungen`, { recursive: true });
  validate(dir)
    .erwarteCode(0)
    .erwarte("0 Dateien, 0 Zuordnungen, 0 Fehler, 0 Warnungen")
    .erwarte("Noch keine Daten unter data/");
});

mitOrdner("leeres data-Verzeichnis ohne zuordnungen ist gueltig", (dir) => {
  Deno.mkdirSync(`${dir}/data`, { recursive: true });
  validate(dir).erwarteCode(0).erwarte("0 Dateien, 0 Zuordnungen, 0 Fehler, 0 Warnungen");
});

// Stammdaten ohne Zuordnungen sind ein normaler Zwischenstand.
mitDatensatz("Stammdaten ohne Zuordnungen sind kein Fehler", (d) => {
  d.loesche("data/zuordnungen/gk.md");
  d.pruefe()
    .erwarteCode(0)
    .erwarte("0 Dateien, 0 Zuordnungen, 0 Fehler, 4 Warnungen")
    .erwarte('Abteilung "vertrieb" hat keine einzige Zuordnung');
});

// Eine geleerte YAML-Datei ist gültig und ergibt einfach keine Einträge, statt
// am Parser zu scheitern.
mitDatensatz("geleerte YAML-Datei ist gueltig", (d) => {
  d.schreibe("data/systeme.yaml", "# hier kommen die Systeme rein\n");
  d.pruefe()
    .erwarteCode(1)
    .erwarteNicht("YAML nicht lesbar")
    .erwarte('System "shop" unbekannt');
});

mitDatensatz("voellig leere YAML-Datei ist gueltig", (d) => {
  d.schreibe("data/systeme.yaml", "");
  d.pruefe().erwarteNicht("YAML nicht lesbar");
});

// Auch aus einem leeren `data/` entsteht eine Seite, dann eben eine leere.
mitOrdner("make auf leerem data-Verzeichnis ergibt eine leere Seite", (dir) => {
  Deno.mkdirSync(`${dir}/data/zuordnungen`, { recursive: true });
  const ziel = `${dir}/plan.html`;
  make(dir, ziel)
    .erwarteCode(0)
    .erwarte("0 Dateien, 0 Zuordnungen, 0 Fehler, 0 Warnungen");

  const modell = modellAus(Deno.readTextFileSync(ziel));
  assertEquals(modell.objekte.length, 0);
  assertEquals(modell.zuordnungen.length, 0);
});

// ---------------------------------------------------------------------------
// Vorschläge bei unbekannten IDs
// ---------------------------------------------------------------------------

Deno.test("Levenshtein rechnet richtig", () => {
  assertEquals(levenshtein("", ""), 0);
  assertEquals(levenshtein("shop", "shop"), 0);
  assertEquals(levenshtein("shopp", "shop"), 1);
  assertEquals(levenshtein("shopsystem", "shop"), 6);
  assertEquals(levenshtein("verlängern", "verlaengern"), 2);
});

const SYSTEMLISTE = [
  { id: "shop", name: "Shopsystem" },
  { id: "erp", name: "ERP" },
];

Deno.test("Vorschlag findet ueber den Anzeigenamen", () => {
  assertEquals(vorschlag("shopsystem", SYSTEMLISTE), "shop");
});

Deno.test("Vorschlag findet ueber die ID", () => {
  assertEquals(vorschlag("erp2", SYSTEMLISTE), "erp");
});

Deno.test("Vorschlag schweigt, wenn nichts passt", () => {
  assertEquals(vorschlag("navision", SYSTEMLISTE), null);
});
