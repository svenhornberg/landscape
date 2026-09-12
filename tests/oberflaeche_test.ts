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
      assertStringIncludes(
        (await seite.textContent(".pane .ph .meta")) ?? "",
        "die Systeme, mit denen die Abteilung diese Aufgabe erledigt",
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

      // Ebene 3 ueber den Baum: Tabelle Abteilung x Geschaeftsfeld, als Spalten
      // nur die Geschaeftsfelder, in denen eine zustaendige Abteilung arbeitet
      await seite.locator('.tree .node.d2[data-aufgabe="erstellen"]').click();
      assertEquals(await seite.textContent(".pane .ph h2"), "Angebot erstellen");
      assertEquals(await seite.locator("table.l3 thead th").allTextContents(), [
        "Abteilung",
        "Geschaeftskunden",
      ]);
      assertEquals(await seite.locator("table.l3 tbody tr").count(), 1);
      assertEquals(
        await seite.textContent("table.l3 th.row .n"),
        "2 Systeme · redundant",
      );
      const zelle3 = seite.locator("table.l3 td.c");
      assert(await zelle3.evaluate((e) => e.classList.contains("n2")));
      assertEquals(await zelle3.locator(".weg .sys").allTextContents(), ["CRM", "Excel"]);
      assertEquals(await zelle3.locator(".weg .bem").allTextContents(), [
        "Standardweg seit 2021",
        "Sonderkalkulation bei Rahmenpreisen",
      ]);
      // die Fundstelle haengt am Chip, nicht mehr als Text in der Zelle
      const titel = await zelle3.locator(".weg .sys").evaluateAll((k) =>
        k.map((e) => e.title)
      );
      assertStringIncludes(titel[0], "Quelle: data/zuordnungen/geschaeftskunden.md:11");
      assertStringIncludes(titel[1], "Quelle: data/zuordnungen/geschaeftskunden.md:12");
      assertEquals(await seite.locator("table.l3 .quelle").count(), 0);

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
    assertStringIncludes(
      (await geplant.textContent()) ?? "",
      "Order-Management · geplant",
    );

    await seite.locator('.tree .node[data-objekt="rechnung"]').click();
    const auslaufend = seite.locator("table .sys.auslaufend");
    assertEquals(await auslaufend.count(), 1);
    assertStringIncludes(
      (await auslaufend.textContent()) ?? "",
      "Mahnlauf-Tool · auslaufend",
    );
    // alles aus systeme.yaml haengt als Tooltip am Chip
    assertEquals(
      await auslaufend.getAttribute("title"),
      "Mahnlauf-Tool · auslaufend seit 2014, Ende 2027 · verantwortlich: Buchhaltung",
    );
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

      // Ebene 3 fuer Kunde / Bonitaet pruefen: zwei Abteilungen, eine Spalte,
      // beide Zellen offen, beide Zeilen offen
      await seite.locator('.tree .node[data-objekt="kunde"]').click();
      await seite.locator('.tree .node.d2[data-aufgabe="bonitaet"]').click();
      assertEquals(await seite.locator("table.l3 thead th").allTextContents(), [
        "Abteilung",
        "Privatkunden",
      ]);
      assertEquals(await seite.locator("table.l3 tbody tr").count(), 2);
      assertEquals(await seite.locator("table.l3 td.c.n0").count(), 2);
      assertEquals(await seite.locator("table.l3 td.c.n0 .sub").allTextContents(), [
        "offen",
        "offen",
      ]);
      assertEquals(await seite.locator("table.l3 th.row .n").allTextContents(), [
        "offen",
        "offen",
      ]);
      assertStringIncludes(
        (await seite.locator("table.l3 td.c.n0").first().getAttribute("title")) ?? "",
        "Kundenservice · Privatkunden: zuständig, aber kein Weg erfasst (offen)",
      );

      // Zurueck auf Alle: jetzt ist auch der Vertrieb zustaendig, und alle drei
      // Geschaeftsfelder sind Spalten. Nur die Buchhaltung hat einen Weg, bei
      // Geschaeftskunden; der Rest ist offen oder nicht zustaendig (Vertrieb
      // arbeitet nur bei Geschaeftskunden).
      await seite.locator("#gfleiste .chip", { hasText: "Alle" }).click();
      assertEquals(await seite.locator("table.l3 thead th").count(), 4);
      assertEquals(await seite.locator("table.l3 th.row .n").allTextContents(), [
        "offen",
        "offen",
        "1 System",
      ]);
      assertEquals(await seite.locator("table.l3 td.c.n0").count(), 6);
      assertEquals(await seite.locator("table.l3 td.c.n1").count(), 1);
      assertEquals(await seite.locator("table.l3 td.na").count(), 2);
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
      const wege = await seite.locator(".weg").allTextContents();
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

// ---------------------------------------------------------------------------
// Layout: die Seite waechst mit den Daten, nicht mit dem Bildschirm
// ---------------------------------------------------------------------------

Deno.test(
  "Die Seite waechst mit den Daten, nicht mit dem Bildschirm",
  OHNE_SANITIZER,
  async () => {
    await mitSeite(DEMO, async (seite) => {
      // breit: fuenf Abteilungen brauchen keine 2000 Pixel
      await seite.setViewportSize({ width: 2000, height: 900 });
      const karte = await seite.locator(".card").boundingBox();
      assert(karte !== null);
      assert(
        karte.width >= 960 && karte.width <= 1500,
        `Karte ist ${karte.width}px breit, erwartet zwischen 960 und 1500`,
      );
      const tabelle = await seite.locator("table.lvl").boundingBox();
      const pane = await seite.locator(".pane").boundingBox();
      assert(tabelle !== null && pane !== null);
      assert(tabelle.width <= pane.width + 1, "Tabelle ragt aus dem Kasten");

      // Kopf, Filterleiste und Kasten enden auf derselben Kante
      const zahlen = await seite.locator("#zahlen").boundingBox();
      assert(zahlen !== null);
      assert(
        Math.abs(zahlen.x + zahlen.width - (karte.x + karte.width)) <= 1,
        "Kopfzeile und Kasten sind unterschiedlich breit",
      );

      // schmal: nie breiter als das Fenster, gerollt wird im Kasten
      await seite.setViewportSize({ width: 700, height: 900 });
      const rolltNicht = await seite.evaluate(
        "document.documentElement.scrollWidth <= document.documentElement.clientWidth",
      );
      assert(rolltNicht, "die Seite rollt horizontal");
    });
  },
);

// ---------------------------------------------------------------------------
// Die Bedeutung aus der Legende steht an den Elementen selbst
// ---------------------------------------------------------------------------

Deno.test(
  "Redundanz und White Spots sind an den Zellen beschriftet",
  OHNE_SANITIZER,
  async () => {
    await mitSeite(DEMO, async (seite) => {
      // Ebene 1: Wort in der Zelle, Details im Tooltip, auch fuer "nicht zustaendig"
      const rot = zelle(seite, "bestellung", 1);
      assertEquals(await rot.locator(".sub").textContent(), "redundant · 1 offen");
      assertStringIncludes(
        (await rot.getAttribute("title")) ?? "",
        "Bestellung × Kundenservice: höchstens 3 Systeme je Aufgabe (redundant), 1 von 3 Aufgaben offen",
      );
      const na = seite.locator('tr:has(button[data-objekt="angebot"]) td.na').first();
      assertEquals(
        await na.getAttribute("title"),
        "Kundenservice ist für Angebot nicht zuständig",
      );
      assertStringIncludes(
        (await seite.locator('.tree .node[data-objekt="bestellung"] .badge').getAttribute(
          "title",
        )) ?? "",
        "3 × redundant",
      );

      // Ebene 2: ein White Spot heisst "offen" und sagt im Tooltip, warum
      await seite.locator("#gfleiste .chip", { hasText: "Privatkunden" }).click();
      await seite.locator('.tree .node[data-objekt="kunde"]').click();
      const offen = seite.locator('tr:has(button[data-aufgabe="bonitaet"]) td.n0');
      assertEquals(await offen.count(), 2);
      assertEquals(await offen.first().locator(".sub").textContent(), "offen");
      assertStringIncludes(
        (await offen.first().getAttribute("title")) ?? "",
        "White Spot, zuständig, aber kein Weg",
      );

      // Ebene 3: die Zeile sagt "redundant" dazu, die Zelle nennt es im Tooltip
      // samt Abteilung und Geschaeftsfeld, die Fundstelle haengt am Chip
      await seite.locator("#gfleiste .chip", { hasText: "Alle" }).click();
      await seite.locator('.tree .node[data-objekt="angebot"]').click();
      await seite.locator('.tree .node.d2[data-aufgabe="erstellen"]').click();
      assertEquals(
        await seite.textContent("table.l3 th.row .n"),
        "2 Systeme · redundant",
      );
      assertEquals(
        await seite.locator("table.l3 td.c").getAttribute("title"),
        "Vertrieb · Geschaeftskunden: 2 Systeme, redundant",
      );
      assertStringIncludes(
        (await seite.locator("table.l3 .weg .sys").first().getAttribute("title")) ?? "",
        "Quelle: data/zuordnungen/geschaeftskunden.md:11",
      );
    });
  },
);

// ---------------------------------------------------------------------------
// Permalink: die Ansicht steht in der Adresse
// ---------------------------------------------------------------------------

Deno.test(
  "Die Adresse traegt die Ansicht und stellt sie wieder her",
  OHNE_SANITIZER,
  async () => {
    await mitSeite(DEMO + "#gf=pk&objekt=kunde&aufgabe=bonitaet", async (seite) => {
      assertEquals(await seite.textContent(".pane .ph h2"), "Kunde Bonität prüfen");
      assertEquals(
        await seite.locator("#gfleiste .chip.on").textContent(),
        "Privatkunden",
      );
      assertEquals(await seite.locator("table.l3 td.c.n0").count(), 2);
      assertEquals(await seite.locator(".tree .node.d2.sel").count(), 1);

      // Klicks schreiben die Adresse fort, ohne die Seite neu zu laden
      await seite.locator('.tree .node[data-ziel="wurzel"]').click();
      assertEquals(await seite.evaluate("location.hash"), "#gf=pk");
      await seite.locator("#gfleiste .chip", { hasText: "Alle" }).click();
      assertEquals(await seite.evaluate("location.hash"), "");
      await seite.locator('.tree .node[data-objekt="angebot"]').click();
      assertEquals(await seite.evaluate("location.hash"), "#objekt=angebot");
    });

    // Unbekanntes in der Adresse wird ignoriert statt die Seite zu brechen
    await mitSeite(DEMO + "#gf=gibtsnicht&objekt=auchnicht", async (seite) => {
      assertEquals(await seite.textContent(".pane .ph h2"), "Alle Objekte");
      assertEquals(await seite.locator("#gfleiste .chip.on").textContent(), "Alle");
    });
  },
);

// ---------------------------------------------------------------------------
// Ein ausgewaehltes System: links nur noch, was damit gemacht wird; in den
// Zellen bleibt die Struktur, Treffer sind umrandet, der Rest tritt zurueck
// ---------------------------------------------------------------------------

Deno.test(
  "Ein ausgewaehltes System filtert Baum und Zeilen und markiert Zellen",
  OHNE_SANITIZER,
  async () => {
    await mitSeite(DEMO, async (seite) => {
      await seite.selectOption("#systemwahl", "crm");
      assert(
        await seite.locator("#systemwahl.on").isVisible(),
        "Auswahl ist nicht als Blase markiert",
      );
      assert(await seite.locator("#systemweg").isVisible(), "kein x zum Aufheben");
      assertEquals(await seite.evaluate("location.hash"), "#system=crm");
      assertStringIncludes(
        (await seite.textContent(".legend")) ?? "",
        "CRM im Einsatz: 5 Zuordnungen · 4 Aufgaben · 2 Abteilungen",
      );

      // Baum und Ebene 1: nur Angebot und Kunde, die Spalten bleiben alle
      assertEquals(
        await seite.locator(".tree .node.d1").evaluateAll((k) =>
          k.map((e) => e.dataset.objekt)
        ),
        ["angebot", "kunde"],
      );
      assertEquals(
        await seite.locator("tbody th.row button").evaluateAll((k) =>
          k.map((e) => e.dataset.objekt)
        ),
        ["angebot", "kunde"],
      );
      assertEquals(await seite.locator("thead th").count(), 6);

      // In den Zeilen: genau die drei Zellen mit CRM sind markiert
      assertEquals(await seite.locator("td.c.mark").count(), 3);
      assert(
        await zelle(seite, "angebot", 0).evaluate((e) => e.classList.contains("mark")),
      );
      assert(
        await zelle(seite, "kunde", 0).evaluate((e) => e.classList.contains("mark")),
      );
      assert(
        await zelle(seite, "kunde", 1).evaluate((e) => e.classList.contains("mark")),
      );
      assert(await zelle(seite, "kunde", 2).evaluate((e) => e.classList.contains("dim")));
      assertStringIncludes(
        (await zelle(seite, "angebot", 0).getAttribute("title")) ?? "",
        "CRM in 3 von 3 Aufgaben",
      );

      // Ebene 2 fuer Kunde: nur "anlegen" laeuft ueber CRM, "Bonitaet pruefen" fehlt
      await seite.locator('.tree .node[data-objekt="kunde"]').click();
      assertEquals(await seite.locator("tbody tr").count(), 1);
      assertEquals(
        await seite.locator(".tree .node.d2").evaluateAll((k) =>
          k.map((e) => e.dataset.aufgabe)
        ),
        ["anlegen"],
      );

      // Ebene 3 fuer Kunde anlegen: zwei CRM-Chips markiert; die Zellen ohne
      // CRM und die grauen treten zurueck (7 von 9), keine Zelle ist umrandet
      await seite.locator('.tree .node.d2[data-aufgabe="anlegen"]').click();
      assertEquals(await seite.locator("table.l3 .sys.mark").allTextContents(), [
        "CRM",
        "CRM",
      ]);
      assertEquals(await seite.locator("table.l3 td.c:not(.dim)").count(), 2);
      assertEquals(await seite.locator("table.l3 td.c.dim").count(), 7);
      assertEquals(await seite.locator("table.l3 td.c.mark").count(), 0);

      // Ebene 2 fuer Angebot: alle drei Aufgaben, CRM-Chips markiert, Excel zurueck
      await seite.locator('.tree .node[data-objekt="angebot"]').click();
      assertEquals(await seite.locator("tbody tr").count(), 3);
      assertEquals(await seite.locator("table .sys.mark").allTextContents(), [
        "CRM",
        "CRM",
        "CRM",
      ]);
      assertEquals(await seite.locator("table .sys.dim").allTextContents(), ["Excel"]);

      // Ebene 3: der CRM-Chip markiert, Excel zurueck; die einzige Zelle hat
      // den Treffer und bleibt, wie sie ist
      await seite.locator('.tree .node.d2[data-aufgabe="erstellen"]').click();
      assertEquals(await seite.locator("table.l3 .sys.mark").allTextContents(), ["CRM"]);
      assertEquals(await seite.locator("table.l3 .sys.dim").allTextContents(), ["Excel"]);
      assertEquals(
        await seite.locator("table.l3 td.c.mark, table.l3 td.c.dim").count(),
        0,
      );

      // Abwahl: alles wieder da, der Rest der Adresse bleibt
      await seite.locator("#systemweg").click();
      assert(await seite.locator("#systemweg").isHidden());
      assertEquals(await seite.inputValue("#systemwahl"), "");
      assertEquals(await seite.locator(".mark, .dim").count(), 0);
      assertEquals(await seite.locator(".tree .node.d1").count(), 5);
      assertEquals(
        await seite.evaluate("location.hash"),
        "#objekt=angebot&aufgabe=erstellen",
      );
    });

    // ueber den Permalink; ein System, das nur eine Abteilung nutzt
    await mitSeite(DEMO + "#system=oms", async (seite) => {
      assertEquals(await seite.inputValue("#systemwahl"), "oms");
      assert(await seite.locator("#systemwahl.on").isVisible());
      assertEquals(await seite.locator("tbody tr").count(), 1);
      assertEquals(await seite.locator("td.c.mark").count(), 1);
    });

    // ein Objekt, das das System nicht nutzt, bleibt anwaehlbar und sagt es
    await mitSeite(DEMO + "#system=crm&objekt=rechnung", async (seite) => {
      assertStringIncludes(
        (await seite.textContent("#haupt .hinweis")) ?? "",
        "CRM kommt bei Rechnung nicht vor",
      );
    });
  },
);

// ---------------------------------------------------------------------------
// Die Systemwahl bleibt an ihrem Platz, ob etwas gewaehlt ist oder nicht
// ---------------------------------------------------------------------------

Deno.test("Die Systemwahl springt beim Auswaehlen nicht", OHNE_SANITIZER, async () => {
  for (const breite of [1300, 1000]) {
    await mitSeite(DEMO, async (seite) => {
      await seite.setViewportSize({ width: breite, height: 900 });
      const vorher = await seite.locator("#systemwahl").boundingBox();
      const chipsVorher = await seite.locator("#gfleiste").boundingBox();
      await seite.selectOption("#systemwahl", "crm");
      const nachher = await seite.locator("#systemwahl").boundingBox();
      const chipsNachher = await seite.locator("#gfleiste").boundingBox();
      assert(vorher && nachher && chipsVorher && chipsNachher);
      assertEquals(
        [nachher.x, nachher.y],
        [vorher.x, vorher.y],
        `bei ${breite}px verschoben`,
      );
      assertEquals([chipsNachher.x, chipsNachher.y], [chipsVorher.x, chipsVorher.y]);
      // mit Platz steht die Auswahl rechts neben den Geschaeftsfeldern; bei wenig
      // Platz wandert die ganze Gruppe darunter, abhaengig nur vom Fenster
      if (breite === 1300) {
        assert(
          nachher.x > chipsNachher.x,
          "Systemwahl steht nicht rechts der Geschaeftsfelder",
        );
        assert(
          Math.abs(nachher.y - chipsNachher.y) < 20,
          "Systemwahl steht nicht in derselben Zeile",
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Leerer Zustand: System im aktuellen Filter nirgends
// ---------------------------------------------------------------------------

Deno.test(
  "Kommt das System im Filter nicht vor, gibt es einen Ausweg",
  OHNE_SANITIZER,
  async () => {
    // CRM wird bei Privatkunden nirgends benutzt
    await mitSeite(DEMO + "#gf=pk&system=crm&objekt=angebot", async (seite) => {
      const hinweis = (await seite.textContent("#haupt .hinweis")) ?? "";
      assertStringIncludes(hinweis, "CRM kommt im Geschäftsfeld Privatkunden nicht vor");
      assertStringIncludes((await seite.textContent(".tree")) ?? "", "nichts mit CRM");
      assertStringIncludes(
        (await seite.textContent(".legend")) ?? "",
        "CRM: im aktuellen Filter nirgends im Einsatz",
      );
      assertEquals(await seite.locator(".tree .node.d1:not(.leer)").count(), 0);

      // der Ausweg: alle Geschaeftsfelder, dann ist CRM da
      await seite.locator('[data-aktion="alle-gf"]').click();
      assertEquals(await seite.locator("#gfleiste .chip.on").textContent(), "Alle");
      assertEquals(await seite.locator(".tree .node.d1").count(), 2);
      assertEquals(await seite.evaluate("location.hash"), "#system=crm&objekt=angebot");

      // der andere Ausweg: Systemfilter weg
      await seite.locator("#gfleiste .chip", { hasText: "Privatkunden" }).click();
      await seite.locator('[data-aktion="system-weg"]').click();
      assertEquals(await seite.inputValue("#systemwahl"), "");
      assertEquals(await seite.evaluate("location.hash"), "#gf=pk&objekt=angebot");
    });
  },
);
