//! Eigenständige HTML-Datei mit eingebettetem Modell.
//! Noch nicht gebaut, siehe SPEC.md Schritt 2.

use std::path::Path;
use std::process::ExitCode;

pub fn baue(_pfad: &Path, _ausgabe: &Path) -> ExitCode {
    eprintln!("bplan make: noch nicht implementiert (Schritt 2 in SPEC.md)");
    ExitCode::FAILURE
}
