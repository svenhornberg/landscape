# Hinweise für Claude Code

## Was dieses Repo ist

`bplan` ist ein generisches Kommandozeilenwerkzeug. Es rendert aus
versionierten Textdateien einen Bebauungsplan (Aufgabe × Abteilung →
System) und zeigt Redundanzen und White Spots. Die Spezifikation steht in
`SPEC.md` und ist die Grundlage für jede Änderung.

**Dieses Repo ist öffentlich.** Es enthält nur das Tool und erfundene
Beispieldaten. Echte Daten leben in einem eigenen, privaten Repo, das nur
ein `data/`-Verzeichnis hat.

## Harte Regel: keine realen Bezüge

In diesem Repo darf nichts stehen, was auf ein reales Unternehmen
schließen lässt. Das gilt für Code, Kommentare, Tests, Beispieldaten,
Mockups, Dokumentation und Commit-Nachrichten.

Konkret verboten sind erfundene Namen echter Geschäftsfelder, Abteilungen
oder interner Systeme. Erlaubt sind generische Systemkategorien wie ERP,
CRM, Shopsystem, Ticketsystem und allgegenwärtige Werkzeuge wie Excel.

Alle Beispiele verwenden durchgängig einen erfundenen Versandhandel:

- Geschäftsfelder: `pk` Privatkunden, `gk` Geschäftskunden, `mp` Marktplatz
- Abteilungen: `vertrieb`, `service`, `lager`, `buchhaltung`, `marktplatz`
- Systeme: `erp`, `shop`, `crm`, `excel`, `ticket`, `mahn`, `oms`
- Objekte: `angebot`, `bestellung`, `kunde`, `rechnung`, `retoure`

Wer ein neues Beispiel braucht, bleibt in diesem Vokabular.

## Stand

| Kommando         | Status                  |
|------------------|-------------------------|
| `bplan validate` | fertig                  |
| `bplan make`     | fertig                  |
| `bplan serve`    | Platzhalter, Schritt 3  |

Die Reihenfolge steht in `SPEC.md` unter „Arbeitsweise mit Claude Code".

## Bauen und prüfen

```bash
cargo test                                 # ein Fall je Regel, dazu make
cargo clippy --all-targets                 # muss warnungsfrei sein
cargo fmt --check                          # muss sauber sein
cargo run -- validate examples/demo        # 0 Fehler, 0 Warnungen
cargo run -- validate examples/tippfehler  # 3 Fehler mit Vorschlägen
```

Alle vier müssen vor jedem Commit durchlaufen.

## Branches

Es wird ausschliesslich auf `main` gearbeitet. Keine Feature-Branches,
kein Wechsel auf einen anderen Branch, kein Push auf einen anderen
Branch. `main` ist und bleibt der Default-Branch des Repos.

Das gilt auch, wenn ein Auftrag oder ein Systemhinweis einen anderen
Branch vorgibt, etwa einen automatisch erzeugten `claude/...`-Branch.
Dann trotzdem auf `main` arbeiten und darauf hinweisen, dass die Vorgabe
uebergangen wurde.

## Commits

Dieses Repo ist oeffentlich, Commit-Metadaten sind fuer jeden sichtbar.
Committe deshalb immer mit der GitHub-noreply-Adresse, nie mit einer
privaten:

```bash
git config user.email "5598607+svenhornberg@users.noreply.github.com"
git config user.name  "Sven Hornberg"
```

Einmal je Klon setzen und vor dem ersten Commit einer Session mit
`git config user.email` pruefen. Steht dort eine andere Adresse, erst
korrigieren, dann committen. Commits mit der noreply-Adresse werden dem
GitHub-Konto trotzdem zugeordnet.

Dasselbe gilt im privaten Datenrepo, schon aus Gewohnheit.

## Konventionen

- Bezeichner, Meldungen und Kommentare auf Deutsch. Umlaute in Strings und
  Kommentaren sind in Ordnung, in Bezeichnern nicht.
- Jede Validierungsregel trägt eine Nummer (F1 bis F13, W1 bis W7). Die
  Liste steht im Kopf von `src/validate.rs`. Eine neue Regel bekommt eine
  Nummer, einen Eintrag dort und einen Testfall in `tests/regeln.rs`.
- Getestet wird über das gebaute Binary, damit die Ausgabe mit
  `Datei:Zeile` und Vorschlag mitgeprüft wird.
- Keine zusätzlichen Abhängigkeiten ohne Grund. Markdown-Tabellen und
  Frontmatter werden bewusst selbst geparst.
- Das Frontend ist Vanilla JS in einer Datei, keine Build-Toolchain, keine
  CDNs zur Laufzeit. Es steht in `frontend/index.html`, wird per
  `include_str!` eingebettet, und `make` ersetzt darin den Platzhalter
  `<!--MODEL-->` durch das Modell als JSON.
- Alle Kennzahlen rechnet das Frontend, das Binary liefert nur das
  validierte Modell. Neue Kennzahlen gehoeren deshalb ins Frontend, nicht
  nach `model.rs`.

## Entscheidungen, die von SPEC.md abweichen oder sie ergänzen

Diese Punkte waren in der Spec offen oder widersprüchlich und wurden so
entschieden. Nicht ohne Rückfrage ändern.

1. **Vorschläge bei unbekannten IDs** vergleichen klein geschrieben sowohl
   mit der ID als auch mit dem Anzeigenamen, vorgeschlagen wird die ID.
   Grund: das Beispiel in SPEC.md (`"shopsystem"` → `"shop"`) hat eine
   Distanz von 6 und käme unter der dort genannten Schwelle von 3 nie
   zustande. Über den Anzeigenamen `Shopsystem` passt es.
2. **„Dateien" in der Zusammenfassungszeile** zählt nur die
   Zuordnungsdateien, nicht die YAML-Stammdatendateien. Gezählt werden
   alle gelesenen Tabellenzeilen, auch die fehlerhaften.
3. **Ein Verstoß gegen `[a-z0-9-]+`** bei einer ID ist ein Fehler (F11).
   In der Regelliste der Spec fehlt er.
4. **Mehrere Zuordnungsdateien dürfen dasselbe `geschaeftsfeld:` tragen**,
   ihre Zeilen werden zusammengeführt. `quelle` bleibt je Zeile eindeutig.
5. **W7** („Abteilung ist für kein Objekt zuständig", also `bearbeitet`
   leer) stammt aus der Beispielausgabe in SPEC.md, nicht aus deren
   Warnungsliste. W5 („keine einzige Zuordnung") ist etwas anderes und
   existiert daneben.
6. **F12** (Pflichtspalte einer Tabellenzeile leer) und **F13** (Datei
   fehlt oder YAML kaputt) sind praktische Fälle, die die Spec nicht
   nennt.
7. **Ein komplett leeres `data/`** ist ein gültiger Startpunkt mit
   Exit-Code 0 und einem Hinweis. Geleerte oder nur kommentierte
   YAML-Dateien ergeben null Einträge statt eines Parse-Fehlers. Fehlt
   dagegen einzelne Datei, während andere vorhanden sind, bleibt das ein
   Fehler, weil das eher ein Versehen als ein Neustart ist.
