# bplan – Bebauungsplan als Textdateien

Ein Kommandozeilenwerkzeug, das aus versionierten Textdateien einen
interaktiven Bebauungsplan (Aufgabe × Abteilung → System) rendert.
Ziel: zeigen, wo mehrere Systeme dieselbe Aufgabe erledigen (Redundanz)
und wo eine zuständige Abteilung keinen Weg hat (White Spot).

## Grundsätze

- Die Daten sind Textdateien in einem Git-Repo. Git ist die Historie.
  Es gibt keine Datenbank und keinen Schreibpfad über die Weboberfläche.
- Die Dateien sind so gebaut, dass ein Mensch und ein LLM sie ohne
  Werkzeug lesen und ändern können. Markdown-Tabellen für die Masse,
  YAML für Stammdaten mit Attributen.
- Das Tool läuft ohne Installation und ohne Adminrechte, direkt aus dem
  öffentlichen Repo. Kein Kompilieren, keine fertigen Binaries. Läuft auf
  Windows, macOS, Linux.
- Beim Lauf greift es nur auf die Datendateien zu, nicht nach außen.
- Das Frontend ist eine einzige HTML-Datei, die als Text-Import zum
  Modulgraphen gehört. Keine Build-Toolchain für JS, keine externen CDNs
  zur Laufzeit (Schriften eingebettet oder System-Fallback).

## Kommandos

```
bplan validate [PFAD]        prüft die Datendateien, Exit-Code 0/1
bplan serve    [PFAD] [--port 8080] [--open]
                             lokaler Webserver, liest bei jedem Request neu
bplan make     [PFAD] [-o bebauungsplan.html]
                             erzeugt eine eigenständige HTML-Datei
```

`PFAD` ist das Verzeichnis mit `data/`, Default ist das aktuelle
Verzeichnis. Alle drei Kommandos laufen zuerst `validate`; `serve` und
`make` brechen bei Fehlern ab, zeigen Warnungen aber nur an.

### validate

Liest alle Dateien, baut das Modell, prüft die Regeln (siehe unten),
gibt Fehler und Warnungen mit Datei und Zeilennummer aus:

```
data/zuordnungen/geschaeftskunden.md:14  Fehler   System "shopsystem" unbekannt (meintest du "shop"?)
data/zuordnungen/marktplatz.md:9         Fehler   Aufgabe "Angebot.senden" unbekannt (Objekt Angebot hat: erstellen, versenden, ...)
data/organisation.yaml                   Warnung  Abteilung "mkt" ist für kein Objekt zuständig
3 Dateien, 212 Zuordnungen, 2 Fehler, 1 Warnung
```

Fehler → Exit 1. Nur Warnungen → Exit 0. Gedacht als Git-Hook und
als Rückmeldung an ein LLM, das die Dateien editiert hat.

### serve

Startet einen HTTP-Server auf `127.0.0.1:PORT` (nur localhost, bewusst).

- `GET /` liefert das eingebettete Frontend.
- `GET /api/model` liefert das Modell als JSON (Schema unten). Wird bei
  jedem Aufruf frisch aus den Dateien gebaut, damit Datei speichern und
  Browser neu laden reicht. Bei Validierungsfehlern kommt HTTP 422 mit
  der Fehlerliste, das Frontend zeigt sie an.
- `--open` öffnet den Browser.

Kein Live-Reload nötig, kein Websocket. Neu laden reicht.

### make

Baut das Modell, serialisiert es als JSON, bettet es in die
Frontend-HTML ein (`<script id="model" type="application/json">`) und
schreibt eine einzelne Datei. Diese Datei ist per Mail verschickbar,
in SharePoint ablegbar und funktioniert per Doppelklick ohne Server.
Das Frontend prüft: gibt es das eingebettete Modell, nimm es; sonst
hole `/api/model`.

## Datenformat

```
data/
  systeme.yaml
  organisation.yaml
  aufgaben.yaml
  zuordnungen/
    <geschaeftsfeld>.md      eine Datei je Geschäftsfeld
```

