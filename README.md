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
| `bplan make`     | Platzhalter, Schritt 2                        |
| `bplan serve`    | Platzhalter, Schritt 3                        |

## Ausprobieren

Rust wird einmalig gebraucht, über [rustup.rs](https://rustup.rs) (unter
Windows der Installer, unter macOS und Linux der Einzeiler auf der Seite).

```bash
git clone https://github.com/svenhornberg/landscape.git
cd landscape

cargo run -- validate examples/demo        # läuft sauber durch
cargo run -- validate examples/tippfehler  # meldet Tippfehler mit Zeile und Vorschlag
cargo test                                 # ein Testfall je Regel aus SPEC.md
```

Ein Binary ohne Cargo im Pfad:

```bash
cargo build --release
./target/release/bplan validate examples/demo
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
[`src/validate.rs`](src/validate.rs); jede Regel hat einen Testfall in
[`tests/regeln.rs`](tests/regeln.rs).

## Aufbau

```
Cargo.toml
src/
  main.rs          CLI und Ausgabe
  model.rs         Datenstrukturen, JSON-Schema
  parse.rs         YAML, Frontmatter, Markdown-Tabellen
  validate.rs      Regeln, Fehler und Warnungen mit Positionen
  serve.rs         Platzhalter
  make.rs          Platzhalter
tests/
  regeln.rs        ein Testfall je Regel
examples/
  demo/            vollständiger Beispieldatensatz (fiktiver Versandhandel)
  tippfehler/      kleiner Datensatz mit absichtlichen Fehlern
mockups/
  bebauungsplan-mockup-3.html
SPEC.md
```
