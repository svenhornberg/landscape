# Syntax der Datendateien

Diese Seite erklärt, wie das Verzeichnis `data/` aufgebaut sein muss, damit
`bplan validate` es annimmt und `bplan make` daraus den Bebauungsplan baut.
Sie ist für Menschen und für Assistenten wie Copilot, Claude oder ChatGPT
geschrieben, die Dateien darin anlegen oder ändern. Alles hier ist die
Wahrheit des Parsers in `src/parse.ts` und der Regeln in `src/validate.ts`;
der Hintergrund steht in `SPEC.md`.

Die Beispiele verwenden einen erfundenen Versandhandel. Echte Daten liegen
in einem eigenen, privaten Repo, das nur `data/` und seinen Deploy enthält.

## Überblick

```
data/
  systeme.yaml           Systeme: ID, Name, Status, Lebenszyklus
  organisation.yaml      Geschäftsfelder und Abteilungen
  aufgaben.yaml          Objekte mit ihren Aufgaben
  zuordnungen/
    <beliebig>.md        Tabellen: welche Abteilung erledigt welche Aufgabe
                         mit welchem System, eine Datei je Geschäftsfeld
```

Das Modell dahinter: Eine **Aufgabe** gehört zu einem **Objekt**
(`angebot.erstellen`). Eine **Abteilung** ist für Objekte zuständig
(`bearbeitet`) und arbeitet in bestimmten **Geschäftsfeldern**. Eine
**Zuordnung** sagt: In diesem Geschäftsfeld erledigt diese Abteilung diese
Aufgabe mit diesem **System**. Mehrere Zuordnungen für dieselbe Aufgabe und
Abteilung sind Redundanz, keine ist ein White Spot.

Der Aufruf, vom Verzeichnis aus, das `data/` enthält:

```bash
BPLAN=https://raw.githubusercontent.com/svenhornberg/landscape/dd054c809450e97ce2736f9494ea294ffd847d76/cli.ts
deno run --allow-read --allow-write "$BPLAN" validate .
deno run --allow-read --allow-write "$BPLAN" make . -o out/index.html
```

Der Commit-Hash in der URL ist der Stand des Werkzeugs; welcher gilt, steht
in `README.md`. Ein leeres `data/` ist gültig, ein Neustart mit Exit 0.

## IDs

- Jede ID passt auf `[a-z0-9-]+`: Kleinbuchstaben, Ziffern, Bindestrich.
  Keine Umlaute, keine Großbuchstaben, keine Unterstriche, keine Leerzeichen.
- Der Anzeigename steht daneben unter `name` und darf alles enthalten.
- In den Zuordnungen stehen ausschließlich IDs, nie Anzeigenamen. Tippfehler
  fallen so beim Validieren auf, mit Vorschlag.
- IDs sind je Liste eindeutig: einmal unter den Geschäftsfeldern, einmal unter
  den Abteilungen, einmal unter den Systemen, einmal unter den Objekten, und
  Aufgaben-IDs einmal je Objekt. Dieselbe ID darf in zwei Listen vorkommen
  (`service` als Abteilung und `service` als Objekt), das ist erlaubt, aber
  unübersichtlich.
- Die Reihenfolge in den Dateien ist die Reihenfolge in der Oberfläche.

## systeme.yaml

Eine YAML-Liste. Pflicht sind `id`, `name` und `status`.

```yaml
- id: shop
  name: Shopsystem
  verantwortlich: E-Commerce        # optional, Freitext
  status: aktiv                     # Pflicht: aktiv | auslaufend | geplant
  seit: 2019                        # optional, Jahreszahl
  ende: 2027                        # optional, Jahreszahl; erwartet bei auslaufend
  notiz: nur Privatkunden           # optional, Freitext, erscheint im Tooltip
- id: excel
  name: Excel
  status: aktiv
```

- `status` kennt genau drei Werte. Alles andere ist ein Fehler (F10).
- `auslaufend` ohne `ende` gibt eine Warnung (W6).
- Ein System ohne einzige Zuordnung gibt eine Warnung (W4).
- Kommentare mit `#` sind erlaubt. Eine Datei, die nur Kommentare enthält
  oder leer ist, ergibt null Systeme, keinen Fehler.

## organisation.yaml