Alle IDs sind kurze Kleinbuchstaben-Kürzel (`[a-z0-9-]+`), die
Anzeigenamen stehen daneben. In den Zuordnungen werden nur IDs
verwendet, damit Tippfehler beim Validieren auffallen.

### systeme.yaml

```yaml
- id: shop
  name: Shopsystem
  verantwortlich: E-Commerce        # optional, Freitext
  status: aktiv                     # aktiv | auslaufend | geplant
  seit: 2019                        # optional
  ende: 2027                        # optional, sinnvoll bei auslaufend
  notiz: nur Privatkunden           # optional
```

Lebenszyklus ist bewusst nur das: ein Status und zwei Jahreszahlen.

### organisation.yaml

```yaml
geschaeftsfelder:
  - id: pk
    name: Privatkunden
  - id: gk
    name: Geschaeftskunden

abteilungen:
  - id: vertrieb
    name: Vertrieb
    geschaeftsfelder: [pk, gk]      # in welchen Säulen die Abteilung arbeitet
    bearbeitet: [angebot, bestellung, rechnung, kunde]
                                    # für welche Objekte sie zuständig ist
```

`bearbeitet` ist die Zuständigkeitsregel. Ohne sie gibt es keine White
Spots, nur leere Zellen. Eine Abteilung × Aufgabe ohne Zuordnung ist
ein White Spot genau dann, wenn das Objekt in `bearbeitet` steht.

### aufgaben.yaml

```yaml
- id: angebot
  name: Angebot
  aufgaben:
    - id: erstellen
      name: erstellen
    - id: versenden
      name: versenden
    - id: nachfassen
      name: nachfassen
- id: rechnung
  name: Rechnung
  aufgaben:
    - {id: erstellen, name: erstellen}
    - {id: mahnen, name: mahnen}
```

Zwei Ebenen, nicht mehr. Objekt und Aufgabe zusammen ergeben die
Capability, referenziert als `objekt.aufgabe` (z. B. `angebot.erstellen`).

### zuordnungen/<geschaeftsfeld>.md

```markdown
---
geschaeftsfeld: gk
---

# Geschaeftskunden

Freitext ist erlaubt und wird ignoriert. Nur Tabellen mit den
Spalten unten werden gelesen.

| Abteilung | Aufgabe            | System | Anmerkung                      |
|-----------|--------------------|--------|--------------------------------|
| vertrieb  | angebot.erstellen  | crm    | Standardweg seit 2021          |
| vertrieb  | angebot.erstellen  | excel  | Sonderkalkulation Rahmenpreise |
| service   | angebot.erstellen  | shop   | Angebot aus dem Shop           |
| service   | angebot.erstellen  | mail   | historisch, wird noch genutzt  |
```

Regeln für den Parser:

- Das Frontmatter `geschaeftsfeld:` ist Pflicht und muss eine ID aus
  `organisation.yaml` sein.
- Jede Markdown-Tabelle mit mindestens den Kopfspalten `Abteilung`,
  `Aufgabe`, `System` wird gelesen. `Anmerkung` ist optional. Weitere
  Spalten werden ignoriert. Groß-/Kleinschreibung der Kopfzeile egal.
- Eine Zeile = ein Weg. Dieselbe Abteilung + Aufgabe mit mehreren Zeilen
  = mehrere Wege = Redundanz.
- Leerzeichen um `|` egal. Zeilen, die nicht in eine Tabelle gehören,
  werden ignoriert.
- Mehrere Tabellen in einer Datei sind erlaubt (z. B. eine je Abteilung,
  wenn das beim Interview praktischer ist).

## Validierung

Fehler (blockieren serve/make):

- Unbekannte ID in Zuordnung (Abteilung, Aufgabe, System, Geschäftsfeld)
- Doppelte ID innerhalb einer Stammdatendatei
- Aufgabe ohne Punkt oder mit unbekanntem Objekt
- Frontmatter fehlt oder Geschäftsfeld unbekannt
- `bearbeitet` oder `geschaeftsfelder` einer Abteilung referenziert
  eine unbekannte ID
