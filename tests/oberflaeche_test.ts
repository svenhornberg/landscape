// Das Frontend im echten Browser. Alle Kennzahlen (Wege, Redundanz, White
// Spots) rechnet das Frontend selbst; hier wird gegen den Demo-Datensatz
// geprueft, dass es dabei die Zahlen liefert, die sich von Hand aus den
// Dateien ergeben.
//
// Braucht Chromium: einmalig `deno run -A npm:playwright@1.56.1 install chromium`.

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { type Browser, chromium, type Page } from "npm:playwright@1.56.1";

import { frontend, seite as baueSeite } from "../src/make.ts";
import { pruefe } from "../src/validate.ts";

const BEISPIELE = new URL("../examples/", import.meta.url).pathname;

// Playwright haelt Browserprozesse und Sockets, die Denos Sanitizer nicht
// zuordnen kann. Sie werden in `mitSeite` ausdruecklich geschlossen.
const OHNE_SANITIZER = { sanitizeOps: false, sanitizeResources: false };

/** Erzeugt die von `make` gebaute Datei fuer einen Datensatz und gibt die URL. */
function gebauteSeite(wurzel: string, ziel: string): string {
  const ergebnis = pruefe(wurzel);
  assertEquals(ergebnis.befunde.filter((b) => b.schwere === "Fehler"), []);
  Deno.writeTextFileSync(ziel, baueSeite(ergebnis.modell));
  return `file://${ziel}`;
}

/** Oeffnet eine URL, sammelt Konsolen- und Seitenfehler, raeumt danach auf. */
async function mitSeite(url: string, lauf: (seite: Page) => Promise<void>) {
  let browser: Browser | undefined;
  const fehler: string[] = [];
  try {
    browser = await chromium.launch();
    const seite = await browser.newPage({ viewport: { width: 1300, height: 900 } });
    seite.on("pageerror", (e) => fehler.push(`Seitenfehler: ${e.message}`));
    seite.on("console", (m) => {
      // "Failed to load resource" ist die Netzwerkmeldung des Browsers zu
      // einem 4xx/5xx, kein Fehler im Skript. Die kommt bei 422 absichtlich.
      if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) {
        fehler.push(`Konsole: ${m.text()}`);
      }
    });
    await seite.goto(url);
    await seite.waitForSelector("#haupt .explorer, #haupt .hinweis");
    await lauf(seite);
    assertEquals(fehler, [], "Fehler im Browser");
  } finally {
    await browser?.close();
  }
}

function zelle(seite: Page, objekt: string, spalte: number) {
  return seite.locator(`tr:has(button[data-objekt="${objekt}"]) td`).nth(spalte);
}

// ---------------------------------------------------------------------------
// Demo-Datensatz: 5 Objekte, 12 Aufgaben, 33 Zuordnungen, 3 Geschaeftsfelder
// ---------------------------------------------------------------------------

const tmp = Deno.makeTempDirSync();
const DEMO = gebauteSeite(`${BEISPIELE}demo`, `${tmp}/demo.html`);