Ein YAML-Dokument mit zwei Listen, `geschaeftsfelder` und `abteilungen`.

```yaml
geschaeftsfelder:
  - id: pk
    name: Privatkunden
  - id: gk
    name: Geschaeftskunden

  - id: zentral
    name: Zentralfunktion
    zentral: true                            # optional, Standard false

abteilungen:
  - id: vertrieb
    name: Vertrieb
    geschaeftsfelder: [gk]                   # in welchen Geschäftsfeldern
    bearbeitet: [angebot, bestellung, kunde] # für welche Objekte zuständig
  - id: buchhaltung
    name: Buchhaltung
    geschaeftsfelder: [zentral]              # einmal für alle
    bearbeitet: [rechnung, kunde]
```

- `geschaeftsfelder` einer Abteilung: Liste von Geschäftsfeld-IDs. Nur dort
  erscheint die Abteilung, und nur dort dürfen ihre Zuordnungen stehen (W2).
  Steht eine Abteilung in mehreren Geschäftsfeldern, ist sie dort jeweils
  ein eigenes Team; die Zelle Abteilung × Geschäftsfeld in Ebene 3 ist dieses
  Team.
- `bearbeitet`: Liste von Objekt-IDs. Das ist die Zuständigkeitsregel. Für
  jede Aufgabe eines Objekts in `bearbeitet` erwartet der Plan eine
  Zuordnung; fehlt sie, ist das ein White Spot ("offen"). Eine Zuordnung für
  ein Objekt, das nicht in `bearbeitet` steht, gibt eine Warnung (W3).
- Beide Listen dürfen nur bekannte IDs enthalten (F9). `bearbeitet` leer
  gibt eine Warnung (W7), eine Abteilung ohne einzige Zuordnung auch (W5).
- `zentral: true` an einem Geschäftsfeld macht es zur Zentralfunktion: Die
  Abteilungen darin gibt es einmal für alle, ihre Zuordnungen stehen einmal
  in der Datei dieses Geschäftsfelds und zählen in jedem Filter mit. Als
  eigener Filter gewählt zeigt es nur diese Abteilungen. Der Wert muss
  `true` oder `false` sein, sonst bricht das Lesen ab. Eine Abteilung, die
  zentral ist, steht nur in zentralen Geschäftsfeldern.
- Die YAML-Kurzschreibweise `[a, b]` und die lange mit `- a` sind gleich.

## aufgaben.yaml

Eine YAML-Liste von Objekten, jedes mit einer Liste `aufgaben`. Genau zwei
Ebenen, nicht mehr.

```yaml
- id: angebot
  name: Angebot
  aufgaben:
    - {id: erstellen, name: erstellen}
    - {id: versenden, name: versenden}
    - {id: nachfassen, name: nachfassen}
- id: kunde
  name: Kunde
  aufgaben:
    - id: anlegen
      name: anlegen
    - id: bonitaet
      name: Bonität prüfen
```

- Objekt und Aufgabe zusammen sind die Capability und werden als
  `objekt.aufgabe` referenziert, zum Beispiel `kunde.bonitaet`.
- Aufgaben-IDs müssen nur innerhalb ihres Objekts eindeutig sein;
  `erstellen` darf bei Angebot und bei Rechnung vorkommen.
- Aufgabennamen sind Verben in der Grundform, klein geschrieben, Objektnamen
  Substantive. Das ist Konvention, keine Regel.
- Ein Objekt ohne Aufgaben ist erlaubt und erscheint mit dem Hinweis "hat
  noch keine Aufgaben".

## zuordnungen/*.md

Jede Datei im Verzeichnis `zuordnungen/` mit Endung `.md` wird gelesen. Der
Dateiname ist frei; üblich ist der Name des Geschäftsfelds. Mehrere Dateien
dürfen dasselbe Geschäftsfeld tragen, ihre Zeilen werden zusammengeführt.

```markdown
---
geschaeftsfeld: gk
---

# Geschaeftskunden

Freitext ist erlaubt und wird ignoriert, auch Überschriften und Listen.

| Abteilung   | Aufgabe            | System | Anmerkung                     |
|-------------|--------------------|--------|-------------------------------|
| vertrieb    | angebot.erstellen  | crm    | Standardweg seit 2021         |
| vertrieb    | angebot.erstellen  | excel  | Sonderkalkulation, Rahmenpreise |
| buchhaltung | rechnung.erstellen | erp    |                               |
```

