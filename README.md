# bplan

Ein Kommandozeilenwerkzeug, das aus versionierten Textdateien einen
interaktiven Bebauungsplan (Aufgabe × Abteilung → System) rendert. Es zeigt,
wo mehrere Systeme dieselbe Aufgabe erledigen (Redundanz) und wo eine
zuständige Abteilung keinen Weg hat (White Spot).

Die vollständige Spezifikation steht in [SPEC.md](SPEC.md).

## Stand

| Kommando         | Status                                        |
|------------------|-----------------------------------------------|
| `bplan validate` | fertig                                        |
| `bplan make`     | fertig                                        |
| `bplan serve`    | Platzhalter, Schritt 3                        |

## Benutzen

Es gibt nichts zu installieren und nichts zu bauen. Gebraucht wird
[Deno](https://deno.com), danach genügt das eigene Datenverzeichnis:

```bash
cd mein-datenrepo

deno run --allow-read --allow-write \
  https://raw.githubusercontent.com/svenhornberg/landscape/v0.2.0/cli.ts \
  validate .
```

Deno lädt den Quelltext beim ersten Aufruf und hat ihn danach im Cache; die
folgenden Läufe brauchen kein Netz. Die URL zeigt auf ein Tag, damit eine
Änderung hier nicht unbemerkt das Ergebnis anderswo verschiebt.

Wer es öfter braucht, legt sich einen Kurzbefehl an:

```bash
deno install -g --allow-read --allow-write --name bplan \
  https://raw.githubusercontent.com/svenhornberg/landscape/v0.2.0/cli.ts

bplan validate
bplan make -o bebauungsplan.html
```

Fertige Binaries gibt es bewusst nicht, weder als Release noch im Repo.
Ausgeführt wird immer der Quelltext, lokal wie in der CI.

## Am Repo arbeiten

```bash
git clone https://github.com/svenhornberg/landscape.git
cd landscape

deno task demo          # läuft sauber durch
deno task tippfehler    # meldet Tippfehler mit Zeile und Vorschlag
deno task pruefe        # check, lint, fmt und alle Tests
```

So sieht die Ausgabe bei Tippfehlern aus:

```
data/zuordnungen/geschaeftskunden.md:16  Fehler   Aufgabe "angebot.senden" unbekannt (Objekt Angebot hat: erstellen, versenden; meintest du "versenden"?)
data/zuordnungen/geschaeftskunden.md:17  Fehler   System "shopsystem" unbekannt (meintest du "shop"?)
data/zuordnungen/geschaeftskunden.md:18  Fehler   Abteilung "vertrib" unbekannt (meintest du "vertrieb"?)
1 Datei, 6 Zuordnungen, 3 Fehler, 0 Warnungen
```

Fehler ergeben Exit-Code 1, Warnungen allein Exit-Code 0. Damit taugt
`bplan validate` als Git-Hook und als Rückmeldung an ein LLM, das die Dateien
editiert hat.

## Die HTML-Datei

```bash
bplan make PFAD [-o bebauungsplan.html]
```

`make` prüft zuerst die Daten. Fehler brechen ab, Warnungen werden nur
angezeigt. Danach schreibt es eine einzelne HTML-Datei mit dem Modell darin:
kein Server, kein Netzzugriff, per Doppelklick zu öffnen und per Mail zu
verschicken.

Die Oberfläche ist ein Explorer. Links ein Baum aus Objekten und Aufgaben,
rechts drei Ebenen:

1. **Alle Objekte** – Objekt × Abteilung. Die Zelle zeigt die schlechteste
   Aufgabe darunter und wie viele White Spots offen sind.
2. **Objekt** – Aufgabe × zuständige Abteilungen, die Zelle zeigt die
   beteiligten Systeme.
3. **Aufgabe** – je zuständiger Abteilung ein Kasten mit allen Wegen, samt
   Anmerkung, Geschäftsfeld und Fundstelle in den Daten.

Farbcode überall gleich: ein System grün, zwei gelb, drei oder mehr rot, ein
White Spot schraffiert. Chips für Systeme sind voll umrandet bei `aktiv`,
gestrichelt bei `auslaufend`, gepunktet bei `geplant`.

Alle Kennzahlen rechnet das Frontend selbst aus den Rohdaten; das Werkzeug
liefert nur das validierte Modell. So liegt diese Logik an einer Stelle. Das
Frontend steht in [`frontend/index.html`](frontend/index.html) und kommt als
Text-Import in den Modulgraphen, wird also beim Aufruf über eine URL
mitgeladen und mitgecacht; `make` ersetzt darin den Platzhalter durch das
Modell als JSON.

## Eigene Daten

`bplan` ist generisch. Es liest ein Verzeichnis mit dieser Struktur:

```
data/
  systeme.yaml
  organisation.yaml
  aufgaben.yaml
  zuordnungen/
    <geschaeftsfeld>.md      eine Datei je Geschäftsfeld
```

`bplan validate PFAD` prüft das Verzeichnis `PFAD`, ohne Angabe das aktuelle.
Das Datenformat ist in [SPEC.md](SPEC.md) beschrieben, ein vollständiges
Beispiel liegt unter [`examples/demo/data/`](examples/demo/data).

### Bei null anfangen

Ein leeres `data/` ist ein gültiger Zustand, kein Fehler. Wer neu anfangen
will, löscht den Inhalt:

```bash
rm -rf data && mkdir data
bplan validate
# 0 Dateien, 0 Zuordnungen, 0 Fehler, 0 Warnungen
# Noch keine Daten unter data/. Erwartet werden systeme.yaml, ...
```

Dasselbe gilt für einzelne Dateien: eine geleerte oder nur mit Kommentaren
gefüllte YAML-Datei ergibt keine Einträge statt eines Parse-Fehlers. So kann
man Stück für Stück aufbauen, und `bplan validate` sagt bei jedem Schritt,
was noch fehlt.

## Validierungsregeln

Fehler blockieren `serve` und `make`, Warnungen werden nur angezeigt. Jeder
Befund nennt Datei und, wo möglich, Zeile. Bei unbekannten IDs schlägt
`bplan` den ähnlichsten bekannten Wert vor (Levenshtein-Distanz bis 3,
verglichen wird sowohl mit der ID als auch mit dem Anzeigenamen, damit
`shopsystem` das System `shop` findet).

Die vollständige Liste steht als Regelnummern im Kopf von
[`src/validate.ts`](src/validate.ts); jede Regel hat einen Testfall in
[`tests/regeln_test.ts`](tests/regeln_test.ts).

## Aufbau

```
deno.json
cli.ts             Kommandos, Argumente, Ausgabe
src/
  model.ts         Datenstrukturen, JSON-Schema
  befund.ts        ein Fehler oder eine Warnung mit Fundstelle
  parse.ts         YAML, Frontmatter, Markdown-Tabellen
  validate.ts      Regeln, Fehler und Warnungen mit Positionen
  make.ts          HTML-Datei mit eingebettetem Modell
  serve.ts         Platzhalter
frontend/
  index.html       das komplette Frontend, Vanilla JS, ohne Build-Schritt
tests/
  regeln_test.ts   ein Testfall je Regel
examples/
  demo/            vollständiger Beispieldatensatz (fiktiver Versandhandel)
  tippfehler/      kleiner Datensatz mit absichtlichen Fehlern
mockups/
  bebauungsplan-mockup-3.html
SPEC.md
```
