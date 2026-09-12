//! Einlesen der Datendateien: YAML-Stammdaten, Frontmatter und
//! Markdown-Tabellen.
//!
//! Hier entstehen nur strukturelle Befunde (Datei fehlt, YAML kaputt,
//! Frontmatter fehlt, Zeile unvollständig). Alles, was IDs gegeneinander
//! prüft, steht in `validate.rs`.

use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::model::{Abteilung, Geschaeftsfeld, Objekt, Organisation, Pos, System};
use crate::validate::Befund;

/// Eine Zuordnungszeile, so wie sie in der Tabelle steht. Die IDs sind noch
/// ungeprüft, `aufgabe` ist der rohe Text (z. B. `angebot.erstellen`).
#[derive(Debug, Clone)]
pub struct Rohzeile {
    pub abteilung: String,
    pub aufgabe: String,
    pub system: String,
    pub anmerkung: String,
    pub pos: Pos,
}

/// Eine Datei unter `data/zuordnungen/`.
#[derive(Debug)]
pub struct Zuordnungsdatei {
    /// Wert aus dem Frontmatter, noch ungeprüft.
    pub gf: String,
    pub gf_pos: Pos,
    pub zeilen: Vec<Rohzeile>,
}

/// Alles Eingelesene, mit den Fundstellen der Stammdaten-Einträge.
#[derive(Debug, Default)]
pub struct Rohdaten {
    pub geschaeftsfelder: Vec<Geschaeftsfeld>,
    pub abteilungen: Vec<Abteilung>,
    pub systeme: Vec<System>,
    pub objekte: Vec<Objekt>,
    pub dateien: Vec<Zuordnungsdatei>,

    /// Fundstellen parallel zu den Vektoren oben.
    pub pos_geschaeftsfelder: Vec<Pos>,
    pub pos_abteilungen: Vec<Pos>,
    pub pos_systeme: Vec<Pos>,
    pub pos_systeme_status: Vec<Pos>,
    pub pos_objekte: Vec<Pos>,
    pub pos_aufgaben: Vec<Vec<Pos>>,
}

impl Rohdaten {
    /// Anzahl der gelesenen Tabellenzeilen über alle Zuordnungsdateien.
    pub fn anzahl_zuordnungen(&self) -> usize {
        self.dateien.iter().map(|d| d.zeilen.len()).sum()
    }
}

/// True, wenn keine der drei Stammdatendateien und keine Zuordnungsdatei
/// existiert.
fn ist_leerer_start(data: &Path) -> bool {
    !data.join("systeme.yaml").exists()
        && !data.join("organisation.yaml").exists()
        && !data.join("aufgaben.yaml").exists()
        && md_dateien(&data.join("zuordnungen")).is_empty()
}

/// Alle `.md`-Dateien eines Verzeichnisses, nach Name sortiert. Ein fehlendes
/// Verzeichnis ergibt eine leere Liste.
fn md_dateien(verzeichnis: &Path) -> Vec<PathBuf> {
    let Ok(eintraege) = std::fs::read_dir(verzeichnis) else {
        return Vec::new();
    };
    let mut pfade: Vec<PathBuf> = eintraege
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_file() && p.extension().is_some_and(|x| x == "md"))
        .collect();
    pfade.sort();
    pfade
}

const SYSTEME: &str = "data/systeme.yaml";
const ORGANISATION: &str = "data/organisation.yaml";
const AUFGABEN: &str = "data/aufgaben.yaml";
const ZUORDNUNGEN: &str = "data/zuordnungen";

/// Liest das Verzeichnis `wurzel` komplett ein.
pub fn lies(wurzel: &Path, befunde: &mut Vec<Befund>) -> Rohdaten {
    let mut roh = Rohdaten::default();
    let data = wurzel.join("data");

    if !data.is_dir() {
        befunde.push(Befund::fehler(
            Pos::datei("data"),
            format!(
                "Verzeichnis \"data\" nicht gefunden in {}",
                wurzel.display()
            ),
        ));
        return roh;
    }

    // Ein komplett leeres `data/` ist ein gueltiger Startpunkt: das Tool ist
    // generisch, die Daten gehoeren dem Repo, in dem es laeuft. Erst wenn ein
    // Teil da ist und ein anderer fehlt, ist das ein Fehler.
    if ist_leerer_start(&data) {
        return roh;
    }

    lies_systeme(wurzel, &mut roh, befunde);
    lies_organisation(wurzel, &mut roh, befunde);
    lies_aufgaben(wurzel, &mut roh, befunde);
    lies_zuordnungen(wurzel, &mut roh, befunde);

    roh
}