### Frontmatter

- Die Datei beginnt, nach eventuellen Leerzeilen, mit einer Zeile `---`,
  dann YAML, dann wieder `---`. Fehlt der Block oder das zweite `---`, ist
  das ein Fehler (F8).
- Pflicht ist `geschaeftsfeld: <id>` mit einer ID aus `organisation.yaml`
  (sonst F5). Weitere Schlüssel im Frontmatter werden ignoriert.

### Tabellen

- Eine Tabelle beginnt mit einer Kopfzeile, die mit `|` anfängt, gefolgt von
  einer Trennzeile aus `-` (auch `:---:` für Ausrichtung). Danach jede Zeile,
  die mit `|` anfängt, bis zur ersten Zeile ohne `|` am Anfang.
- Die Kopfzeile muss die Spalten `Abteilung`, `Aufgabe` und `System`
  enthalten, Groß- und Kleinschreibung egal, Reihenfolge egal. `Anmerkung`
  ist optional. Weitere Spalten werden ignoriert. Eine Tabelle ohne die drei
  Pflichtspalten wird komplett ignoriert, ohne Meldung.
- Zellen werden durch `|` getrennt, Leerzeichen um `|` sind egal, führendes
  und abschließendes `|` sind üblich, aber nicht nötig. Ein `|` innerhalb
  einer Zelle ist nicht möglich.
- `Abteilung`: eine Abteilungs-ID (sonst F1). `Aufgabe`: `objekt.aufgabe`
  mit Punkt (ohne Punkt F7, unbekanntes Objekt F2, unbekannte Aufgabe F3).
  `System`: eine System-ID (sonst F4). `Anmerkung`: Freitext, erscheint in
  Ebene 3 neben dem System und darf leer sein.
- Eine leere Pflichtzelle ist ein Fehler (F12). Eine exakt doppelte Zeile,
  gleiche Abteilung, Aufgabe, System und Geschäftsfeld, gibt eine Warnung
  (W1).
- Mehrere Tabellen je Datei sind erlaubt, zum Beispiel eine je Abteilung.
- Jede Zeile ist ein Weg. Zwei Zeilen mit derselben Abteilung und Aufgabe,
  aber verschiedenen Systemen, sind zwei Wege: redundant. Dieselbe Zeile in
  zwei Geschäftsfeldern ist ein Weg je Geschäftsfeld.
- Das Werkzeug merkt sich je Zeile die Fundstelle `datei:zeile` und zeigt
  sie im Tooltip des System-Chips.

## Was der Plan daraus rechnet

- **Zuständig** ist eine Abteilung für eine Aufgabe, wenn das Objekt in
  ihrem `bearbeitet` steht und sie im gefilterten Geschäftsfeld arbeitet.
  Der Filter ist das gewählte Geschäftsfeld plus alle zentralen.
- **Wege** einer Zelle (Aufgabe × Abteilung) sind die verschiedenen Systeme
  über alle gefilterten Geschäftsfelder.
- **1 System** grün, **2 Systeme** gelb und redundant, **3 und mehr** rot.
- **White Spot**, im Plan "offen": zuständig, aber kein Weg.
- **Nicht zuständig**: graue Zelle, kein Befund.

Nichts davon steht in den Daten. Wer eine Redundanz beheben will, entfernt
eine Zeile; wer einen White Spot schließen will, ergänzt eine.

## Prüfregeln

Fehler brechen `validate` mit Exit 1 ab, `make` schreibt dann nichts.
Warnungen werden gemeldet und im Plan angezeigt, der Build läuft weiter.

