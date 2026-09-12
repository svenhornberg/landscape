//! Ein Testfall je Regel aus SPEC.md, Abschnitt "Validierung".
//!
//! Getestet wird über das gebaute Binary, damit auch die Ausgabe mit
//! Datei:Zeile und Vorschlag mitgeprüft wird und nicht nur die interne
//! Datenstruktur.

use std::path::Path;
use std::process::Command;

use tempfile::TempDir;

// ---------------------------------------------------------------------------
// Basisdatensatz: klein, gültig, ohne Warnungen. Jeder Test tauscht genau
// eine Datei aus und prüft die dadurch ausgelöste Regel.
// ---------------------------------------------------------------------------

const SYSTEME: &str = "\
- id: shop
  name: Shopsystem
  status: aktiv
- id: erp
  name: ERP
  status: aktiv
";

const ORGANISATION: &str = "\
geschaeftsfelder:
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
";

const AUFGABEN: &str = "\
- id: angebot
  name: Angebot
  aufgaben:
    - {id: erstellen, name: erstellen}
    - {id: versenden, name: versenden}
- id: rechnung
  name: Rechnung
  aufgaben:
    - {id: erstellen, name: erstellen}
";

/// Zeile 1 `---`, 2 Frontmatter, 3 `---`, 5 Kopf, 6 Trenner, ab 7 Daten.
const ZUORDNUNGEN: &str = "\
---
geschaeftsfeld: gk
---

| Abteilung   | Aufgabe            | System | Anmerkung |
|-------------|--------------------|--------|-----------|
| vertrieb    | angebot.erstellen  | shop   |           |
| vertrieb    | angebot.versenden  | shop   |           |
| buchhaltung | rechnung.erstellen | erp    |           |
";

struct Ausgabe {
    code: i32,
    text: String,
}

impl Ausgabe {
    #[track_caller]
    fn erwarte(&self, teil: &str) -> &Self {
        assert!(
            self.text.contains(teil),
            "erwartet in der Ausgabe:\n  {teil}\nbekommen:\n{}",
            self.text
        );
        self
    }

    #[track_caller]
    fn erwarte_nicht(&self, teil: &str) -> &Self {
        assert!(
            !self.text.contains(teil),
            "nicht erwartet in der Ausgabe:\n  {teil}\nbekommen:\n{}",
            self.text
        );
        self
    }

    #[track_caller]
    fn erwarte_code(&self, code: i32) -> &Self {
        assert_eq!(
            self.code, code,
            "falscher Exit-Code, Ausgabe:\n{}",
            self.text
        );
        self
    }
}

struct Datensatz {
    dir: TempDir,
}

impl Datensatz {
    fn neu() -> Self {
        let dir = TempDir::new().expect("Temp-Verzeichnis");
        let d = Datensatz { dir };
        d.schreibe("data/systeme.yaml", SYSTEME);
        d.schreibe("data/organisation.yaml", ORGANISATION);
        d.schreibe("data/aufgaben.yaml", AUFGABEN);
        d.schreibe("data/zuordnungen/gk.md", ZUORDNUNGEN);
        d
    }

    fn schreibe(&self, rel: &str, inhalt: &str) {
        let pfad = self.dir.path().join(rel);
        std::fs::create_dir_all(pfad.parent().unwrap()).expect("Verzeichnis");
        std::fs::write(&pfad, inhalt).expect("schreiben");
    }

    fn loesche(&self, rel: &str) {
        std::fs::remove_file(self.dir.path().join(rel)).expect("löschen");
    }

    /// Hängt Zeilen an die Zuordnungstabelle an. Die erste angehängte Zeile
    /// landet auf Zeile 10.
    fn zeilen_anhaengen(&self, zeilen: &str) {
        self.schreibe("data/zuordnungen/gk.md", &format!("{ZUORDNUNGEN}{zeilen}"));
    }

    fn pruefe(&self) -> Ausgabe {
        validate(self.dir.path())
    }

    /// Baut die HTML-Datei nach `rel` innerhalb des Datensatzes.
    fn mache(&self, rel: &str) -> Ausgabe {
        make(self.dir.path(), &self.dir.path().join(rel))
    }

    fn lies(&self, rel: &str) -> String {
        std::fs::read_to_string(self.dir.path().join(rel)).expect("erzeugte Datei lesen")
    }

