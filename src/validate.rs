//! Die Regeln aus SPEC.md, Abschnitt "Validierung".
//!
//! Fehler blockieren `serve` und `make`, Warnungen werden nur angezeigt.
//! Jeder Befund trägt eine Fundstelle mit Datei und, wo möglich, Zeile.
//!
//! Regelnummern (F = Fehler, W = Warnung) werden in den Tests referenziert:
//!
//! F1  Unbekannte Abteilung in einer Zuordnung
//! F2  Unbekanntes Objekt in einer Aufgabenreferenz
//! F3  Unbekannte Aufgabe innerhalb eines bekannten Objekts
//! F4  Unbekanntes System in einer Zuordnung
//! F5  Unbekanntes Geschäftsfeld im Frontmatter
//! F6  Doppelte ID innerhalb einer Stammdatendatei
//! F7  Aufgabenreferenz ohne Punkt
//! F8  Frontmatter fehlt oder ist unvollständig
//! F9  `bearbeitet` oder `geschaeftsfelder` referenziert eine unbekannte ID
//! F10 Status eines Systems nicht aus der erlaubten Menge
//! F11 ID verletzt das Muster [a-z0-9-]+
//! F12 Zuordnungszeile mit leerer Pflichtspalte
//! F13 Datei fehlt oder ist nicht lesbar
//!
//! W1  Exakt doppelte Zeile
//! W2  Zuordnung in einem Geschäftsfeld, in dem die Abteilung nicht arbeitet
//! W3  Zuordnung für ein Objekt, das nicht in `bearbeitet` steht
//! W4  System ohne einzige Zuordnung
//! W5  Abteilung ohne einzige Zuordnung
//! W6  `auslaufend` ohne `ende`
//! W7  Abteilung ist für kein Objekt zuständig (`bearbeitet` leer)

use std::collections::{HashMap, HashSet};
use std::path::Path;

use crate::model::{id_gueltig, Modell, Pos, Zuordnung, STATUS_WERTE};
use crate::parse;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Schwere {
    Fehler,
    Warnung,
}