// ---------------------------------------------------------------------------
// YAML-Stammdaten
// ---------------------------------------------------------------------------

/// Liest eine YAML-Datei und gibt Inhalt plus Zeilenindex der `id:`-Stellen
/// zurück. Bei einem Lese- oder Syntaxfehler entsteht ein Befund und `None`.
fn lies_yaml<T: Default + for<'de> Deserialize<'de>>(
    wurzel: &Path,
    rel: &str,
    befunde: &mut Vec<Befund>,
) -> Option<(T, String)> {
    let pfad: PathBuf = wurzel.join(rel);
    let text = match std::fs::read_to_string(&pfad) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            befunde.push(Befund::fehler(Pos::datei(rel), "Datei fehlt"));
            return None;
        }
        Err(e) => {
            befunde.push(Befund::fehler(
                Pos::datei(rel),
                format!("Datei nicht lesbar ({e})"),
            ));
            return None;
        }
    };
    // Eine leere Datei oder eine nur mit Kommentaren ist gueltig und ergibt
    // einfach keine Eintraege. So kann man eine Datei leeren und neu anfangen.
    if text
        .lines()
        .all(|z| z.trim().is_empty() || z.trim_start().starts_with('#'))
    {
        return Some((T::default(), text));
    }
    match serde_yaml::from_str::<T>(&text) {
        Ok(wert) => Some((wert, text)),
        Err(e) => {
            let zeile = e.location().map(|l| l.line()).unwrap_or(0);
            befunde.push(Befund::fehler(
                Pos::zeile(rel, zeile),
                format!("YAML nicht lesbar: {e}"),
            ));
            None
        }
    }
}

fn lies_systeme(wurzel: &Path, roh: &mut Rohdaten, befunde: &mut Vec<Befund>) {
    let Some((systeme, text)) = lies_yaml::<Vec<System>>(wurzel, SYSTEME, befunde) else {
        return;
    };
    let mut index = IdZeilen::neu(&text);
    let zeilen: Vec<&str> = text.lines().collect();
    for s in &systeme {
        let zeile = index.nimm(&s.id);
        roh.pos_systeme.push(Pos::zeile(SYSTEME, zeile));
        let status_zeile = schluessel_zeile(&zeilen, zeile, "status");
        roh.pos_systeme_status.push(Pos::zeile(
            SYSTEME,
            if status_zeile > 0 {
                status_zeile
            } else {
                zeile
            },
        ));
    }
    roh.systeme = systeme;
}

fn lies_organisation(wurzel: &Path, roh: &mut Rohdaten, befunde: &mut Vec<Befund>) {
    let Some((org, text)) = lies_yaml::<Organisation>(wurzel, ORGANISATION, befunde) else {
        return;
    };
    let mut index = IdZeilen::neu(&text);
    for gf in &org.geschaeftsfelder {
        roh.pos_geschaeftsfelder
            .push(Pos::zeile(ORGANISATION, index.nimm(&gf.id)));
    }
    for a in &org.abteilungen {
        roh.pos_abteilungen
            .push(Pos::zeile(ORGANISATION, index.nimm(&a.id)));
    }
    roh.geschaeftsfelder = org.geschaeftsfelder;
    roh.abteilungen = org.abteilungen;
}

fn lies_aufgaben(wurzel: &Path, roh: &mut Rohdaten, befunde: &mut Vec<Befund>) {
    let Some((objekte, text)) = lies_yaml::<Vec<Objekt>>(wurzel, AUFGABEN, befunde) else {
        return;
    };
    let mut index = IdZeilen::neu(&text);
    for o in &objekte {
        roh.pos_objekte
            .push(Pos::zeile(AUFGABEN, index.nimm(&o.id)));
        let mut auf = Vec::new();
        for a in &o.aufgaben {
            auf.push(Pos::zeile(AUFGABEN, index.nimm(&a.id)));
        }
        roh.pos_aufgaben.push(auf);
    }
    roh.objekte = objekte;
}

/// Zeilennummern aller `id: <wert>`-Stellen einer YAML-Datei, gruppiert nach
/// Wert. Die Vorkommen werden in Dokumentreihenfolge herausgegeben, damit auch
/// doppelte IDs die jeweils richtige Zeile bekommen.
struct IdZeilen {
    nach_wert: HashMap<String, VecDeque<usize>>,
}