    fn gibt_es(&self, rel: &str) -> bool {
        self.dir.path().join(rel).exists()
    }
}

fn validate(pfad: &Path) -> Ausgabe {
    starte(&["validate", &pfad.to_string_lossy()])
}

fn make(pfad: &Path, ausgabe: &Path) -> Ausgabe {
    starte(&[
        "make",
        &pfad.to_string_lossy(),
        "-o",
        &ausgabe.to_string_lossy(),
    ])
}

fn starte(argumente: &[&str]) -> Ausgabe {
    let ausgabe = Command::new(env!("CARGO_BIN_EXE_bplan"))
        .args(argumente)
        .env("NO_COLOR", "1")
        .output()
        .expect("bplan starten");
    Ausgabe {
        code: ausgabe.status.code().unwrap_or(-1),
        text: format!(
            "{}{}",
            String::from_utf8_lossy(&ausgabe.stdout),
            String::from_utf8_lossy(&ausgabe.stderr)
        ),
    }
}

/// Schneidet das eingebettete Modell aus einer von `make` erzeugten Datei.
/// Weil `make` jedes `<` maskiert, ist das erste `</script>` nach dem
/// Script-Tag verlaesslich dessen Ende.
fn modell_aus(html: &str) -> serde_json::Value {
    const START: &str = "<script id=\"model\" type=\"application/json\">";
    let nach_tag = html.split_once(START).expect("Script-Tag mit dem Modell").1;
    let json = nach_tag
        .split_once("</script>")
        .expect("Ende des Script-Tags")
        .0;
    serde_json::from_str(json).expect("eingebettetes Modell ist gültiges JSON")
}

fn beispiel(name: &str) -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("examples")
        .join(name)
}

// ---------------------------------------------------------------------------
// Der Basisdatensatz selbst
// ---------------------------------------------------------------------------

#[test]
fn basisdatensatz_ist_sauber() {
    Datensatz::neu()
        .pruefe()
        .erwarte_code(0)
        .erwarte("1 Datei, 3 Zuordnungen, 0 Fehler, 0 Warnungen")
        .erwarte_nicht("Fehler  ")
        .erwarte_nicht("Warnung  ");
}

// ---------------------------------------------------------------------------
// Fehler
// ---------------------------------------------------------------------------

/// Regel F1: unbekannte Abteilung in einer Zuordnung.
#[test]
fn f1_unbekannte_abteilung() {
    let d = Datensatz::neu();
    d.zeilen_anhaengen("| vertrib | angebot.erstellen | shop | |\n");
    d.pruefe()
        .erwarte_code(1)
        .erwarte("data/zuordnungen/gk.md:10")
        .erwarte("Abteilung \"vertrib\" unbekannt (meintest du \"vertrieb\"?)");
}

/// Regel F2: unbekanntes Objekt in der Aufgabenreferenz. Der Vorschlag kommt
/// hier über den Anzeigenamen "Angebot".
#[test]
fn f2_unbekanntes_objekt() {
    let d = Datensatz::neu();
    d.zeilen_anhaengen("| vertrieb | Angebot.erstellen | shop | |\n");
    d.pruefe()
        .erwarte_code(1)
        .erwarte("data/zuordnungen/gk.md:10")
        .erwarte("Objekt \"Angebot\" unbekannt (meintest du \"angebot\"?)");
}

/// Regel F3: Objekt bekannt, Aufgabe nicht.
#[test]
fn f3_unbekannte_aufgabe() {
    let d = Datensatz::neu();
    d.zeilen_anhaengen("| vertrieb | angebot.senden | shop | |\n");
    d.pruefe()
        .erwarte_code(1)
        .erwarte("data/zuordnungen/gk.md:10")
        .erwarte("Aufgabe \"angebot.senden\" unbekannt (Objekt Angebot hat: erstellen, versenden; meintest du \"versenden\"?)");
}

/// Regel F4: unbekanntes System. Zeigt den Fall aus SPEC.md, bei dem der
/// ausgeschriebene Produktname statt der ID in der Tabelle steht.
#[test]
fn f4_unbekanntes_system() {
    let d = Datensatz::neu();
    d.zeilen_anhaengen("| vertrieb | angebot.erstellen | shopsystem | |\n");
    d.pruefe()
        .erwarte_code(1)
        .erwarte("data/zuordnungen/gk.md:10")
        .erwarte("System \"shopsystem\" unbekannt (meintest du \"shop\"?)");
}