impl Schwere {
    pub fn wort(self) -> &'static str {
        match self {
            Schwere::Fehler => "Fehler",
            Schwere::Warnung => "Warnung",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Befund {
    pub schwere: Schwere,
    pub pos: Pos,
    pub text: String,
}

impl Befund {
    pub fn fehler(pos: Pos, text: impl Into<String>) -> Self {
        Befund {
            schwere: Schwere::Fehler,
            pos,
            text: text.into(),
        }
    }

    pub fn warnung(pos: Pos, text: impl Into<String>) -> Self {
        Befund {
            schwere: Schwere::Warnung,
            pos,
            text: text.into(),
        }
    }
}

/// Ergebnis eines Laufs von `bplan validate`.
pub struct Ergebnis {
    /// Wird von `make` (Schritt 2) und `serve` (Schritt 3) ausgeliefert.
    pub modell: Modell,
    pub befunde: Vec<Befund>,
    /// Anzahl gelesener Zuordnungsdateien, für die Zusammenfassungszeile.
    pub dateien: usize,
    /// Anzahl gelesener Tabellenzeilen, auch der fehlerhaften.
    pub zuordnungen: usize,
}

impl Ergebnis {
    pub fn fehler(&self) -> usize {
        self.befunde
            .iter()
            .filter(|b| b.schwere == Schwere::Fehler)
            .count()
    }

    pub fn warnungen(&self) -> usize {
        self.befunde
            .iter()
            .filter(|b| b.schwere == Schwere::Warnung)
            .count()
    }

    pub fn hat_fehler(&self) -> bool {
        self.fehler() > 0
    }

    /// Nichts gefunden und nichts zu meckern: ein frisch geleertes `data/`.
    pub fn ist_leer(&self) -> bool {
        self.befunde.is_empty()
            && self.modell.systeme.is_empty()
            && self.modell.abteilungen.is_empty()
            && self.modell.objekte.is_empty()
            && self.modell.zuordnungen.is_empty()
    }
}

/// Liest `wurzel` ein, prüft alle Regeln und baut das Modell.
pub fn pruefe(wurzel: &Path) -> Ergebnis {
    let mut befunde: Vec<Befund> = Vec::new();
    let roh = parse::lies(wurzel, &mut befunde);

    pruefe_id_muster(&roh, &mut befunde);
    pruefe_doppelte_ids(&roh, &mut befunde);
    pruefe_systeme(&roh, &mut befunde);
    pruefe_abteilungsreferenzen(&roh, &mut befunde);

    let zuordnungen = pruefe_zuordnungen(&roh, &mut befunde);
    pruefe_ungenutzt(&roh, &zuordnungen, &mut befunde);

    befunde.sort_by(|a, b| {
        a.schwere
            .cmp(&b.schwere)
            .then_with(|| a.pos.cmp(&b.pos))
            .then_with(|| a.text.cmp(&b.text))
    });

    let warnungen = befunde
        .iter()
        .filter(|b| b.schwere == Schwere::Warnung)
        .map(|b| format!("{}  {}", b.pos, b.text))
        .collect();

    let modell = Modell {
        generiert: chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
        geschaeftsfelder: roh.geschaeftsfelder.clone(),
        abteilungen: roh.abteilungen.clone(),
        systeme: roh.systeme.clone(),
        objekte: roh.objekte.clone(),
        zuordnungen,
        warnungen,
    };

    Ergebnis {
        dateien: roh.dateien.len(),
        zuordnungen: roh.anzahl_zuordnungen(),
        modell,
        befunde,
    }
}

// ---------------------------------------------------------------------------
// Stammdaten
// ---------------------------------------------------------------------------

/// Regel F11.
fn pruefe_id_muster(roh: &parse::Rohdaten, befunde: &mut Vec<Befund>) {
    let melde = |art: &str, id: &str, pos: &Pos, befunde: &mut Vec<Befund>| {
        if !id_gueltig(id) {
            befunde.push(Befund::fehler(
                pos.clone(),
                format!("{art}-ID \"{id}\" ist ungültig (erlaubt sind nur a-z, 0-9 und -)"),
            ));
        }
    };

    for (gf, pos) in roh.geschaeftsfelder.iter().zip(&roh.pos_geschaeftsfelder) {
        melde("Geschäftsfeld", &gf.id, pos, befunde);
    }
    for (a, pos) in roh.abteilungen.iter().zip(&roh.pos_abteilungen) {
        melde("Abteilungs", &a.id, pos, befunde);
    }
    for (s, pos) in roh.systeme.iter().zip(&roh.pos_systeme) {
        melde("System", &s.id, pos, befunde);
    }
    for (o, pos) in roh.objekte.iter().zip(&roh.pos_objekte) {
        melde("Objekt", &o.id, pos, befunde);
    }
    for ((o, positionen), o_pos) in roh
        .objekte
        .iter()
        .zip(&roh.pos_aufgaben)
        .zip(&roh.pos_objekte)
    {
        for (i, a) in o.aufgaben.iter().enumerate() {
            let pos = positionen.get(i).unwrap_or(o_pos);
            melde("Aufgaben", &a.id, pos, befunde);
        }
    }
}

/// Regel F6. Geprüft wird je Liste, also je Namensraum: zwei gleiche IDs in
/// `geschaeftsfelder` und `abteilungen` stören sich nicht.
fn pruefe_doppelte_ids(roh: &parse::Rohdaten, befunde: &mut Vec<Befund>) {
    fn doppelte<'a>(
        art: &str,
        ids: impl Iterator<Item = &'a str>,
        positionen: &[Pos],
        zusatz: &str,
        befunde: &mut Vec<Befund>,
    ) {
        let mut gesehen: HashMap<&str, usize> = HashMap::new();
        for (i, id) in ids.enumerate() {
            let leer = Pos::datei("");
            let pos = positionen.get(i).unwrap_or(&leer);
            match gesehen.get(id) {
                Some(&erste) => {
                    let erste_zeile = positionen.get(erste).map(|p| p.zeile).unwrap_or(0);
                    let hinweis = if erste_zeile > 0 {
                        format!(" (schon in Zeile {erste_zeile})")
                    } else {
                        String::new()
                    };
                    befunde.push(Befund::fehler(
                        pos.clone(),
                        format!("{art}-ID \"{id}\" ist doppelt{zusatz}{hinweis}"),
                    ));
                }
                None => {
                    gesehen.insert(id, i);
                }
            }
        }
    }

    doppelte(
        "Geschäftsfeld",
        roh.geschaeftsfelder.iter().map(|g| g.id.as_str()),
        &roh.pos_geschaeftsfelder,
        "",
        befunde,
    );
    doppelte(
        "Abteilungs",
        roh.abteilungen.iter().map(|a| a.id.as_str()),
        &roh.pos_abteilungen,
        "",
        befunde,
    );
    doppelte(
        "System",
        roh.systeme.iter().map(|s| s.id.as_str()),
        &roh.pos_systeme,
        "",
        befunde,
    );
    doppelte(
        "Objekt",
        roh.objekte.iter().map(|o| o.id.as_str()),
        &roh.pos_objekte,
        "",
        befunde,
    );
    for (i, o) in roh.objekte.iter().enumerate() {
        let leer: Vec<Pos> = Vec::new();
        let positionen = roh.pos_aufgaben.get(i).unwrap_or(&leer);
        doppelte(
            "Aufgaben",
            o.aufgaben.iter().map(|a| a.id.as_str()),
            positionen,
            &format!(" in Objekt \"{}\"", o.id),
            befunde,
        );
    }
}

/// Regeln F10 und W6.
fn pruefe_systeme(roh: &parse::Rohdaten, befunde: &mut Vec<Befund>) {
    for (i, s) in roh.systeme.iter().enumerate() {
        let pos = roh
            .pos_systeme
            .get(i)
            .cloned()
            .unwrap_or_else(|| Pos::datei("data/systeme.yaml"));
        let status_pos = roh
            .pos_systeme_status
            .get(i)
            .cloned()
            .unwrap_or_else(|| pos.clone());
        let erlaubt = STATUS_WERTE.join(", ");

        if s.status.is_empty() {
            befunde.push(Befund::fehler(
                pos.clone(),
                format!("System \"{}\" hat keinen Status (erlaubt: {erlaubt})", s.id),
            ));
        } else if !STATUS_WERTE.contains(&s.status.as_str()) {
            befunde.push(Befund::fehler(
                status_pos.clone(),
                format!(
                    "Status \"{}\" von System \"{}\" ist nicht erlaubt (erlaubt: {erlaubt})",
                    s.status, s.id
                ),
            ));
        }

        if s.status == "auslaufend" && s.ende.is_none() {
            befunde.push(Befund::warnung(
                pos,
                format!("System \"{}\" ist auslaufend, hat aber kein \"ende\"", s.id),
            ));
        }
    }
}

/// Regeln F9 und W7.
fn pruefe_abteilungsreferenzen(roh: &parse::Rohdaten, befunde: &mut Vec<Befund>) {
    for (i, a) in roh.abteilungen.iter().enumerate() {
        let pos = roh
            .pos_abteilungen
            .get(i)
            .cloned()
            .unwrap_or_else(|| Pos::datei("data/organisation.yaml"));

        for gf in &a.geschaeftsfelder {
            if !roh.geschaeftsfelder.iter().any(|g| &g.id == gf) {
                let v = vorschlag(
                    gf,
                    roh.geschaeftsfelder
                        .iter()
                        .map(|g| (g.id.as_str(), g.name.as_str())),
                );
                befunde.push(Befund::fehler(
                    pos.clone(),
                    mit_vorschlag(
                        format!(
                            "Abteilung \"{}\" verweist auf unbekanntes Geschäftsfeld \"{gf}\"",
                            a.id
                        ),
                        v,
                    ),
                ));
            }
        }

        for objekt in &a.bearbeitet {
            if !roh.objekte.iter().any(|o| &o.id == objekt) {
                let v = vorschlag(
                    objekt,
                    roh.objekte.iter().map(|o| (o.id.as_str(), o.name.as_str())),
                );
                befunde.push(Befund::fehler(
                    pos.clone(),
                    mit_vorschlag(
                        format!(
                            "\"bearbeitet\" von Abteilung \"{}\" verweist auf unbekanntes Objekt \"{objekt}\"",
                            a.id
                        ),
                        v,
                    ),
                ));
            }
        }

        if a.bearbeitet.is_empty() {
            befunde.push(Befund::warnung(
                pos,
                format!("Abteilung \"{}\" ist für kein Objekt zuständig", a.id),
            ));
        }
    }
}

// ---------------------------------------------------------------------------
// Zuordnungen
// ---------------------------------------------------------------------------

/// Regeln F1 bis F5, F7 sowie W1 bis W3. Gibt die geprüften Zuordnungen für
/// das Modell zurück.
fn pruefe_zuordnungen(roh: &parse::Rohdaten, befunde: &mut Vec<Befund>) -> Vec<Zuordnung> {
    let mut ergebnis: Vec<Zuordnung> = Vec::new();
    // Schlüssel der bereits gesehenen Wege, für Regel W1.
    let mut gesehen: HashMap<(String, String, String, String, String), Pos> = HashMap::new();

    for datei in &roh.dateien {
        // Regel F5.
        let gf_bekannt = roh.geschaeftsfelder.iter().any(|g| g.id == datei.gf);
        if !gf_bekannt {
            let v = vorschlag(
                &datei.gf,
                roh.geschaeftsfelder
                    .iter()
                    .map(|g| (g.id.as_str(), g.name.as_str())),
            );
            befunde.push(Befund::fehler(
                datei.gf_pos.clone(),
                mit_vorschlag(format!("Geschäftsfeld \"{}\" unbekannt", datei.gf), v),
            ));
        }

        for zeile in &datei.zeilen {
            let pos = zeile.pos.clone();

            // Regel F1.
            let abteilung = roh.abteilungen.iter().find(|a| a.id == zeile.abteilung);
            if abteilung.is_none() {
                let v = vorschlag(
                    &zeile.abteilung,
                    roh.abteilungen
                        .iter()
                        .map(|a| (a.id.as_str(), a.name.as_str())),
                );
                befunde.push(Befund::fehler(
                    pos.clone(),
                    mit_vorschlag(format!("Abteilung \"{}\" unbekannt", zeile.abteilung), v),
                ));
            }

            // Regeln F7, F2, F3.
            let capability = pruefe_capability(roh, zeile, &pos, befunde);

            // Regel F4.
            let system = roh.systeme.iter().find(|s| s.id == zeile.system);
            if system.is_none() {
                let v = vorschlag(
                    &zeile.system,
                    roh.systeme.iter().map(|s| (s.id.as_str(), s.name.as_str())),
                );
                befunde.push(Befund::fehler(
                    pos.clone(),
                    mit_vorschlag(format!("System \"{}\" unbekannt", zeile.system), v),
                ));
            }

            let (Some(abteilung), Some((objekt, aufgabe)), Some(system), true) =
                (abteilung, capability, system, gf_bekannt)
            else {
                continue;
            };

            // Regel W2.
            if !abteilung.geschaeftsfelder.contains(&datei.gf) {
                befunde.push(Befund::warnung(
                    pos.clone(),
                    format!(
                        "Abteilung \"{}\" arbeitet laut organisation.yaml nicht im Geschäftsfeld \"{}\"",
                        abteilung.id, datei.gf
                    ),
                ));
            }

            // Regel W3.
            if !abteilung.bearbeitet.contains(&objekt) {
                befunde.push(Befund::warnung(
                    pos.clone(),
                    format!(
                        "Objekt \"{objekt}\" steht nicht in \"bearbeitet\" von Abteilung \"{}\" (entweder die Regel ergänzen oder die Zeile ist falsch)",
                        abteilung.id
                    ),
                ));
            }

            // Regel W1.
            let schluessel = (
                datei.gf.clone(),
                abteilung.id.clone(),
                objekt.clone(),
                aufgabe.clone(),
                system.id.clone(),
            );
            match gesehen.get(&schluessel) {
                Some(erste) => {
                    // Innerhalb derselben Datei reicht die Zeile, sonst braucht
                    // es den Dateinamen dazu.
                    let wo = if erste.datei == pos.datei {
                        format!("Zeile {}", erste.zeile)
                    } else {
                        erste.to_string()
                    };
                    befunde.push(Befund::warnung(
                        pos.clone(),
                        format!("Zeile ist exakt doppelt (schon in {wo})"),
                    ));
                }
                None => {
                    gesehen.insert(schluessel, pos.clone());
                }
            }

            ergebnis.push(Zuordnung {
                gf: datei.gf.clone(),
                abteilung: abteilung.id.clone(),
                objekt,
                aufgabe,
                system: system.id.clone(),
                anmerkung: zeile.anmerkung.clone(),
                quelle: pos.to_string(),
            });
        }
    }

    ergebnis
}

/// Zerlegt `objekt.aufgabe` und prüft beide Teile. Regeln F7, F2, F3.
fn pruefe_capability(
    roh: &parse::Rohdaten,
    zeile: &parse::Rohzeile,
    pos: &Pos,
    befunde: &mut Vec<Befund>,
) -> Option<(String, String)> {
    let Some((objekt_id, aufgabe_id)) = zeile.aufgabe.split_once('.') else {
        befunde.push(Befund::fehler(
            pos.clone(),
            format!(
                "Aufgabe \"{}\" hat keinen Punkt (erwartet wird objekt.aufgabe)",
                zeile.aufgabe
            ),
        ));
        return None;
    };

    let Some(objekt) = roh.objekte.iter().find(|o| o.id == objekt_id) else {
        let v = vorschlag(
            objekt_id,
            roh.objekte.iter().map(|o| (o.id.as_str(), o.name.as_str())),
        );
        befunde.push(Befund::fehler(
            pos.clone(),
            mit_vorschlag(format!("Objekt \"{objekt_id}\" unbekannt"), v),
        ));
        return None;
    };

    if objekt.aufgaben.iter().any(|a| a.id == aufgabe_id) {
        return Some((objekt_id.to_string(), aufgabe_id.to_string()));
    }

    let liste: Vec<&str> = objekt.aufgaben.iter().map(|a| a.id.as_str()).collect();
    let v = vorschlag(
        aufgabe_id,
        objekt
            .aufgaben
            .iter()
            .map(|a| (a.id.as_str(), a.name.as_str())),
    );
    let hinweis = match v {
        Some(id) => format!("; meintest du \"{id}\"?"),
        None => String::new(),
    };
    befunde.push(Befund::fehler(
        pos.clone(),
        format!(
            "Aufgabe \"{}\" unbekannt (Objekt {} hat: {}{hinweis})",
            zeile.aufgabe,
            objekt.name,
            liste.join(", ")
        ),
    ));
    None
}

/// Regeln W4 und W5.
fn pruefe_ungenutzt(roh: &parse::Rohdaten, zuordnungen: &[Zuordnung], befunde: &mut Vec<Befund>) {
    let genutzte_systeme: HashSet<&str> = zuordnungen.iter().map(|z| z.system.as_str()).collect();
    let genutzte_abteilungen: HashSet<&str> =
        zuordnungen.iter().map(|z| z.abteilung.as_str()).collect();

    for (i, s) in roh.systeme.iter().enumerate() {
        if !genutzte_systeme.contains(s.id.as_str()) {
            let pos = roh
                .pos_systeme
                .get(i)
                .cloned()
                .unwrap_or_else(|| Pos::datei("data/systeme.yaml"));
            befunde.push(Befund::warnung(
                pos,
                format!("System \"{}\" hat keine einzige Zuordnung", s.id),
            ));
        }
    }

    for (i, a) in roh.abteilungen.iter().enumerate() {
        if !genutzte_abteilungen.contains(a.id.as_str()) {
            let pos = roh
                .pos_abteilungen
                .get(i)
                .cloned()
                .unwrap_or_else(|| Pos::datei("data/organisation.yaml"));
            befunde.push(Befund::warnung(
                pos,
                format!("Abteilung \"{}\" hat keine einzige Zuordnung", a.id),
            ));
        }
    }
}

// ---------------------------------------------------------------------------
// Vorschläge bei unbekannten IDs
// ---------------------------------------------------------------------------

/// Maximale Levenshtein-Distanz für einen Vorschlag, laut SPEC.md.
const MAX_DISTANZ: usize = 3;

/// Sucht den ähnlichsten bekannten Wert. Verglichen wird klein geschrieben
/// sowohl mit der ID als auch mit dem Anzeigenamen, vorgeschlagen wird immer
/// die ID. So findet "shopsystem" das System "shop" mit dem Namen "Shopsystem",
/// was mit einem reinen ID-Vergleich nicht ginge.
pub fn vorschlag<'a>(
    eingabe: &str,
    kandidaten: impl Iterator<Item = (&'a str, &'a str)>,
) -> Option<String> {
    let eingabe = eingabe.to_lowercase();
    let mut beste: Option<(usize, String)> = None;
    for (id, name) in kandidaten {
        let distanz = levenshtein(&eingabe, &id.to_lowercase())
            .min(levenshtein(&eingabe, &name.to_lowercase()));
        if distanz <= MAX_DISTANZ && beste.as_ref().is_none_or(|(b, _)| distanz < *b) {
            beste = Some((distanz, id.to_string()));
        }
    }
    beste.map(|(_, id)| id)
}

