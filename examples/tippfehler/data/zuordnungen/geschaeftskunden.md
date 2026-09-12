---
geschaeftsfeld: gk
---

# Geschaeftskunden

In dieser Tabelle stecken drei absichtliche Tippfehler: eine unbekannte
Aufgabe, ein System unter seinem ausgeschriebenen Namen statt seiner ID
und eine verstuemmelte Abteilung. `bplan validate` meldet alle drei mit
Datei, Zeile und Vorschlag.

| Abteilung | Aufgabe            | System     | Anmerkung                      |
|-----------|--------------------|------------|--------------------------------|
| vertrieb  | angebot.erstellen  | erp        | Standardweg                    |
| vertrieb  | angebot.erstellen  | excel      | Sonderkalkulation Grosskunden  |
| vertrieb  | angebot.senden     | erp        | Tippfehler, richtig: versenden |
| vertrieb  | kunde.anlegen      | shopsystem | Tippfehler, richtig: shop      |
| vertrib   | angebot.versenden  | erp        | Tippfehler, richtig: vertrieb  |
| service   | angebot.erstellen  | shop       | Angebot aus dem Shop           |