/// Regel F5: Geschäftsfeld im Frontmatter unbekannt.
#[test]
fn f5_unbekanntes_geschaeftsfeld() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/zuordnungen/gk.md",
        &ZUORDNUNGEN.replace("geschaeftsfeld: gk", "geschaeftsfeld: gkx"),
    );
    d.pruefe()
        .erwarte_code(1)
        .erwarte("data/zuordnungen/gk.md:2")
        .erwarte("Geschäftsfeld \"gkx\" unbekannt (meintest du \"gk\"?)");
}

/// Regel F6: doppelte ID innerhalb einer Stammdatendatei.
#[test]
fn f6_doppelte_id() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/systeme.yaml",
        "- id: shop\n  name: Shopsystem\n  status: aktiv\n\
         - id: erp\n  name: ERP\n  status: aktiv\n\
         - id: shop\n  name: Zweiter Shop\n  status: aktiv\n",
    );
    d.pruefe()
        .erwarte_code(1)
        .erwarte("data/systeme.yaml:7")
        .erwarte("System-ID \"shop\" ist doppelt (schon in Zeile 1)");
}

/// Regel F6 auch für Aufgaben innerhalb eines Objekts.
#[test]
fn f6_doppelte_aufgaben_id() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/aufgaben.yaml",
        "- id: angebot\n  name: Angebot\n  aufgaben:\n\
         \x20   - {id: erstellen, name: erstellen}\n\
         \x20   - {id: versenden, name: versenden}\n\
         \x20   - {id: erstellen, name: nochmal erstellen}\n\
         - id: rechnung\n  name: Rechnung\n  aufgaben:\n\
         \x20   - {id: erstellen, name: erstellen}\n",
    );
    d.pruefe()
        .erwarte_code(1)
        .erwarte("data/aufgaben.yaml:6")
        .erwarte("Aufgaben-ID \"erstellen\" ist doppelt in Objekt \"angebot\" (schon in Zeile 4)");
}

/// Regel F7: Aufgabenreferenz ohne Punkt.
#[test]
fn f7_aufgabe_ohne_punkt() {
    let d = Datensatz::neu();
    d.zeilen_anhaengen("| vertrieb | angebot | shop | |\n");
    d.pruefe()
        .erwarte_code(1)
        .erwarte("data/zuordnungen/gk.md:10")
        .erwarte("Aufgabe \"angebot\" hat keinen Punkt (erwartet wird objekt.aufgabe)");
}

/// Regel F8: Frontmatter fehlt.
#[test]
fn f8_frontmatter_fehlt() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/zuordnungen/gk.md",
        "# Geschaeftskunden\n\n| Abteilung | Aufgabe | System |\n|---|---|---|\n| vertrieb | angebot.erstellen | shop |\n",
    );
    d.pruefe()
        .erwarte_code(1)
        .erwarte("data/zuordnungen/gk.md:1")
        .erwarte("Frontmatter fehlt");
}

/// Regel F8: Frontmatter ohne `geschaeftsfeld:`.
#[test]
fn f8_frontmatter_ohne_geschaeftsfeld() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/zuordnungen/gk.md",
        &ZUORDNUNGEN.replace("geschaeftsfeld: gk", "titel: Geschaeftskunden"),
    );
    d.pruefe()
        .erwarte_code(1)
        .erwarte("Frontmatter enthält kein \"geschaeftsfeld:\"");
}

/// Regel F9: `geschaeftsfelder` einer Abteilung zeigt ins Leere.
#[test]
fn f9_unbekanntes_geschaeftsfeld_in_abteilung() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/organisation.yaml",
        &ORGANISATION.replace(
            "geschaeftsfelder: [gk]\n    bearbeitet: [angebot]",
            "geschaeftsfelder: [gkx]\n    bearbeitet: [angebot]",
        ),
    );
    d.pruefe()
        .erwarte_code(1)
        .erwarte("data/organisation.yaml:6")
        .erwarte("Abteilung \"vertrieb\" verweist auf unbekanntes Geschäftsfeld \"gkx\" (meintest du \"gk\"?)");
}