| Regel | Bedeutung                                                            |
|-------|----------------------------------------------------------------------|
| F1    | Unbekannte Abteilung in einer Zuordnung                              |
| F2    | Unbekanntes Objekt in einer Aufgabenreferenz                         |
| F3    | Unbekannte Aufgabe innerhalb eines bekannten Objekts                 |
| F4    | Unbekanntes System in einer Zuordnung                                |
| F5    | Unbekanntes Geschäftsfeld im Frontmatter                             |
| F6    | Doppelte ID innerhalb einer Liste                                    |
| F7    | Aufgabenreferenz ohne Punkt                                          |
| F8    | Frontmatter fehlt oder ist unvollständig                             |
| F9    | `bearbeitet` oder `geschaeftsfelder` nennt eine unbekannte ID        |
| F10   | Status eines Systems fehlt oder ist nicht aktiv/auslaufend/geplant   |
| F11   | ID verletzt das Muster `[a-z0-9-]+`                                  |
| F12   | Zuordnungszeile mit leerer Pflichtspalte                             |
| F13   | Datei fehlt, obwohl andere da sind, oder YAML ist kaputt             |
| W1    | Exakt doppelte Zuordnungszeile                                       |
| W2    | Zuordnung in einem Geschäftsfeld, in dem die Abteilung nicht arbeitet|
| W3    | Zuordnung für ein Objekt, das nicht in `bearbeitet` steht            |
| W4    | System ohne einzige Zuordnung                                        |
| W5    | Abteilung ohne einzige Zuordnung                                     |
| W6    | `auslaufend` ohne `ende`                                             |
| W7    | Abteilung ist für kein Objekt zuständig (`bearbeitet` leer)          |

Bei unbekannten IDs schlägt `validate` den ähnlichsten bekannten Wert vor,
verglichen mit ID und Anzeigename:

```
data/zuordnungen/gk.md:17  Fehler  System "shopsystem" unbekannt (meintest du "shop"?)
```

## Rezepte

**Neues System.** Erst in `systeme.yaml` mit `status`, dann Zeilen in den
Zuordnungen. Andersherum meldet `validate` F4.

**Neue Abteilung.** In `organisation.yaml` mit `geschaeftsfelder` und
`bearbeitet`. Ohne Zeilen erscheint sie im Plan überall als offen und mit W5;
das ist ein normaler Zwischenstand vor dem Interview.

**Neues Objekt oder neue Aufgabe.** In `aufgaben.yaml` eintragen, dann bei
den zuständigen Abteilungen in `bearbeitet` ergänzen, sonst gibt es dafür
keine White Spots, nur graue Zellen.

**Neues Geschäftsfeld.** In `organisation.yaml` unter `geschaeftsfelder`,
dann bei den Abteilungen, die dort arbeiten, in `geschaeftsfelder`, dann eine
Datei `zuordnungen/<name>.md` mit Frontmatter. Eine Tabelle nur mit Kopf- und
Trennzeile ist gültig und ergibt null Zeilen.

**Gesprächsnotiz in Zeilen übersetzen.** "Der Vertrieb macht Angebote im
CRM, Sonderkalkulationen in Excel" wird zu zwei Zeilen mit derselben
Abteilung und Aufgabe und verschiedenen Systemen; die Anmerkung nennt den
Grund. Was die Abteilung nicht tut, bekommt keine Zeile. Fragen und offene
Punkte gehören als Freitext unter die Tabelle, nicht in die Anmerkung.

**Umbenennen.** Den Anzeigenamen unter `name` ändern; die ID bleibt, damit
die Zuordnungen weiter passen. Eine ID ändern heißt, sie überall ändern;
`validate` findet jede vergessene Stelle.

## Vollständiges Minimalbeispiel

Vier Dateien, gültig, ohne Warnungen:

```yaml
# data/systeme.yaml
- id: erp
  name: ERP
  status: aktiv
```

```yaml
# data/organisation.yaml
geschaeftsfelder:
  - id: gk
    name: Geschaeftskunden
abteilungen:
  - id: buchhaltung
    name: Buchhaltung
    geschaeftsfelder: [gk]
    bearbeitet: [rechnung]
```

```yaml
# data/aufgaben.yaml
- id: rechnung
  name: Rechnung
  aufgaben:
    - {id: erstellen, name: erstellen}
```

```markdown
---
geschaeftsfeld: gk
---

| Abteilung   | Aufgabe            | System | Anmerkung |
|-------------|--------------------|--------|-----------|
| buchhaltung | rechnung.erstellen | erp    |           |
```

Ein größeres, ebenfalls gültiges Beispiel liegt unter `examples/demo/data/`,
ein absichtlich fehlerhaftes unter `examples/tippfehler/data/`.
