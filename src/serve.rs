//! Lokaler Webserver. Noch nicht gebaut, siehe SPEC.md Schritt 3.

use std::path::Path;
use std::process::ExitCode;

pub fn starte(_pfad: &Path, _port: u16, _open: bool) -> ExitCode {
    eprintln!("bplan serve: noch nicht implementiert (Schritt 3 in SPEC.md)");
    ExitCode::FAILURE
}