impl IdZeilen {
    fn neu(text: &str) -> Self {
        let mut nach_wert: HashMap<String, VecDeque<usize>> = HashMap::new();
        for (nr, zeile) in text.lines().enumerate() {
            let mut ab = 0usize;
            while let Some(p) = zeile[ab..].find("id:") {
                let stelle = ab + p;
                let davor = zeile[..stelle].trim_end();
                // Nur echte Schlüsselpositionen: Zeilenanfang, Listenelement
                // oder innerhalb einer Flow-Map wie `- {id: x, name: y}`.
                let ist_schluessel = davor.is_empty()
                    || davor.ends_with('-')
                    || davor.ends_with('{')
                    || davor.ends_with(',');
                if ist_schluessel {
                    let wert = wert_ab(&zeile[stelle + 3..]);
                    if !wert.is_empty() {
                        nach_wert.entry(wert).or_default().push_back(nr + 1);
                    }
                }
                ab = stelle + 3;
            }
        }
        IdZeilen { nach_wert }
    }

    /// Nächste Zeile für diesen Wert, 0 wenn keine mehr da ist.
    fn nimm(&mut self, id: &str) -> usize {
        self.nach_wert
            .get_mut(id)
            .and_then(|v| v.pop_front())
            .unwrap_or(0)
    }
}

/// Skalarer Wert hinter einem Schlüssel, bis `,` oder `}` oder Zeilenende.
fn wert_ab(s: &str) -> String {
    let s = s.trim_start();
    let ende = s.find([',', '}']).unwrap_or(s.len());
    let mut wert = s[..ende].trim();
    if let Some(h) = wert.find(" #") {
        wert = wert[..h].trim_end();
    }
    wert.trim_matches(|c| c == '"' || c == '\'').to_string()
}

/// Sucht `schluessel:` im Block, der bei `id_zeile` beginnt. 0 wenn nicht
/// gefunden.
fn schluessel_zeile(zeilen: &[&str], id_zeile: usize, schluessel: &str) -> usize {
    if id_zeile == 0 || id_zeile > zeilen.len() {
        return 0;
    }
    let muster = format!("{schluessel}:");
    for (i, z) in zeilen.iter().enumerate().skip(id_zeile - 1) {
        if i == id_zeile - 1 {
            // Flow-Map: `- {id: x, status: aktiv}`
            if z.contains(&muster) {
                return i + 1;
            }
            continue;
        }
        let t = z.trim_start();
        if t.starts_with("- ") || t.starts_with("-\t") {
            break;
        }
        if t.starts_with(&muster) {
            return i + 1;
        }
    }
    0
}

// ---------------------------------------------------------------------------
// Zuordnungsdateien
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct Frontmatter {
    geschaeftsfeld: String,
}

fn lies_zuordnungen(wurzel: &Path, roh: &mut Rohdaten, befunde: &mut Vec<Befund>) {
    // Ein fehlendes oder leeres Verzeichnis ist kein Fehler: Stammdaten ohne
    // Zuordnungen sind ein normaler Zwischenstand beim Aufbau.
    for pfad in md_dateien(&wurzel.join(ZUORDNUNGEN)) {
        let name = pfad.file_name().unwrap_or_default().to_string_lossy();
        let rel = format!("{ZUORDNUNGEN}/{name}");
        match std::fs::read_to_string(&pfad) {
            Ok(text) => {
                if let Some(datei) = lies_zuordnungsdatei(&rel, &text, befunde) {
                    roh.dateien.push(datei);
                }
            }
            Err(e) => befunde.push(Befund::fehler(
                Pos::datei(&rel),
                format!("Datei nicht lesbar ({e})"),
            )),
        }
    }
}