- Status eines Systems nicht aus der erlaubten Menge

Warnungen:

- Exakt doppelte Zeile (Abteilung, Aufgabe, System, Geschäftsfeld)
- Zuordnung für eine Abteilung in einem Geschäftsfeld, in dem sie laut
  `organisation.yaml` nicht arbeitet
- Zuordnung für ein Objekt, das nicht in `bearbeitet` der Abteilung steht
  (Hinweis: entweder die Regel ergänzen oder die Zeile ist falsch)
- System ohne einzige Zuordnung
- Abteilung ohne einzige Zuordnung
- `auslaufend` ohne `ende`

Bei unbekannten IDs einen Vorschlag mit dem ähnlichsten bekannten Wert
ausgeben (Levenshtein-Distanz ≤ 3).

## Modell (JSON für das Frontend)

```json
{
  "generiert": "2026-09-12T14:03:00",
  "geschaeftsfelder": [{"id":"gk","name":"Geschaeftskunden"}],
  "abteilungen": [{"id":"vertrieb","name":"Vertrieb","geschaeftsfelder":["pk","gk"],"bearbeitet":["angebot"]}],
  "systeme": [{"id":"crm","name":"CRM","status":"aktiv","verantwortlich":"Vertrieb","seit":2021,"ende":null}],
  "objekte": [{"id":"angebot","name":"Angebot","aufgaben":[{"id":"erstellen","name":"erstellen"}]}],
  "zuordnungen": [
    {"gf":"gk","abteilung":"vertrieb","objekt":"angebot","aufgabe":"erstellen","system":"crm","anmerkung":"Standardweg seit 2021","quelle":"data/zuordnungen/geschaeftskunden.md:14"}
  ],
  "warnungen": ["..."]
}
```

`quelle` ist Datei und Zeile, damit das Frontend bei jedem Weg zeigen
kann, wo er herkommt. Alle Kennzahlen (Redundanz, White Spots, max je
Zelle) berechnet das Frontend selbst aus den Rohdaten; das Werkzeug
liefert nur das validierte Modell. So bleibt die Logik an einer Stelle.

## Frontend

Eine HTML-Datei, Vanilla JS, keine Frameworks. Optik wie Mockup 3,
Variante B (Explorer). Referenz: `mockups/bebauungsplan-mockup-3.html`.

Layout:

- Kopf: Titel, Stand, Anzahl Objekte/Aufgaben/Zuordnungen
- Filterleiste: Geschäftsfeld (Alle + je eins), Schalter
  "nur Auffälligkeiten"
- Links: Baum. Wurzel "Alle Objekte", darunter Objekte, darunter
  Aufgaben. Auf-/Zuklappen je Objekt, ein Knopf rechts in der
  Wurzelzeile klappt alle auf oder zu. Badge je Knoten: Anzahl
  Redundanzen rot, sonst Anzahl White Spots grau, sonst nichts.
  Suchfeld über dem Baum, filtert Knoten nach Objekt- oder
  Aufgabenname, Treffer werden aufgeklappt.
- Rechts: Inhalt der gewählten Ebene.

Die drei Ebenen:

1. **Alle Objekte**: Tabelle Objekt × Abteilung. Zelle zeigt den
   höchsten Redundanzwert der Aufgaben darunter und "N offen" für
   White Spots. Zellen für nicht zuständige Abteilungen hellgrau.
   Klick auf Zeile oder Zelle → Ebene 2.
2. **Objekt**: Tabelle Aufgabe × zuständige Abteilungen. Zelle zeigt die
   System-Chips. Klick → Ebene 3.
3. **Aufgabe**: Tabelle Abteilung × Geschäftsfeld, nur die zuständigen
   Abteilungen und die Geschäftsfelder, in denen eine davon arbeitet.
   Zelle zeigt die System-Chips mit Anmerkung daneben, die Quelle
   (Datei:Zeile) im Tooltip des Chips. Leere Zelle = White Spot, "offen".
   Die Zeile bilanziert über alle Spalten wie die Kennzahlen: "1 System",
   "2 Systeme · redundant" oder "offen".