Deno.test(
  "Kopf, Baum und Ebene 1 stimmen mit dem Demo-Datensatz ueberein",
  OHNE_SANITIZER,
  async () => {
    await mitSeite(DEMO, async (seite) => {
      assertEquals(
        await seite.textContent("#zahlen"),
        "5 Objekte · 12 Aufgaben · 33 Zuordnungen",
      );
      assertStringIncludes((await seite.textContent("#stand")) ?? "", "Stand: ");

      // Baum: Wurzel und fuenf Objekte, alle zugeklappt
      assertEquals(await seite.locator(".tree .node").count(), 6);
      assertEquals(await seite.locator(".tree .node.d0.sel").count(), 1);

      // Bestellung hat drei redundante Zellen: rotes Badge, kein graues
      const bestellung = seite.locator('.tree .node[data-objekt="bestellung"] .badge');
      assertEquals(await bestellung.textContent(), "3");
      assertEquals(await bestellung.evaluate((e) => e.classList.contains("w")), false);

      // Ebene 1: Objekt plus fuenf Abteilungen
      assertEquals(await seite.locator("thead th").count(), 6);
      assertEquals(await seite.locator("thead th").nth(1).textContent(), "Vertrieb");

      // Angebot: nur Vertrieb ist zustaendig, dort zwei Systeme fuer erstellen
      const angebotVertrieb = zelle(seite, "angebot", 0);
      assert(await angebotVertrieb.evaluate((e) => e.classList.contains("n2")));
      assertEquals(await angebotVertrieb.locator(".cnt").textContent(), "2");
      assertEquals(
        await seite.locator('tr:has(button[data-objekt="angebot"]) td.na').count(),
        4,
      );

      // Bestellung / Kundenservice: drei Systeme, also rot
      assert(
        await zelle(seite, "bestellung", 1).evaluate((e) => e.classList.contains("n3")),
      );

      // Legende
      assertStringIncludes((await seite.textContent(".legend")) ?? "", "White Spot");
      assertStringIncludes((await seite.textContent(".legend")) ?? "", "nicht zuständig");
    });
  },
);

Deno.test(
  "Ebene 2 und 3 zeigen Chips, Wege und Fundstellen",
  OHNE_SANITIZER,
  async () => {
    await mitSeite(DEMO, async (seite) => {
      await seite.locator('.tree .node[data-objekt="angebot"]').click();
      assertEquals(await seite.textContent(".pane .ph h2"), "Angebot");
      assertEquals(
        await seite.textContent(".pane .ph .meta"),
        "Aufgaben × zuständige Abteilungen",
      );

      // Nur Vertrieb ist zustaendig, drei Aufgaben, Baum aufgeklappt
      assertEquals(await seite.locator("thead th").count(), 2);
      assertEquals(await seite.locator("tbody tr").count(), 3);
      assertEquals(await seite.locator(".tree .node.d2").count(), 3);

      // erstellen: CRM und Excel, gelb
      const erstellen = seite.locator('tr:has(button[data-aufgabe="erstellen"]) td')
        .first();
      assert(await erstellen.evaluate((e) => e.classList.contains("n2")));
      assertEquals(await erstellen.locator(".sys").allTextContents(), ["CRM", "Excel"]);

      // Ebene 3 ueber den Baum
      await seite.locator('.tree .node.d2[data-aufgabe="erstellen"]').click();
      assertEquals(await seite.textContent(".pane .ph h2"), "Angebot erstellen");
      assertEquals(await seite.locator(".dbox").count(), 1);
      assertEquals(await seite.locator(".dbox .way").count(), 2);
      assertStringIncludes((await seite.textContent(".dbox h3 .v")) ?? "", "2 Wege");
      assertEquals(await seite.locator(".way .quelle").allTextContents(), [
        "data/zuordnungen/geschaeftskunden.md:11",
        "data/zuordnungen/geschaeftskunden.md:12",
      ]);
      assertEquals(
        await seite.locator(".way .gf").first().textContent(),
        "Geschaeftskunden",
      );

      // Zurueck zur Wurzel
      await seite.locator('.tree .node[data-ziel="wurzel"]').click();
      assertEquals(await seite.textContent(".pane .ph h2"), "Alle Objekte");
      assertEquals(await seite.locator("thead th").count(), 6);
    });
  },
);

Deno.test("Lebenszyklus der Systeme sitzt auf den Chips", OHNE_SANITIZER, async () => {
  await mitSeite(DEMO, async (seite) => {
    await seite.locator('.tree .node[data-objekt="bestellung"]').click();
    // Marktplatz-Team erfasst Bestellungen auch im geplanten Order-Management
    const geplant = seite.locator("table .sys.geplant");
    assertEquals(await geplant.count(), 1);
    assertEquals(await geplant.textContent(), "Order-Management");

    await seite.locator('.tree .node[data-objekt="rechnung"]').click();
    const auslaufend = seite.locator("table .sys.auslaufend");
    assertEquals(await auslaufend.count(), 1);
    assertEquals(await auslaufend.textContent(), "Mahnlauf-Tool");
  });
});

