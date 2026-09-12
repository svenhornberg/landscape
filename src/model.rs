//! Datenstrukturen der Stammdaten und das JSON-Modell für das Frontend.
//!
//! Das Binary liefert nur das validierte Modell. Alle Kennzahlen (Redundanz,
//! White Spots, max je Zelle) rechnet das Frontend selbst aus den Rohdaten,
//! damit diese Logik an genau einer Stelle liegt.

use serde::{Deserialize, Serialize};

/// Erlaubte Werte für `status` in `systeme.yaml`.
pub const STATUS_WERTE: [&str; 3] = ["aktiv", "auslaufend", "geplant"];

/// Erlaubtes Muster für alle IDs: `[a-z0-9-]+`.
pub fn id_gueltig(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Ein System aus `systeme.yaml`.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct System {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub verantwortlich: Option<String>,
    /// Bewusst als freier String gelesen: ein unerlaubter Wert soll eine
    /// Validierungsmeldung mit Datei und Zeile werden, kein YAML-Parse-Fehler.
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub seit: Option<i64>,
    #[serde(default)]
    pub ende: Option<i64>,
    #[serde(default)]
    pub notiz: Option<String>,
}

/// Ein Geschäftsfeld aus `organisation.yaml`.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Geschaeftsfeld {
    pub id: String,
    pub name: String,
}

/// Eine Abteilung aus `organisation.yaml`.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Abteilung {
    pub id: String,
    pub name: String,
    /// In welchen Säulen die Abteilung arbeitet.
    #[serde(default)]
    pub geschaeftsfelder: Vec<String>,
    /// Für welche Objekte sie zuständig ist. Das ist die Zuständigkeitsregel,
    /// aus der sich White Spots ergeben.
    #[serde(default)]
    pub bearbeitet: Vec<String>,
}

/// Wurzel von `organisation.yaml`.
#[derive(Debug, Default, Deserialize)]
pub struct Organisation {
    #[serde(default)]
    pub geschaeftsfelder: Vec<Geschaeftsfeld>,
    #[serde(default)]
    pub abteilungen: Vec<Abteilung>,
}

/// Eine Aufgabe innerhalb eines Objekts.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Aufgabe {
    pub id: String,
    pub name: String,
}

/// Ein Objekt aus `aufgaben.yaml`. Objekt und Aufgabe zusammen ergeben die
/// Capability, referenziert als `objekt.aufgabe`.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Objekt {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub aufgaben: Vec<Aufgabe>,
}

/// Ein geprüfter Weg: Abteilung erledigt eine Aufgabe in einem Geschäftsfeld
/// mit einem System.
#[derive(Debug, Clone, Serialize)]
pub struct Zuordnung {
    pub gf: String,
    pub abteilung: String,
    pub objekt: String,
    pub aufgabe: String,
    pub system: String,
    pub anmerkung: String,
    /// Datei und Zeile, damit das Frontend bei jedem Weg zeigen kann, wo er
    /// herkommt, z. B. `data/zuordnungen/geschaeftskunden.md:14`.
    pub quelle: String,
}

/// Das vollständige Modell, wie es `serve` als JSON ausliefert und `make` in
/// die HTML-Datei einbettet.
#[derive(Debug, Serialize)]
pub struct Modell {
    pub generiert: String,
    pub geschaeftsfelder: Vec<Geschaeftsfeld>,
    pub abteilungen: Vec<Abteilung>,
    pub systeme: Vec<System>,
    pub objekte: Vec<Objekt>,
    pub zuordnungen: Vec<Zuordnung>,
    pub warnungen: Vec<String>,
}

/// Stelle in einer Datei. `zeile` ist 1-basiert; 0 bedeutet "keine Zeile
/// bekannt" und wird beim Ausgeben weggelassen.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Pos {
    /// Pfad relativ zum übergebenen Wurzelverzeichnis, immer mit `/`.
    pub datei: String,
    pub zeile: usize,
}

impl Pos {
    pub fn datei(datei: impl Into<String>) -> Self {
        Pos {
            datei: datei.into(),
            zeile: 0,
        }
    }

    pub fn zeile(datei: impl Into<String>, zeile: usize) -> Self {
        Pos {
            datei: datei.into(),
            zeile,
        }
    }
}

impl std::fmt::Display for Pos {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if self.zeile > 0 {
            write!(f, "{}:{}", self.datei, self.zeile)
        } else {
            write!(f, "{}", self.datei)
        }
    }
}
