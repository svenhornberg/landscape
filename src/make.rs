//! `bplan make`: baut das Modell und schreibt eine eigenständige HTML-Datei.
//!
//! Das Frontend ist zur Bauzeit eingebettet. `make` ersetzt darin den
//! Platzhalter durch das Modell als JSON. Die entstehende Datei ist per Mail
//! verschickbar und funktioniert per Doppelklick ohne Server.

use std::path::Path;
use std::process::ExitCode;

use crate::model::Modell;
use crate::validate;

/// Das komplette Frontend, siehe SPEC.md, Abschnitt "Frontend".
const FRONTEND: &str = include_str!("../frontend/index.html");

/// Stelle im Frontend, an die das Modell kommt.
const PLATZHALTER: &str = "<!--MODEL-->";

pub fn baue(pfad: &Path, ausgabe: &Path) -> ExitCode {
    let ergebnis = validate::pruefe(pfad);
    crate::zeige(&ergebnis);
    if ergebnis.hat_fehler() {
        eprintln!("bplan make: abgebrochen, erst die Fehler beheben.");
        return ExitCode::FAILURE;
    }

    let html = match seite(&ergebnis.modell) {
        Ok(html) => html,
        Err(meldung) => {
            eprintln!("bplan make: {meldung}");
            return ExitCode::FAILURE;
        }
    };

    if let Some(ordner) = ausgabe.parent() {
        if !ordner.as_os_str().is_empty() {
            if let Err(fehler) = std::fs::create_dir_all(ordner) {
                eprintln!(
                    "bplan make: Verzeichnis {} laesst sich nicht anlegen: {fehler}",
                    ordner.display()
                );
                return ExitCode::FAILURE;
            }
        }
    }

    if let Err(fehler) = std::fs::write(ausgabe, &html) {
        eprintln!(
            "bplan make: {} laesst sich nicht schreiben: {fehler}",
            ausgabe.display()
        );
        return ExitCode::FAILURE;
    }

    println!("{} geschrieben, {}", ausgabe.display(), groesse(html.len()));
    ExitCode::SUCCESS
}

/// Setzt das Modell in das eingebettete Frontend ein.
fn seite(modell: &Modell) -> Result<String, String> {
    if !FRONTEND.contains(PLATZHALTER) {
        return Err(format!("im Frontend fehlt der Platzhalter {PLATZHALTER}"));
    }
    let json = serde_json::to_string(modell)
        .map_err(|fehler| format!("Modell laesst sich nicht serialisieren: {fehler}"))?;
    Ok(FRONTEND.replace(PLATZHALTER, &fuer_script_tag(&json)))
}

/// Ersetzt jedes `<` durch seine JSON-Escape-Form. In der Ausgabe von
/// `serde_json` steht `<` nur innerhalb von Zeichenketten, das Ergebnis bleibt
/// also gültiges JSON. Damit kann keine Anmerkung mit einem schließenden
/// Script-Tag das eingebettete Modell vorzeitig beenden.
fn fuer_script_tag(json: &str) -> String {
    json.replace('<', "\\u003c")
}

fn groesse(bytes: usize) -> String {
    if bytes < 1024 {
        format!("{bytes} Bytes")
    } else if bytes < 1024 * 1024 {
        format!("{} KB", bytes / 1024)
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}