/// Regel F9: `bearbeitet` einer Abteilung zeigt ins Leere.
#[test]
fn f9_unbekanntes_objekt_in_bearbeitet() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/organisation.yaml",
        &ORGANISATION.replace("bearbeitet: [angebot]", "bearbeitet: [angebott]"),
    );
    d.pruefe()
        .erwarte_code(1)
        .erwarte("data/organisation.yaml:6")
        .erwarte("\"bearbeitet\" von Abteilung \"vertrieb\" verweist auf unbekanntes Objekt \"angebott\" (meintest du \"angebot\"?)");
}

/// Regel F10: Status nicht aus der erlaubten Menge.
#[test]
fn f10_ungueltiger_status() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/systeme.yaml",
        &SYSTEME.replace("status: aktiv\n- id: erp", "status: unklar\n- id: erp"),
    );
    d.pruefe()
        .erwarte_code(1)
        .erwarte("data/systeme.yaml:3")
        .erwarte("Status \"unklar\" von System \"shop\" ist nicht erlaubt (erlaubt: aktiv, auslaufend, geplant)");
}

/// Regel F10: Status fehlt ganz.
#[test]
fn f10_status_fehlt() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/systeme.yaml",
        "- id: shop\n  name: Shopsystem\n- id: erp\n  name: ERP\n  status: aktiv\n",
    );
    d.pruefe()
        .erwarte_code(1)
        .erwarte("System \"shop\" hat keinen Status (erlaubt: aktiv, auslaufend, geplant)");
}

/// Regel F11: ID verletzt das Muster [a-z0-9-]+.
#[test]
fn f11_ungueltige_id() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/organisation.yaml",
        &ORGANISATION.replace("- id: vertrieb", "- id: Vertrieb"),
    );
    d.pruefe()
        .erwarte_code(1)
        .erwarte("data/organisation.yaml:6")
        .erwarte("Abteilungs-ID \"Vertrieb\" ist ungültig (erlaubt sind nur a-z, 0-9 und -)");
}

/// Regel F11 auch für Systeme mit Unterstrich.
#[test]
fn f11_ungueltige_system_id() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/systeme.yaml",
        &SYSTEME.replace("- id: erp", "- id: erp_alt"),
    );
    d.pruefe()
        .erwarte_code(1)
        .erwarte("System-ID \"erp_alt\" ist ungültig (erlaubt sind nur a-z, 0-9 und -)");
}

/// Regel F12: Pflichtspalte in einer Zuordnungszeile ist leer.
#[test]
fn f12_zeile_unvollstaendig() {
    let d = Datensatz::neu();
    d.zeilen_anhaengen("| vertrieb | angebot.erstellen |  | fehlendes System |\n");
    d.pruefe()
        .erwarte_code(1)
        .erwarte("data/zuordnungen/gk.md:10")
        .erwarte("Zeile unvollständig, Spalte System ist leer");
}

/// Regel F13: Stammdatendatei fehlt.
#[test]
fn f13_datei_fehlt() {
    let d = Datensatz::neu();
    d.loesche("data/systeme.yaml");
    d.pruefe()
        .erwarte_code(1)
        .erwarte("data/systeme.yaml")
        .erwarte("Datei fehlt");
}

/// Regel F13: kaputtes YAML, mit Zeilenangabe aus dem Parser.
#[test]
fn f13_yaml_kaputt() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/systeme.yaml",
        "- id: shop\n  name: Shopsystem\n   status: aktiv\n",
    );
    d.pruefe().erwarte_code(1).erwarte("YAML nicht lesbar");
}

/// Regel F13: `data/` gibt es gar nicht.
#[test]
fn f13_data_verzeichnis_fehlt() {
    let dir = TempDir::new().unwrap();
    validate(dir.path())
        .erwarte_code(1)
        .erwarte("Verzeichnis \"data\" nicht gefunden");
}

// ---------------------------------------------------------------------------
// Warnungen
// ---------------------------------------------------------------------------

/// Regel W1: exakt doppelte Zeile.
#[test]
fn w1_doppelte_zeile() {
    let d = Datensatz::neu();
    d.zeilen_anhaengen("| vertrieb | angebot.erstellen | shop | |\n");
    d.pruefe()
        .erwarte_code(0)
        .erwarte("data/zuordnungen/gk.md:10")
        .erwarte("Zeile ist exakt doppelt (schon in Zeile 7)");
}