Deno.test(
  "Filter auf ein Geschaeftsfeld blendet Abteilungen aus und zeigt White Spots",
  OHNE_SANITIZER,
  async () => {
    await mitSeite(DEMO, async (seite) => {
      await seite.locator("#gfleiste .chip", { hasText: "Privatkunden" }).click();
      assertEquals(
        await seite.locator("#gfleiste .chip.on").textContent(),
        "Privatkunden",
      );

      // Vertrieb und Marktplatz-Team arbeiten nicht bei Privatkunden
      assertEquals(await seite.locator("thead th").allTextContents(), [
        "Objekt",
        "Kundenservice",
        "Lager und Versand",
        "Buchhaltung",
      ]);

      // Kunde / Buchhaltung: zustaendig, aber keine Zeile, also White Spot
      const kundeBuchhaltung = zelle(seite, "kunde", 2);
      assert(await kundeBuchhaltung.evaluate((e) => e.classList.contains("n0")));
      assertEquals(await kundeBuchhaltung.locator(".cnt").textContent(), "–");
      assertEquals(await kundeBuchhaltung.locator(".sub").textContent(), "2 offen");

      // Angebot: niemand zustaendig, der hier arbeitet
      assertEquals(
        await seite.locator('tr:has(button[data-objekt="angebot"]) td.na').count(),
        3,
      );

      // Ebene 3 fuer Kunde / Bonitaet pruefen: zwei leere Kaesten
      await seite.locator('.tree .node[data-objekt="kunde"]').click();
      await seite.locator('.tree .node.d2[data-aufgabe="bonitaet"]').click();
      assertEquals(await seite.locator(".dbox").count(), 2);
      assertEquals(await seite.locator(".dbox.n0").count(), 2);
      assertEquals(await seite.locator(".dbox .empty").allTextContents(), [
        "Keine Zuordnung erfasst, obwohl zuständig.",
        "Keine Zuordnung erfasst, obwohl zuständig.",
      ]);

      // Zurueck auf Alle: jetzt ist auch der Vertrieb zustaendig. Nur die
      // Buchhaltung hat einen Weg fuer Bonitaet, die anderen zwei sind offen.
      await seite.locator("#gfleiste .chip", { hasText: "Alle" }).click();
      assertEquals(await seite.locator(".dbox").count(), 3);
      assertEquals(await seite.locator(".dbox.n0").count(), 2);
      assertEquals(await seite.locator(".dbox.n1").count(), 1);
    });
  },
);

// ---------------------------------------------------------------------------
// Ein Datensatz mit Sonderfaellen: Injektion in einer Anmerkung, eine Warnung
// ---------------------------------------------------------------------------

const PROBE = `${tmp}/probe`;
Deno.mkdirSync(`${PROBE}/data/zuordnungen`, { recursive: true });
Deno.writeTextFileSync(
  `${PROBE}/data/systeme.yaml`,
  "- id: erp\n  name: ERP\n  status: aktiv\n- id: mahn\n  name: Mahnlauf-Tool\n  status: auslaufend\n",
);
Deno.writeTextFileSync(
  `${PROBE}/data/organisation.yaml`,
  "geschaeftsfelder:\n  - id: gk\n    name: Geschaeftskunden\nabteilungen:\n" +
    "  - id: buchhaltung\n    name: Buchhaltung\n    geschaeftsfelder: [gk]\n    bearbeitet: [rechnung]\n",
);
Deno.writeTextFileSync(
  `${PROBE}/data/aufgaben.yaml`,
  "- id: rechnung\n  name: Rechnung\n  aufgaben:\n    - {id: mahnen, name: mahnen}\n",
);
Deno.writeTextFileSync(
  `${PROBE}/data/zuordnungen/gk.md`,
  "---\ngeschaeftsfeld: gk\n---\n\n| Abteilung | Aufgabe | System | Anmerkung |\n|---|---|---|---|\n" +
    '| buchhaltung | rechnung.mahnen | erp | Text mit </script><img src=x> & "Zeichen" |\n' +
    "| buchhaltung | rechnung.mahnen | mahn | laeuft aus |\n",
);
const PROBE_SEITE = gebauteSeite(PROBE, `${tmp}/probe.html`);

