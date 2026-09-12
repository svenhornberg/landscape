//! bplan - Bebauungsplan (Aufgabe x Abteilung -> System) aus versionierten
//! Textdateien. Siehe SPEC.md.

mod make;
mod model;
mod parse;
mod serve;
mod validate;

use std::io::IsTerminal;
use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};

use validate::{Ergebnis, Schwere};

#[derive(Parser)]
#[command(
    name = "bplan",
    version,
    about = "Bebauungsplan aus versionierten Textdateien",
    long_about = "Rendert aus Textdateien einen interaktiven Bebauungsplan \
                  (Aufgabe x Abteilung -> System) und zeigt, wo mehrere Systeme \
                  dieselbe Aufgabe erledigen und wo eine zuständige Abteilung \
                  keinen Weg hat."
)]
struct Cli {
    #[command(subcommand)]
    kommando: Kommando,
}

#[derive(Subcommand)]
enum Kommando {
    /// Prüft die Datendateien, Exit-Code 0 oder 1
    Validate {
        /// Verzeichnis mit data/, Default ist das aktuelle Verzeichnis
        #[arg(default_value = ".")]
        pfad: PathBuf,
    },
    /// Lokaler Webserver auf 127.0.0.1, liest bei jedem Request neu
    Serve {
        #[arg(default_value = ".")]
        pfad: PathBuf,
        #[arg(long, default_value_t = 8080)]
        port: u16,
        /// Browser öffnen
        #[arg(long)]
        open: bool,
    },
    /// Erzeugt eine eigenständige HTML-Datei mit eingebettetem Modell
    Make {
        #[arg(default_value = ".")]
        pfad: PathBuf,
        #[arg(short, long, default_value = "bebauungsplan.html")]
        output: PathBuf,
    },
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match cli.kommando {
        Kommando::Validate { pfad } => {
            let ergebnis = validate::pruefe(&pfad);
            zeige(&ergebnis);
            if ergebnis.hat_fehler() {
                ExitCode::FAILURE
            } else {
                ExitCode::SUCCESS
            }
        }
        Kommando::Serve { pfad, port, open } => serve::starte(&pfad, port, open),
        Kommando::Make { pfad, output } => make::baue(&pfad, &output),
    }
}

/// Gibt Befunde und Zusammenfassung aus, im Format aus SPEC.md:
///
/// ```text
/// data/zuordnungen/geschaeftskunden.md:14  Fehler   System "shopsystem" unbekannt (meintest du "shop"?)
/// 3 Dateien, 212 Zuordnungen, 2 Fehler, 1 Warnung
/// ```
fn zeige(ergebnis: &Ergebnis) {
    let farbig = std::io::stdout().is_terminal() && std::env::var_os("NO_COLOR").is_none();

    let breite = ergebnis
        .befunde
        .iter()
        .map(|b| b.pos.to_string().chars().count())
        .max()
        .unwrap_or(0);

    for befund in &ergebnis.befunde {
        let ort = befund.pos.to_string();
        let fuellung = " ".repeat(breite.saturating_sub(ort.chars().count()));
        let wort = befund.schwere.wort();
        let wort = if farbig {
            let farbe = match befund.schwere {
                Schwere::Fehler => "\x1b[31m",
                Schwere::Warnung => "\x1b[33m",
            };
            format!("{farbe}{wort:<7}\x1b[0m")
        } else {
            format!("{wort:<7}")
        };
        println!("{ort}{fuellung}  {wort}  {}", befund.text);
    }

    println!(
        "{}, {}, {}, {}",
        anzahl(ergebnis.dateien, "Datei", "Dateien"),
        anzahl(ergebnis.zuordnungen, "Zuordnung", "Zuordnungen"),
        anzahl(ergebnis.fehler(), "Fehler", "Fehler"),
        anzahl(ergebnis.warnungen(), "Warnung", "Warnungen"),
    );

    if ergebnis.ist_leer() {
        println!(
            "Noch keine Daten unter data/. Erwartet werden systeme.yaml, \
             organisation.yaml, aufgaben.yaml und zuordnungen/<geschaeftsfeld>.md, \
             siehe SPEC.md."
        );
    }
}

fn anzahl(n: usize, einzahl: &str, mehrzahl: &str) -> String {
    format!("{n} {}", if n == 1 { einzahl } else { mehrzahl })
}