/// Regel W1 greift nicht bei gleicher Aufgabe mit anderem System, das ist
/// gewollte Redundanz und keine Doppelung.
#[test]
fn w1_andere_systeme_sind_keine_doppelung() {
    let d = Datensatz::neu();
    d.zeilen_anhaengen("| vertrieb | angebot.erstellen | erp | zweiter Weg |\n");
    d.pruefe().erwarte_code(0).erwarte_nicht("exakt doppelt");
}

/// Regel W2: Zuordnung in einem Geschäftsfeld, in dem die Abteilung laut
/// organisation.yaml nicht arbeitet.
#[test]
fn w2_abteilung_arbeitet_nicht_im_geschaeftsfeld() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/organisation.yaml",
        &ORGANISATION
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
        .erwarte_code(0)
        .erwarte("data/zuordnungen/gk.md:7")
        .erwarte(
            "Abteilung \"vertrieb\" arbeitet laut organisation.yaml nicht im Geschäftsfeld \"gk\"",
        );
}

/// Regel W3: Zuordnung für ein Objekt, das nicht in `bearbeitet` steht.
#[test]
fn w3_objekt_nicht_in_bearbeitet() {
    let d = Datensatz::neu();
    d.zeilen_anhaengen("| vertrieb | rechnung.erstellen | erp | |\n");
    d.pruefe()
        .erwarte_code(0)
        .erwarte("data/zuordnungen/gk.md:10")
        .erwarte("Objekt \"rechnung\" steht nicht in \"bearbeitet\" von Abteilung \"vertrieb\" (entweder die Regel ergänzen oder die Zeile ist falsch)");
}

/// Regel W4: System ohne einzige Zuordnung.
#[test]
fn w4_system_ohne_zuordnung() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/systeme.yaml",
        &format!("{SYSTEME}- id: mahn\n  name: Mahnlauf-Tool\n  status: aktiv\n"),
    );
    d.pruefe()
        .erwarte_code(0)
        .erwarte("data/systeme.yaml:7")
        .erwarte("System \"mahn\" hat keine einzige Zuordnung");
}

/// Regel W5: Abteilung ohne einzige Zuordnung.
#[test]
fn w5_abteilung_ohne_zuordnung() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/organisation.yaml",
        &format!("{ORGANISATION}  - id: mkt\n    name: Marketing\n    geschaeftsfelder: [gk]\n    bearbeitet: [angebot]\n"),
    );
    d.pruefe()
        .erwarte_code(0)
        .erwarte("data/organisation.yaml:14")
        .erwarte("Abteilung \"mkt\" hat keine einzige Zuordnung");
}

/// Regel W6: auslaufendes System ohne `ende`.
#[test]
fn w6_auslaufend_ohne_ende() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/systeme.yaml",
        &SYSTEME.replace("status: aktiv\n- id: erp", "status: auslaufend\n- id: erp"),
    );
    d.pruefe()
        .erwarte_code(0)
        .erwarte("data/systeme.yaml:1")
        .erwarte("System \"shop\" ist auslaufend, hat aber kein \"ende\"");
}

/// Regel W6 greift nicht, wenn `ende` gesetzt ist.
#[test]
fn w6_auslaufend_mit_ende_ist_still() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/systeme.yaml",
        &SYSTEME.replace(
            "status: aktiv\n- id: erp",
            "status: auslaufend\n  ende: 2027\n- id: erp",
        ),
    );
    d.pruefe()
        .erwarte_code(0)
        .erwarte_nicht("auslaufend, hat aber kein");
}

/// Regel W7: Abteilung ist für kein Objekt zuständig. Ohne `bearbeitet` gibt
/// es für sie keine White Spots, nur leere Zellen.
#[test]
fn w7_abteilung_ohne_bearbeitet() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/organisation.yaml",
        &format!("{ORGANISATION}  - id: mkt\n    name: Marketing\n    geschaeftsfelder: [gk]\n    bearbeitet: []\n"),
    );
    d.pruefe()
        .erwarte_code(0)
        .erwarte("data/organisation.yaml:14")
        .erwarte("Abteilung \"mkt\" ist für kein Objekt zuständig");
}

