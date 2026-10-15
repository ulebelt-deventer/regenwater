## To discuss w Claude

- Isn't a 30-day login period a bit excessive? What are best practices for this sort of medium to low stakes app that does contain some customer data, albeit not super sensitive?

## Questions for team

*Each question states what the spec currently assumes, so a "yes" needs no further work.*

### Overall workflow

- **Loop de flow door met verschillende scenario's.** Please walk through the flow a few times with different scenarios in mind: a koopwoning vs a huurwoning, a bewoner who drops out halfway, a woningcorporatie that rejects the plan or asks for changes.
- **Staan er stappen in de verkeerde volgorde?** I know that this prototype likely has some steps out of order. For example, the bezoeker doesn't fill in Afspraken until after they've completed the on-site visit. Please take a look and let me know what you think, and we can polish it up / adjust accordingly.
- **Werken jullie ook voor huishoudens zonder subsidie?** Can you still do work with a household that wants a rain capture system, even if they don't get a subsidy for it? or do we immediately close dossiers that don't have a subsidy available?
- Should the dossier page form be all on the main Dossier page? or is it useful to have the subforms for each step on separated subpages? I'm iffy about that design decision.

### Login & permissions

- **Inloggen met e-maillink en code, zonder wachtwoord: oké?** Login: you type your e-mail address and get a link plus a 6-digit code, no passwords. OK? We can explore more secure options, but this is the easiest for klussers.
- **Hoe lang moet je ingelogd blijven?** Login: Once you've logged in, how long should your login session last? Claude's initial recommendation was 30 days, for klusser convenience. Do you have a preference?
- **Wat mogen klussers zelf bewerken?** Klusser permissions: as bezoeker they edit the afspraak, the Bezoek and Plan van Aanpak pages and Notities until "Klaar voor controle"; as uitvoerder the uitvoering date, the Uitvoering page and Notities until "Werk opgeleverd". After that, they ask an admin for changes. Everything else (inschrijving, address, assigning, sending, closing) is admins only. Is that the right boundary? Can you think of situations where a klusser must change something outside it?

### Dossiers list & aandacht

- **Dossierlijst: kolommen of cijfers missen of overbodig?** Dossiers list: columns are Adres, Huur/koop, Klusser, Status, Laatste activiteit, Notities, with a compact card per dossier on phones, and the stats bar shows Open, Aandacht nodig, Uitgevoerd. Anything missing or unneeded? (Other candidate stats: wacht op woningcorporatie, bezoeken in de komende week.)
- **Kloppen de termijnen voor "aandacht nodig"?** Aandacht thresholds: see the Ligt stil table (eg corporatie silent for 14 days, afspraak 2 days past without a finished bezoek). Do those durations feel right?

### Bezoek: regenpijpen, daken & tuin

- **Vragen per regenpijp: klopt dat?** Regenpijpen: most bezoek questions are answered per regenpijp (soort, diameter, regenton, afkoppelen, where the water goes). Correct?
- **Diameters 70 en 90 mm toevoegen?** Diameters: the form offers 80 mm, 100 mm and "Anders". Earlier you also mentioned 70 and 90 mm. Do those occur often enough to be options?
- **Twee tonnen op één pijp, of een ton zonder pijp?** Regentonnen: one "Regenton aanwezig/gewenst" choice per regenpijp. Does it happen that a bewoner wants two tonnen on one pijp, or a ton not on a pijp?
- **Afkoppelen per regenpijp (ja/nee/twijfel): oké?** Afkoppelen: each regenpijp has an "Afkoppelen?" choice (ja, nee, twijfel), shown in the Plan van Aanpak, as in "Pijp A: regenton plus afkoppelen, pijp B: alleen afkoppelen, pijp C: niks". OK?
- **Meerdere dakdelen en tuindelen tekenen: nodig?** Multiple roof and garden parts: the app lets you draw several dakdelen and tuindelen on the kaart and computes each m². Do you actually need that, and the tuin m² in the plan?
- **Meerdere losse dakdelen op één regenpijp: komt dat voor?** Is it possible that multiple unconnected dakdelen connect to a single rain pipe? Will we actually need to draw in multiple dakdelen at all, or is it nearly always just 1?

### Bezoek: fields & photos

- **Welke velden missen er, en welke zijn overbodig?** Fields you didn't ask for: woningtype (tussenwoning, 2-onder-1-kap, etc.) and the Beoordeling choice with its standard opening sentence in the Voorstel Ulebelt. Do you need them? When you go through the workflow a few times, imagining various situations, can you identify any fields / pieces of information that you'd need to enter / make note of, that are missing? Can you identify any fields present that are never useful, and would be better removed to make the UI cleaner?
- **Welke velden zijn verplicht voordat het plan de deur uit gaat?** Required fields: nothing blocks "Bezoek afronden" or sending; the Controle text lists what's still empty, and the concept-Plan highlights it. Are there fields that must really be filled in before the plan can go out?
- **Genoeg fotovakken, of een vak "Andere foto's"?** Photos: are the existing photo slots enough, or do we need an "Andere foto's" slot for anything that doesn't fit elsewhere?