fn lies_zuordnungsdatei(
    rel: &str,
    text: &str,
    befunde: &mut Vec<Befund>,
) -> Option<Zuordnungsdatei> {
    let zeilen: Vec<&str> = text.lines().collect();

    // Frontmatter: Block zwischen zwei `---` am Dateianfang. Regel F8.
    let mut erste = 0usize;
    while erste < zeilen.len() && zeilen[erste].trim().is_empty() {
        erste += 1;
    }
    if erste >= zeilen.len() || zeilen[erste].trim() != "---" {
        befunde.push(Befund::fehler(
            Pos::zeile(rel, 1),
            "Frontmatter fehlt (erwartet wird ein Block zwischen zwei \"---\" mit \"geschaeftsfeld:\")"
                .to_string(),
        ));
        return None;
    }
    let Some(ende) = (erste + 1..zeilen.len()).find(|&i| zeilen[i].trim() == "---") else {
        befunde.push(Befund::fehler(
            Pos::zeile(rel, erste + 1),
            "Frontmatter ist nicht geschlossen (zweites \"---\" fehlt)".to_string(),
        ));
        return None;
    };

    let block = zeilen[erste + 1..ende].join("\n");
    let gf = match serde_yaml::from_str::<Frontmatter>(&block) {
        Ok(f) => f.geschaeftsfeld,
        Err(_) => {
            befunde.push(Befund::fehler(
                Pos::zeile(rel, erste + 2),
                "Frontmatter enthält kein \"geschaeftsfeld:\"".to_string(),
            ));
            return None;
        }
    };
    let gf_zeile = (erste + 1..ende)
        .find(|&i| zeilen[i].trim_start().starts_with("geschaeftsfeld:"))
        .map(|i| i + 1)
        .unwrap_or(erste + 2);

    let mut datei = Zuordnungsdatei {
        gf,
        gf_pos: Pos::zeile(rel, gf_zeile),
        zeilen: Vec::new(),
    };

    // Tabellen einsammeln. Mehrere Tabellen je Datei sind erlaubt; alles
    // andere ist Freitext und wird ignoriert.
    let mut i = ende + 1;
    while i < zeilen.len() {
        if !ist_tabellenzeile(zeilen[i]) || i + 1 >= zeilen.len() || !ist_trennzeile(zeilen[i + 1])
        {
            i += 1;
            continue;
        }
        let spalten = Spalten::aus_kopf(&zellen(zeilen[i]));
        let mut j = i + 2;
        while j < zeilen.len() && ist_tabellenzeile(zeilen[j]) {
            if let Some(sp) = &spalten {
                let z = zellen(zeilen[j]);
                let pos = Pos::zeile(rel, j + 1);
                let abteilung = hole(&z, sp.abteilung);
                let aufgabe = hole(&z, sp.aufgabe);
                let system = hole(&z, sp.system);

                // Regel F12: Pflichtspalte leer.
                let mut fehlend = Vec::new();
                if abteilung.is_empty() {
                    fehlend.push("Abteilung");
                }
                if aufgabe.is_empty() {
                    fehlend.push("Aufgabe");
                }
                if system.is_empty() {
                    fehlend.push("System");
                }
                if fehlend.is_empty() {
                    datei.zeilen.push(Rohzeile {
                        abteilung,
                        aufgabe,
                        system,
                        anmerkung: sp.anmerkung.map(|k| hole(&z, k)).unwrap_or_default(),
                        pos,
                    });
                } else {
                    befunde.push(Befund::fehler(
                        pos,
                        format!(
                            "Zeile unvollständig, Spalte {} ist leer",
                            fehlend.join(" und ")
                        ),
                    ));
                }
            }
            j += 1;
        }
        i = j;
    }

    Some(datei)
}

/// Spaltenpositionen einer Tabellenkopfzeile.
struct Spalten {
    abteilung: usize,
    aufgabe: usize,
    system: usize,
    anmerkung: Option<usize>,
}

impl Spalten {
    /// `None`, wenn die Tabelle nicht die Pflichtspalten hat. Solche Tabellen
    /// werden komplett ignoriert.
    fn aus_kopf(kopf: &[String]) -> Option<Self> {
        let finde = |name: &str| {
            kopf.iter()
                .position(|c| c.trim().eq_ignore_ascii_case(name))
        };
        Some(Spalten {
            abteilung: finde("Abteilung")?,
            aufgabe: finde("Aufgabe")?,
            system: finde("System")?,
            anmerkung: finde("Anmerkung"),
        })
    }
}

fn hole(zeile: &[String], spalte: usize) -> String {
    zeile
        .get(spalte)
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

fn ist_tabellenzeile(zeile: &str) -> bool {
    zeile.trim_start().starts_with('|')
}

fn ist_trennzeile(zeile: &str) -> bool {
    if !ist_tabellenzeile(zeile) {
        return false;
    }
    let z = zellen(zeile);
    !z.is_empty()
        && z.iter().all(|c| {
            let c = c.trim();
            c.contains('-') && c.chars().all(|ch| ch == '-' || ch == ':' || ch == ' ')
        })
}

/// Zerlegt eine Tabellenzeile in getrimmte Zellen. Führendes und
/// abschließendes `|` entfallen, Leerzeichen um `|` sind egal.
fn zellen(zeile: &str) -> Vec<String> {
    let mut t = zeile.trim();
    t = t.strip_prefix('|').unwrap_or(t);
    t = t.strip_suffix('|').unwrap_or(t);
    t.split('|').map(|c| c.trim().to_string()).collect()
}