/// Warnungen allein lassen den Exit-Code auf 0, damit der Git-Hook nicht
/// wegen Kleinigkeiten blockiert.
#[test]
fn warnungen_allein_geben_exit_0() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/systeme.yaml",
        &format!("{SYSTEME}- id: mahn\n  name: Mahnlauf-Tool\n  status: aktiv\n"),
    );
    d.pruefe().erwarte_code(0).erwarte("0 Fehler, 1 Warnung");
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/// Mehrere Tabellen je Datei, Freitext dazwischen, uneinheitliche
/// Leerzeichen, Kopfzeile in anderer Schreibweise, zusätzliche und
/// vertauschte Spalten.
#[test]
fn parser_liest_mehrere_tabellen_und_ignoriert_den_rest() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/zuordnungen/gk.md",
        "---\n\
         geschaeftsfeld: gk\n\
         ---\n\
         \n\
         # Geschaeftskunden\n\
         \n\
         Freitext, der ignoriert wird. Auch mit | Pipe mittendrin.\n\
         \n\
         ## Vertrieb\n\
         \n\
         | ABTEILUNG | Aufgabe | Quelle | System |\n\
         |---|---|---|---|\n\
         |vertrieb|angebot.erstellen|Interview 3.9.|shop|\n\
         |   vertrieb   |   angebot.versenden   |   |   shop   |\n\
         \n\
         Diese Tabelle hat nicht die Pflichtspalten und wird ignoriert:\n\
         \n\
         | System | Kosten |\n\
         |---|---|\n\
         | shop | 120000 |\n\
         \n\
         ## Buchhaltung\n\
         \n\
         | Abteilung | Aufgabe | System | Anmerkung |\n\
         |-----------|---------|--------|-----------|\n\
         | buchhaltung | rechnung.erstellen | erp | Sammelrechnung |\n",
    );
    d.pruefe()
        .erwarte_code(0)
        .erwarte("1 Datei, 3 Zuordnungen, 0 Fehler, 0 Warnungen");
}

/// Mehrere Dateien dürfen dasselbe Geschäftsfeld tragen, ihre Zeilen werden
/// zusammengeführt.
#[test]
fn parser_fuehrt_dateien_mit_gleichem_geschaeftsfeld_zusammen() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/zuordnungen/gk-buchhaltung.md",
        "---\ngeschaeftsfeld: gk\n---\n\n| Abteilung | Aufgabe | System |\n|---|---|---|\n| buchhaltung | rechnung.erstellen | erp |\n",
    );
    d.pruefe()
        .erwarte_code(0)
        .erwarte("2 Dateien, 4 Zuordnungen, 0 Fehler, 1 Warnung")
        // Gleiche Zeile in einer anderen Datei bleibt eine Doppelung, die
        // Meldung nennt dann die andere Datei.
        .erwarte("Zeile ist exakt doppelt (schon in data/zuordnungen/gk-buchhaltung.md:7)");
}

// ---------------------------------------------------------------------------
// Beispieldatensätze im Repo
// ---------------------------------------------------------------------------

#[test]
fn demo_laeuft_sauber_durch() {
    validate(&beispiel("demo"))
        .erwarte_code(0)
        .erwarte("3 Dateien, 33 Zuordnungen, 0 Fehler, 0 Warnungen");
}

/// Der eingebaute Tippfehler-Datensatz meldet alle drei Fälle mit Datei,
/// Zeile und Vorschlag.
#[test]
fn tippfehler_beispiel_meldet_datei_zeile_und_vorschlag() {
    validate(&beispiel("tippfehler"))
        .erwarte_code(1)
        .erwarte("data/zuordnungen/geschaeftskunden.md:16  Fehler   Aufgabe \"angebot.senden\" unbekannt")
        .erwarte("data/zuordnungen/geschaeftskunden.md:17  Fehler   System \"shopsystem\" unbekannt (meintest du \"shop\"?)")
        .erwarte("data/zuordnungen/geschaeftskunden.md:18  Fehler   Abteilung \"vertrib\" unbekannt (meintest du \"vertrieb\"?)")
        .erwarte("1 Datei, 6 Zuordnungen, 3 Fehler, 0 Warnungen");
}

// ---------------------------------------------------------------------------
// Platzhalter
// ---------------------------------------------------------------------------