### Plan van Aanpak & controle

- **Plan van Aanpak al ter plekke invullen: past dat?** Plan van Aanpak on-site: the bezoeker can jot down the voorstel and afspraken while still with the bewoner, then polish the wording afterwards, before tapping "Klaar voor controle". Does that match how you'd like to work?
- **Geen knop "terugsturen naar bezoeker": genoeg?** Controle: if a Plan van Aanpak isn't good enough yet, you fix it yourself or call the bezoeker; there's no "terugsturen naar bezoeker" button. Enough?
- **Auteur van het plan: de admin, met bezoeker als "Schouw door"?** Auteur of the Plan van Aanpak: the admin who created the dossier, with the bezoeker as "Schouw door". OK?
- **Geen oude versies van het plan bewaren: genoeg?** Plan versions: the app doesn't keep old versions of the PDF; the CC of each send is the record. If the plan changes after sending, the app flags it ("Plan gewijzigd") and shows exactly what changed, until you resend or mark that resending isn't needed. Is that enough?
- **Welke normafvoer: 10 of 20 mm?** Waterberging: which normafvoer do you use? The sample says 20 mm, but its numbers (10 m² gives 100 liter) match 10 mm.
- **Kostenraming in het Plan van Aanpak?** Prices: the Plan van Aanpak lists materials with quantities only, like the sample. Should it include a cost estimate, for corporaties for example?

### Woningcorporaties

- **Met welke woningcorporaties werken jullie?** Who are the main woningcorporaties you work with? For the dropdown list. Do they have different requirements qua this workflow, that we need to know about?
- **Vast e-mailadres per woningcorporatie?** Woningcorporaties: does each one have a fixed e-mail address for the Plan van Aanpak and opleverrapport? (Currently one address per corporatie, filled in automatically.)
- **Willen alle corporaties hetzelfde Plan van Aanpak?** Woningcorporaties: do Ieder1, Rentree and Salland Wonen all accept the same Plan van Aanpak, or does one need a different format, extra photos or a cost estimate?
- **Wijzigingen van de corporatie: gewoon aanpassen en opnieuw versturen?** Woningcorporatie asks for changes: you edit the dossier and send the plan again; there's no separate change-request step, and no new bezoek unless you arrange one. OK?

### Subsidie, rioolkaart & kosten

- **Gescheiden riool maar toch subsidiabel: hoe vaak?** Rioolkaart: it looks like some houses in Olst/Wijhe have gescheiden riool but are marked as toch subsidiabel. Is this common, should we count this as subsidizable for the purposes of the app?
- **Rioolkaart voor Zutphen?** You mentioned that some eligible addresses will be in Zutphen. Do you have a rioolkaart link for Zutphen? I only see one for Deventer & north.
- **Vast blok met subsidie-informatie?** Subsidie: should the Plan van Aanpak or the emails contain a fixed block with the subsidie information (eg the regeling that covers the 11 gemeenten)?
- **Kosten Klussendienst: vermelden, en wat valt eronder?** Koopwoning: the plan email asks whether the bewoner wants the Klussendienst. Should it state the cost (€ 50 per regenpijp)? Does that cost cover all work that might be in the Plan van Aanpak (eg installing regentonnen, digging a wadi)? The facturatie page counts € 50 for every regenpijp on the kaart; should pijpen where nothing is done be left out?

### E-mail & meldingen

- **CC en afzender van e-mails: welk adres?** E-mail CC and sender: every email the app sends is CC'd so you have a record of what went out. Currently the CC goes to whichever admin sends it. Should it go to a shared inbox instead? And should emails come from a general address (eg regenwater@ulebelt.nl) or from the admin's own name?
- **E-mail aan klusser noemt alleen het adres: oké?** Privacy: the email to a klusser names the address of the dossier (not the bewoner's name). OK?
- **Meldingen: naar welk adres, en wanneer nog meer?** Meldingen: the app emails you when a klusser taps "Klaar voor controle" or "Werk opgeleverd", when an email can't be delivered (bounces only in a later version), and every Monday with the list of dossiers that need aandacht. Which address should receive these? Any other moment you'd want to hear about?
- **E-mailteksten nakijken en links invullen.** You'll want to review each of the email templates and fill in, for example, the "More information" link that's in the email sent to bewoners when they're eligible for subsidy.

### Launch & setup

- **Bestaande spreadsheet importeren of leeg beginnen?** Importing your existing sheet: should we import your current spreadsheet of addresses once at launch, or start empty and enter running cases by hand?
- **Broncode open source: akkoord?** Are you comfortable with this app code being open-source? Just the source code on Github, not any database content, user data, or confidential details.