Farbcode überall gleich: 1 System grün, 2 gelb, 3+ rot, White Spot
schraffiert. System-Chips: aktiv voll, auslaufend gestrichelt, geplant
gepunktet.

Definitionen, die das Frontend berechnet:

- Wege einer Zelle (Aufgabe × Abteilung, im aktuellen Filter):
  Anzahl verschiedener Systeme über alle gefilterten Geschäftsfelder.
- Redundanz: Wege ≥ 2.
- White Spot: Wege = 0 und Objekt in `bearbeitet` der Abteilung und
  Abteilung arbeitet in mindestens einem gefilterten Geschäftsfeld.
- Objekt-Zelle (Ebene 1): max der Wege über die Aufgaben, plus
  Anzahl White Spots.

Nicht-Ziele für Version 1: Editieren im Browser, Nutzerverwaltung,
Schnittstellen zwischen Systemen, Kosten, Export nach PowerPoint (das
macht `make` plus Screenshot).

## Technik

- TypeScript für Deno, ohne Build-Schritt. Aufgerufen wird direkt die
  URL einer Datei im öffentlichen Repo, festgenagelt auf ein Tag.
- Einzige Abhängigkeit ist `@std/yaml`, voll qualifiziert importiert.
  Eine Import-Map gilt beim Aufruf über eine URL nicht.
- Argumente selbst gelesen, es sind drei Kommandos und drei Optionen.
- Markdown-Tabellen selbst parsen (Zeilen mit `|` splitten, Kopfzeile
  erkennen, Trennzeile überspringen). Kein Markdown-Paket nötig.
- Frontmatter: Block zwischen zwei `---` am Dateianfang, als YAML.
- Webserver: `Deno.serve`, nur zwei Routen, bindet ausschließlich an
  127.0.0.1. Derselbe Handler bedient später auch den Worker im Deploy.
- Frontend per Text-Import (`with { type: "text" }`) eingebunden. Damit
  lädt und cacht Deno die HTML-Datei zusammen mit dem Code, auch beim
  Aufruf über eine URL. `make` ersetzt darin den Platzhalter
  `<!--MODEL-->` durch das JSON.
- Fehlerausgabe mit Datei:Zeile, farbig wenn TTY.
- Tests: ein Beispieldatensatz unter `examples/`, Tests für Parser
  und jede Validierungsregel, gefahren über die aufgerufene CLI.

## Repo-Struktur

```
bplan/
  deno.json
  cli.ts             Kommandos, Argumente, Ausgabe
  src/
    model.ts         Datenstrukturen, JSON-Schema
    befund.ts        ein Fehler oder eine Warnung mit Fundstelle
    parse.ts         YAML + Markdown-Tabellen + Frontmatter
    validate.ts      Regeln, Fehler/Warnungen mit Positionen
    make.ts
    serve.ts
  frontend/
    index.html       das komplette Frontend
  tests/
    regeln_test.ts   ein Testfall je Regel
  examples/
    demo/data/...    Beispieldatensatz (siehe data/ in diesem Ordner)
  mockups/
    bebauungsplan-mockup-3.html
  SPEC.md
```

Die echten Daten leben in einem eigenen Repo mit nur `data/`, nicht
im Tool-Repo. Das Tool ist generisch.

## Arbeitsweise mit Claude Code

Reihenfolge, die sich anbietet:

1. `model.ts` + `parse.ts` + `validate` mit dem Beispieldatensatz,
   bis `bplan validate examples/demo` sauber läuft und jede Regel einen
   Testfall hat.
2. `make` mit dem Mockup-Frontend, umgebaut auf das JSON-Modell.
3. `serve`.
4. Suchfeld und "nur Auffälligkeiten" im Frontend.

Pflege der echten Daten später im Interview-Stil: Gesprächsnotizen an
Claude Code, das schreibt Tabellenzeilen, `bplan validate` prüft,
Commit.