#[test]
fn serve_ist_noch_platzhalter() {
    let ausgabe = Command::new(env!("CARGO_BIN_EXE_bplan"))
        .args(["serve", &beispiel("demo").to_string_lossy()])
        .output()
        .expect("bplan starten");
    let text = String::from_utf8_lossy(&ausgabe.stderr).to_string();
    assert!(
        text.contains("noch nicht implementiert") && text.contains("Schritt 3"),
        "serve: unerwartete Ausgabe {text}"
    );
}

// ---------------------------------------------------------------------------
// make: eigenständige HTML-Datei mit eingebettetem Modell
// ---------------------------------------------------------------------------

#[test]
fn make_bettet_das_modell_in_die_html_datei_ein() {
    let d = Datensatz::neu();
    d.mache("plan.html")
        .erwarte_code(0)
        .erwarte("1 Datei, 3 Zuordnungen, 0 Fehler, 0 Warnungen")
        .erwarte("plan.html geschrieben");

    let html = d.lies("plan.html");
    assert!(
        !html.contains("<!--MODEL-->"),
        "der Platzhalter steht noch in der Ausgabe"
    );

    let modell = modell_aus(&html);
    assert_eq!(modell["geschaeftsfelder"][0]["id"], "gk");
    assert_eq!(modell["objekte"][0]["id"], "angebot");
    assert_eq!(modell["zuordnungen"].as_array().unwrap().len(), 3);
    assert_eq!(modell["zuordnungen"][0]["system"], "shop");
    assert_eq!(
        modell["zuordnungen"][0]["quelle"],
        "data/zuordnungen/gk.md:7"
    );
    assert!(modell["generiert"].as_str().unwrap().contains('T'));
}

/// Fehler blockieren `make`. Es darf dann auch keine halbe Datei entstehen.
#[test]
fn make_bricht_bei_fehlern_ab_und_schreibt_nichts() {
    let d = Datensatz::neu();
    d.zeilen_anhaengen("| vertrieb | angebot.erstellen | shopsystem | |\n");
    d.mache("plan.html")
        .erwarte_code(1)
        .erwarte("System \"shopsystem\" unbekannt (meintest du \"shop\"?)")
        .erwarte("abgebrochen");
    assert!(!d.gibt_es("plan.html"), "trotz Fehlern geschrieben");
}

/// Warnungen halten `make` nicht auf und landen im Modell, damit das Frontend
/// sie zeigen kann.
#[test]
fn make_laeuft_bei_warnungen_weiter_und_reicht_sie_durch() {
    let d = Datensatz::neu();
    d.schreibe(
        "data/systeme.yaml",
        &format!("{SYSTEME}- id: mahn\n  name: Mahnlauf-Tool\n  status: auslaufend\n"),
    );
    d.mache("plan.html").erwarte_code(0).erwarte("2 Warnungen");

    let warnungen = modell_aus(&d.lies("plan.html"))["warnungen"]
        .as_array()
        .expect("Warnungen im Modell")
        .iter()
        .map(|w| w.as_str().unwrap_or_default().to_string())
        .collect::<Vec<_>>()
        .join("\n");
    assert!(
        warnungen.contains("System \"mahn\" hat keine einzige Zuordnung")
            && warnungen.contains("data/systeme.yaml:7"),
        "unerwartete Warnungen: {warnungen}"
    );
}

/// Der Deploy schreibt nach `out/index.html`, das Verzeichnis gibt es dort
/// noch nicht.
#[test]
fn make_legt_das_zielverzeichnis_an() {
    let d = Datensatz::neu();
    d.mache("out/index.html").erwarte_code(0);
    assert!(d.gibt_es("out/index.html"));
}

/// Eine Anmerkung darf das Script-Tag mit dem Modell nicht vorzeitig
/// schliessen. `modell_aus` schneidet am ersten `</script>`; ginge die
/// Maskierung verloren, waere der Ausschnitt kein gültiges JSON mehr.
#[test]
fn make_maskiert_spitze_klammern_im_modell() {
    let d = Datensatz::neu();
    d.zeilen_anhaengen("| vertrieb | angebot.versenden | erp | Ende </script><img src=x> |\n");
    d.mache("plan.html").erwarte_code(0);

    let modell = modell_aus(&d.lies("plan.html"));
    let zuordnungen = modell["zuordnungen"].as_array().unwrap();
    assert_eq!(
        zuordnungen.last().unwrap()["anmerkung"],
        "Ende </script><img src=x>"
    );
}

