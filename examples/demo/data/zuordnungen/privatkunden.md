---
geschaeftsfeld: pk
---

# Privatkunden

Kein CRM-Rollout, der Shop ist hier der fuehrende Weg.

| Abteilung   | Aufgabe             | System | Anmerkung              |
|-------------|---------------------|--------|------------------------|
| service     | bestellung.erfassen | shop   | Kunde bestellt selbst  |
| service     | bestellung.pruefen  | shop   |                        |
| service     | kunde.anlegen       | shop   |                        |
| service     | retoure.erfassen    | ticket |                        |
| lager       | bestellung.versenden| erp    |                        |
| lager       | retoure.erfassen    | shop   | Retourenportal         |
| lager       | retoure.erstatten   | erp    |                        |
| buchhaltung | rechnung.erstellen  | erp    |                        |
| buchhaltung | rechnung.mahnen     | mahn   |                        |
