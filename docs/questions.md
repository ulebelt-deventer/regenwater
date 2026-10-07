## To discuss w Claude

- Isn't a 30-day login period a bit excessive? What are best practices for this sort of medium to low stakes app that does contain some customer data, albeit not super sensitive?

## Questions for team

*Each question states what the spec currently assumes, so a "yes" needs no further work.*

- Login: you type your e-mail address and get a link plus a 6-digit code, no passwords. OK? We can explore more secure options, but this is the easiest for klussers.
- Login: Once you've logged in, how long should your login session last? Claude's initial recommendation was 30 days, for klusser convenience. Do you have a preference?
- E-mail CC and sender: every email the app sends is CC'd so you have a record of what went out. Currently the CC goes to whichever admin sends it. Should it go to a shared inbox instead? And should emails come from a general address (eg regenwater@ulebelt.nl) or from the admin's own name?
- Woningcorporaties: does each one have a fixed e-mail address for the Plan van Aanpak and opleverrapport? (Currently one address per corporatie, filled in automatically.)
- Dossiers list: columns are Adres, Huur/koop, Klusser, Status, Laatste activiteit, Notities, with a compact card per dossier on phones, and the stats bar shows Open, Aandacht nodig, Uitgevoerd. Anything missing or unneeded? (Other candidate stats: wacht op woningcorporatie, bezoeken in de komende week.)
- Klusser permissions: as bezoeker they edit the afspraak, the Bezoek and Plan van Aanpak pages and Notities until "Klaar voor controle"; as uitvoerder the uitvoering date, the Uitvoering page and Notities until "Werk opgeleverd". After that, they ask an admin for changes. Everything else (intake, address, assigning, sending, closing) is admins only. Is that the right boundary? Can you think of situations where a klusser must change something outside it?
- Privacy: the email to a klusser names the address of the dossier (not the bewoner's name). OK?
- Regenpijpen: most bezoek questions are answered per regenpijp (soort, diameter, regenton, afkoppelen, where the water goes). Correct?
- Diameters: the form offers 80 mm, 100 mm and "Anders". Earlier you also mentioned 70 and 90 mm. Do those occur often enough to be options?
- Multiple roof and garden parts: the app lets you draw several dakdelen and tuindelen on the kaart and computes each m². Do you actually need that, and the tuin m² in the plan?
- Plan van Aanpak on-site: the bezoeker can jot down the voorstel and afspraken while still with the bewoner, then polish the wording afterwards, before tapping "Klaar voor controle". Does that match how you'd like to work?
- Photos: are the existing photo slots enough, or do we need an "Andere foto's" slot for anything that doesn't fit elsewhere?
- Fields you didn't ask for: woningtype (tussenwoning, 2-onder-1-kap, etc.) and the Beoordeling choice with its standard opening sentence in the Voorstel Ulebelt. Do you need them? When you go through the workflow a few times, imagining various situations, can you identify any fields / pieces of information that you'd need to enter / make note of, that are missing? Can you identify any fields present that are never useful, and would be better removed to make the UI cleaner?
- Please walk through the flow a few times with different scenarios in mind: a koopwoning vs a huurwoning, a bewoner who drops out halfway, a woningcorporatie that rejects the plan or asks for changes.
- Woningcorporatie asks for changes: you edit the dossier and send the plan again; there's no separate change-request step, and no new bezoek unless you arrange one. OK?
- Plan versions: the app doesn't keep old versions of the PDF; the CC of each send is the record. If the plan changes after sending, the app flags it ("Plan gewijzigd") and shows exactly what changed, until you resend or mark that resending isn't needed. Is that enough?
- Waterberging: which normafvoer do you use? The sample says 20 mm, but its numbers (10 m² gives 100 liter) match 10 mm.
- Prices: the Plan van Aanpak lists materials with quantities only, like the sample. Should it include a cost estimate, for corporaties for example?
- Aandacht thresholds: see the Ligt stil table (eg corporatie silent for 14 days, afspraak 2 days past without a finished bezoek). Do those durations feel right?
- Meldingen: the app emails you when a klusser taps "Klaar voor controle" or "Werk opgeleverd", when an email can't be delivered (bounces only in a later version), and every Monday with the list of dossiers that need aandacht. Which address should receive these? Any other moment you'd want to hear about?
- Controle: if a Plan van Aanpak isn't good enough yet, you fix it yourself or call the bezoeker; there's no "terugsturen naar bezoeker" button. Enough?
- Required fields: nothing blocks "Bezoek afronden" or sending; the Controle text lists what's still empty, and the concept-Plan highlights it. Are there fields that must really be filled in before the plan can go out?
- Regentonnen: one "Regenton aanwezig/gewenst" choice per regenpijp. Does it happen that a bewoner wants two tonnen on one pijp, or a ton not on a pijp?
- Subsidie: should the Plan van Aanpak or the emails contain a fixed block with the subsidie information (eg the regeling that covers the 11 gemeenten)?
- Koopwoning: the plan email asks whether the bewoner wants the Klussendienst. Should it state the cost (€ 50 per regenpijp)? Does that cost cover all work that might be in the Plan van Aanpak (eg installing regentonnen, digging a wadi)? The facturatie page counts € 50 for every regenpijp on the kaart; should pijpen where nothing is done be left out?
- Woningcorporaties: do Ieder1, Rentree and Salland Wonen all accept the same Plan van Aanpak, or does one need a different format, extra photos or a cost estimate?
- Importing your existing sheet: should we import your current spreadsheet of addresses once at launch, or start empty and enter running cases by hand?
- Who are the main woningcorporaties you work with? For the dropdown list. Do they have different requirements qua this workflow, that we need to know about?
- Auteur of the Plan van Aanpak: the admin who created the dossier, with the bezoeker as "Schouw door". OK?
- Afkoppelen: each regenpijp has an "Afkoppelen?" choice (ja, nee, twijfel), shown in the Plan van Aanpak, as in "Pijp A: regenton plus afkoppelen, pijp B: alleen afkoppelen, pijp C: niks". OK?
- Is it possible that multiple unconnected dakdelen connect to a single rain pipe? Will we actually need to draw in multiple dakdelen at all, or is it nearly always just 1?
- You mentioned that some eligible addresses will be in Zutphen. Do you have a rioolkaart link for Zutphen? I only see one for Deventer & north.
- Are you comfortable with this app code being open-source? Just the source code on Github, not any database content, user data, or confidential details.
- Rioolkaart: it looks like some houses in Olst/Wijhe have gescheiden riool but are marked as toch subsidiabel. Is this common, should we count this as subsidizable for the purposes of the app?