/// Die erzeugte Datei funktioniert per Doppelklick, also ohne Server und ohne
/// Netz. Ein externer Verweis waere ein Rückschritt.
#[test]
fn make_laeuft_auf_dem_demo_beispiel_ohne_externe_verweise() {
    let dir = TempDir::new().unwrap();
    let ziel = dir.path().join("bebauungsplan.html");
    make(&beispiel("demo"), &ziel).erwarte_code(0);

    let html = std::fs::read_to_string(&ziel).expect("erzeugte Datei lesen");
    assert!(
        !html.contains("http://") && !html.contains("https://"),
        "externer Verweis in der erzeugten Datei"
    );

    let modell = modell_aus(&html);
    assert_eq!(modell["zuordnungen"].as_array().unwrap().len(), 33);
    assert_eq!(modell["warnungen"].as_array().unwrap().len(), 0);
}

// ---------------------------------------------------------------------------
// Bei null anfangen
// ---------------------------------------------------------------------------

/// Ein leeres `data/` ist ein gültiger Startpunkt, kein Fehler. Das Tool ist
/// generisch; wer neu anfangen will, leert das Verzeichnis.
#[test]
fn leeres_data_verzeichnis_ist_ein_gueltiger_start() {
    let dir = TempDir::new().unwrap();
    std::fs::create_dir_all(dir.path().join("data/zuordnungen")).unwrap();
    validate(dir.path())
        .erwarte_code(0)
        .erwarte("0 Dateien, 0 Zuordnungen, 0 Fehler, 0 Warnungen")
        .erwarte("Noch keine Daten unter data/");
}

/// Auch ohne das Unterverzeichnis `zuordnungen/`.
#[test]
fn leeres_data_verzeichnis_ohne_zuordnungen_ist_gueltig() {
    let dir = TempDir::new().unwrap();
    std::fs::create_dir_all(dir.path().join("data")).unwrap();
    validate(dir.path())
        .erwarte_code(0)
        .erwarte("0 Fehler, 0 Warnungen");
}

/// Stammdaten ohne Zuordnungen sind ein normaler Zwischenstand.
#[test]
fn stammdaten_ohne_zuordnungen_sind_kein_fehler() {
    let d = Datensatz::neu();
    d.loesche("data/zuordnungen/gk.md");
    d.pruefe()
        .erwarte_code(0)
        .erwarte("0 Dateien, 0 Zuordnungen, 0 Fehler, 4 Warnungen")
        .erwarte("Abteilung \"vertrieb\" hat keine einzige Zuordnung");
}

/// Eine geleerte YAML-Datei ist gültig und ergibt einfach keine Einträge,
/// statt am Parser zu scheitern.
#[test]
fn geleerte_yaml_datei_ist_gueltig() {
    let d = Datensatz::neu();
    d.schreibe("data/systeme.yaml", "# hier kommen die Systeme rein\n");
    d.pruefe()
        .erwarte_code(1)
        .erwarte_nicht("YAML nicht lesbar")
        .erwarte("System \"shop\" unbekannt");
}

/// Eine komplett leere Datei ebenso.
#[test]
fn voellig_leere_yaml_datei_ist_gueltig() {
    let d = Datensatz::neu();
    d.schreibe("data/systeme.yaml", "");
    d.pruefe().erwarte_nicht("YAML nicht lesbar");
}

/// Auch aus einem leeren `data/` entsteht eine Seite, dann eben eine leere.
#[test]
fn make_auf_leerem_data_verzeichnis_ergibt_eine_leere_seite() {
    let dir = TempDir::new().unwrap();
    std::fs::create_dir_all(dir.path().join("data/zuordnungen")).unwrap();
    let ziel = dir.path().join("plan.html");
    make(dir.path(), &ziel)
        .erwarte_code(0)
        .erwarte("0 Dateien, 0 Zuordnungen, 0 Fehler, 0 Warnungen");

    let modell = modell_aus(&std::fs::read_to_string(&ziel).expect("erzeugte Datei lesen"));
    assert_eq!(modell["objekte"].as_array().unwrap().len(), 0);
    assert_eq!(modell["zuordnungen"].as_array().unwrap().len(), 0);
}