fn mit_vorschlag(basis: String, vorschlag: Option<String>) -> String {
    match vorschlag {
        Some(id) => format!("{basis} (meintest du \"{id}\"?)"),
        None => basis,
    }
}

fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.is_empty() {
        return b.len();
    }
    if b.is_empty() {
        return a.len();
    }
    let mut vorherige: Vec<usize> = (0..=b.len()).collect();
    let mut aktuelle = vec![0usize; b.len() + 1];
    for i in 1..=a.len() {
        aktuelle[0] = i;
        for j in 1..=b.len() {
            let kosten = usize::from(a[i - 1] != b[j - 1]);
            aktuelle[j] = (vorherige[j] + 1)
                .min(aktuelle[j - 1] + 1)
                .min(vorherige[j - 1] + kosten);
        }
        std::mem::swap(&mut vorherige, &mut aktuelle);
    }
    vorherige[b.len()]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levenshtein_rechnet_richtig() {
        assert_eq!(levenshtein("", ""), 0);
        assert_eq!(levenshtein("shop", "shop"), 0);
        assert_eq!(levenshtein("shopp", "shop"), 1);
        assert_eq!(levenshtein("shopsystem", "shop"), 6);
        assert_eq!(levenshtein("verlängern", "verlaengern"), 2);
    }

    #[test]
    fn vorschlag_findet_ueber_den_anzeigenamen() {
        let systeme = [("shop", "Shopsystem"), ("erp", "ERP")];
        assert_eq!(
            vorschlag("shopsystem", systeme.into_iter()),
            Some("shop".to_string())
        );
    }

    #[test]
    fn vorschlag_findet_ueber_die_id() {
        let systeme = [("shop", "Shopsystem"), ("erp", "ERP")];
        assert_eq!(
            vorschlag("erp2", systeme.into_iter()),
            Some("erp".to_string())
        );
    }

    #[test]
    fn vorschlag_schweigt_wenn_nichts_passt() {
        let systeme = [("shop", "Shopsystem"), ("erp", "ERP")];
        assert_eq!(vorschlag("navision", systeme.into_iter()), None);
    }
}