Deno.test(
  "Anmerkungen werden als Text gezeigt, nie als HTML",
  OHNE_SANITIZER,
  async () => {
    await mitSeite(PROBE_SEITE, async (seite) => {
      await seite.locator('.tree .node[data-objekt="rechnung"]').click();
      await seite.locator('.tree .node.d2[data-aufgabe="mahnen"]').click();

      assertEquals(await seite.locator("img").count(), 0);
      assertEquals(await seite.locator("script").count(), 2);
      const wege = await seite.locator(".way").allTextContents();
      assert(
        wege.some((w) => w.includes('Text mit </script><img src=x> & "Zeichen"')),
        wege.join("\n"),
      );
    });
  },
);

Deno.test(
  "Warnungen aus dem Modell sind auf Knopfdruck sichtbar",
  OHNE_SANITIZER,
  async () => {
    await mitSeite(PROBE_SEITE, async (seite) => {
      const knopf = seite.locator("#warnknopf");
      assertEquals(await knopf.textContent(), "1 Warnung anzeigen");
      assert(await seite.locator("#warnliste").isHidden());

      await knopf.click();
      assert(await seite.locator("#warnliste").isVisible());
      assertStringIncludes(
        (await seite.textContent("#warnliste li")) ?? "",
        'System "mahn" ist auslaufend, hat aber kein "ende"',
      );
      assertEquals(await knopf.textContent(), "1 Warnung ausblenden");
    });
  },
);

// ---------------------------------------------------------------------------
// Ohne eingebettetes Modell holt das Frontend api/model. Das ist der Vertrag,
// den `serve` spaeter erfuellen muss.
// ---------------------------------------------------------------------------

function kleinerServer(
  modell: () => Response,
): { url: string; stop: () => Promise<void> } {
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    (anfrage) => {
      const pfad = new URL(anfrage.url).pathname;
      if (pfad === "/api/model") return modell();
      return new Response(frontend(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  );
  const { port } = server.addr as Deno.NetAddr;
  return { url: `http://127.0.0.1:${port}/`, stop: () => server.shutdown() };
}

Deno.test("ohne eingebettetes Modell wird api/model geholt", OHNE_SANITIZER, async () => {
  const modell = JSON.stringify(pruefe(`${BEISPIELE}demo`).modell);
  const server = kleinerServer(() =>
    new Response(modell, { headers: { "content-type": "application/json" } })
  );
  try {
    await mitSeite(server.url, async (seite) => {
      assertEquals(
        await seite.textContent("#zahlen"),
        "5 Objekte · 12 Aufgaben · 33 Zuordnungen",
      );
      assertEquals(await seite.locator(".tree .node").count(), 6);
    });
  } finally {
    await server.stop();
  }
});

Deno.test(
  "HTTP 422 von api/model zeigt die Fehlerliste statt eines Plans",
  OHNE_SANITIZER,
  async () => {
    const server = kleinerServer(() =>
      new Response(
        JSON.stringify({
          fehler: ['data/zuordnungen/gk.md:9  Fehler   System "shopsystem" unbekannt'],
        }),
        { status: 422, headers: { "content-type": "application/json" } },
      )
    );
    try {
      await mitSeite(server.url, async (seite) => {
        const hinweis = (await seite.textContent("#haupt .hinweis")) ?? "";
        assertStringIncludes(hinweis, "Die Daten haben Fehler");
        assertStringIncludes(hinweis, 'System "shopsystem" unbekannt');
        assertEquals(await seite.locator(".tree").count(), 0);
      });
    } finally {
      await server.stop();
    }
  },
);
