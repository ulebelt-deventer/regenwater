## To discuss w Claude

- Isn't a 30-day login period a bit excessive? What are best practices for this sort of medium to low stakes app that does contain some customer data, albeit not super sensitive?

## Vragen voor het team

*Bij elke vraag staat hoe de app het nu doet. Klopt dat, dan is "ja" genoeg.*

### De werkwijze als geheel

- **Loop de werkwijze door met verschillende situaties.** Loop de app een paar keer van begin tot eind door, en denk daarbij aan verschillende situaties: een koopwoning en een huurwoning, een bewoner die halverwege afhaakt, een woningcorporatie die het plan afwijst of om wijzigingen vraagt.
- **Werken jullie ook voor huishoudens zonder subsidie?** Als een huishouden een regenton of afkoppeling wil maar daar geen subsidie voor krijgt, helpen jullie ze dan toch? Of sluiten we zo'n dossier meteen?
- **Alles op één grote dossierpagina, of een aparte pagina per stap?** Nu heeft elke stap (bijvoorbeeld Bezoek, Plan van Aanpak, Uitvoering) een eigen formulier op een aparte pagina. Werkt dat, of vul je liever alles in op de dossierpagina zelf? Sub-paginas lijken me beter, dus dat heb ik gebouwd, maar ik twijfel een beetje.
- **Hoe lang bewaren we een dossier? (privacy, AVG/GDPR)** Voor de AVG moet in onze privacyverklaring duidelijk staan welke persoonsgegevens we verzamelen, waarom, en hoe lang we ze bewaren. Hoe lang moeten jullie een dossier bewaren nadat het werk klaar is? Claude (de AI-assistent waarmee ik de app bouw) adviseert om alle persoonsgegevens na 5 jaar te verwijderen. In de praktijk betekent dat het hele dossier verwijderen, dus ook alles over het uitgevoerde werk. Wat vinden jullie daarvan? De gevoeligste gegevens zijn de naam, het e-mailadres en het telefoonnummer van de bewoner, en de foto's. Als jullie de gegevens om een wettelijke reden langer moeten bewaren, kunnen we de termijn verlengen tot 20 jaar. Waarschijnlijk vraagt niemand er ooit naar, maar we moeten wel een duidelijk en openbaar vastgelegd beleid hebben.
- **Afkoppelen = nee: de vragen daarna verbergen?** Als de bezoeker bij een regenpijp "Afkoppelen?" op "Nee" zet, wat doen we dan met de twee vragen daarna ("Waar moet het water naartoe?" en "Hoe moet het water daarnaartoe komen?")? Verbergen, of toch laten zien? Die vragen zijn toch alleen nodig als de pijp wel wordt afgekoppeld?

### Inloggen & rechten

- **Inloggen met een e-maillink en code, zonder wachtwoord: oké?** Je vult je e-mailadres in en krijgt een link en een code van 6 cijfers. Er zijn geen wachtwoorden. Is dat goed? Er zijn veiligere manieren, maar dit is voor klussers het makkelijkst.
- **Hoe lang blijf je ingelogd?** Hoe lang moet je ingelogd blijven nadat je bent ingelogd? Het eerste advies van Claude (de AI-assistent waarmee ik de app bouw) was 30 dagen, zodat klussers niet steeds opnieuw hoeven in te loggen. Hebben jullie een voorkeur?
- **Wat mogen klussers zelf wijzigen?** Een klusser die bezoeker is, kan de afspraak, de pagina's Bezoek en Plan van Aanpak, en de Notities wijzigen, totdat de klusser op "Klaar voor controle" tikt. Een klusser die uitvoerder is, kan de uitvoeringsdatum, de pagina Uitvoering en de Notities wijzigen, totdat de klusser op "Werk opgeleverd" tikt. Daarna vraagt de klusser een beheerder om iets te wijzigen. Al het andere (inschrijving, adres, toewijzen, versturen, sluiten) kan alleen een beheerder. Is dat de juiste grens? Kun je situaties bedenken waarin een klusser iets daarbuiten moet kunnen wijzigen?

### Dossierlijst & aandacht

- **Dossierlijst: missen er kolommen of cijfers, of zijn er overbodig?** De dossierlijst heeft de kolommen Adres, Huur/koop, Klusser, Status, Laatste activiteit en Notities. Op een telefoon zie je per dossier een kleine kaart. Bovenaan staan de cijfers Open, Aandacht nodig en Uitgevoerd. Mist er iets, of kan er iets weg? (Andere cijfers die we zouden kunnen tonen: "wacht op woningcorporatie" en "bezoeken in de komende week".)
- **Kloppen de termijnen voor "aandacht nodig"?** Als een dossier te lang stilligt, krijgt het "Aandacht nodig". Dit zijn nu de termijnen per stap. Voelen die goed?
  - Inschrijving: na 3 dagen nog niet compleet
  - Bezoeker toewijzen: na 7 dagen nog geen bezoeker
  - Bezoek plannen: 7 dagen na toewijzen nog geen afspraak
  - Bezoek uitvoeren: 2 dagen na de afspraak nog niet afgerond
  - Plan van Aanpak afronden: 5 dagen na het bezoek nog niet klaar voor controle
  - Plan controleren & versturen: na 5 dagen nog niet gecontroleerd
  - Goedkeuring woningcorporatie (huur): 14 dagen geen reactie op het plan
  - Klussendienst of zelf (koop): 14 dagen geen keuze van de bewoner
  - Uitvoerder toewijzen: 7 dagen na goedkeuring nog geen uitvoerder
  - Werk uitvoeren: 3 dagen na de geplande datum nog niet opgeleverd, of 21 dagen na toewijzen nog geen datum gepland
  - Opleverrapport versturen: 7 dagen na oplevering nog niet verstuurd

### Bezoek: regenpijpen, daken & tuin

- **Diameters 70 en 90 mm toevoegen?** Het formulier heeft nu 80 mm, 100 mm en "Anders". Eerder noemden jullie ook 70 en 90 mm. Komen die vaak genoeg voor om ze als keuze toe te voegen?
- **Twee regentonnen aan één pijp, of een regenton zonder pijp?** Per regenpijp is er één keuze "Regenton aanwezig?". Komt het voor dat een bewoner twee regentonnen aan één pijp wil, of een regenton die niet aan een pijp hangt?

### Bezoek: velden & foto's

- **Welke velden missen er, en welke zijn overbodig?** Er staan twee velden in waar jullie niet om gevraagd hebben: woningtype (tussenwoning, 2-onder-1-kap, enz.) en de keuze "Beoordeling", die een vaste openingszin geeft in het Voorstel Ulebelt. Hebben jullie die nodig? En als je de app een paar keer doorloopt met verschillende situaties in gedachten: welke gegevens wil je kunnen invullen of noteren die er nu niet in staan? Welke velden gebruik je nooit, en kunnen beter weg zodat het scherm rustiger wordt?
- **Welke velden moeten ingevuld zijn voordat het plan verstuurd wordt?** Nu houdt niets "Bezoek afronden" of het versturen tegen. De controletekst noemt wat nog leeg is, en het concept-Plan laat dat duidelijk zien. Zijn er velden die echt ingevuld moeten zijn voordat het plan verstuurd mag worden? Of is it nu zo ok?
- **Genoeg fotovakken, of een vak "Andere foto's"?** Zijn de fotovakken die er nu zijn genoeg? Of willen jullie een vak "Andere foto's" voor alles wat nergens anders past?

### Plan van Aanpak & controle

- **Geen knop "terugsturen naar bezoeker": genoeg?** Als een Plan van Aanpak nog niet goed genoeg is, verbeter je het zelf of bel je de bezoeker. Er is geen knop om het plan terug te sturen naar de bezoeker. Is dat genoeg?
- **Auteur van het plan: de beheerder, met de bezoeker als "Schouw door"?** In het Plan van Aanpak staat als auteur de beheerder die het dossier heeft aangemaakt. De bezoeker staat erin bij "Schouw door". Is dat goed?
- **Geen oude versies van het plan bewaren: genoeg?** De app bewaart geen oude versies van de PDF. Elke verstuurde e-mail gaat in CC naar jullie, dus daar zie je wat er verstuurd is. Als het plan na het versturen nog verandert, meldt de app dat ("Plan gewijzigd") en laat precies zien wat er veranderd is, totdat je het opnieuw verstuurt of aangeeft dat opnieuw versturen niet nodig is. Is dat genoeg?
- **Welke normafvoer: 10 of 20 mm?** Met welke normafvoer berekenen jullie de waterberging? In het voorbeeldplan staat 20 mm, maar de getallen erin (10 m² geeft 100 liter) passen bij 10 mm.
- **Kostenraming in het Plan van Aanpak?** Het Plan van Aanpak noemt de materialen met alleen de aantallen, net als het voorbeeldplan. Moet er ook een kostenraming in, bijvoorbeeld voor de woningcorporaties?

### Na de uitvoering

- **Wat moet er in het opleverrapport?** Moet het opleverrapport alles bevatten wat ook in het Plan van Aanpak stond? Of alleen de gegevens over de uitvoering? (Nu heeft het dezelfde kop als het Plan van Aanpak, met daaronder wat er is uitgevoerd, de opleverfoto's en de gebruikte materialen.)
- **Facturen: hoe maken jullie die nu?** Hoe maken jullie nu facturen? Ik neem aan dat dat in de officiële administratie van De Ulebelt moet, met doorlopende factuurnummers en dergelijke. Een koppeling met jullie facturatiesoftware is waarschijnlijk lastig, dus de app maakt zelf geen facturen. In plaats daarvan maakt de app een "Uitvoeringsspecificatie": een overzicht van alles wat de administratie nodig heeft voor de factuur. Dat kun je afdrukken, of als tekst kopiëren en naar de administratie mailen. Werkt dat voor jullie?
- **€ 50 per regenpijp ook bij een huurwoning met subsidie?** Moet de vergoeding voor de Klussendienst (€ 50 per regenpijp) ook gerekend worden bij een huurwoning die subsidie krijgt? Sturen jullie dan een factuur (bijvoorbeeld aan de gemeente, om de subsidie te ontvangen), of alleen bij koopwoningen? (Nu rekent de app het bij huur en koop.)

### Woningcorporaties

- **Met welke woningcorporaties werken jullie?** Met welke woningcorporaties werken jullie het meest? Dat is voor de keuzelijst in de app. Hebben zij andere eisen voor deze werkwijze die we moeten weten?
- **Vast e-mailadres per woningcorporatie?** Heeft elke woningcorporatie een vast e-mailadres voor het Plan van Aanpak en het opleverrapport? (Nu is er één adres per corporatie, dat de app automatisch invult.)
- **Willen alle corporaties hetzelfde Plan van Aanpak?** Accepteren Ieder1, Rentree en Salland Wonen allemaal hetzelfde Plan van Aanpak? Of wil een van hen een andere opmaak, extra foto's of een kostenraming?
- **Wijzigingen van de corporatie: gewoon aanpassen en opnieuw versturen?** Als een woningcorporatie om wijzigingen vraagt, pas je het dossier aan en verstuur je het plan opnieuw. Er is geen aparte stap voor wijzigingen, en er komt geen nieuw bezoek, tenzij je dat zelf regelt. Is dat goed?

### Subsidie, rioolkaart & kosten

- **Gescheiden riool maar toch subsidiabel: hoe vaak?** Op de rioolkaart hebben sommige huizen in Olst-Wijhe een gescheiden riool, maar staan ze toch als subsidiabel aangegeven. Komt dat vaak voor? En moet de app die huizen als subsidiabel behandelen?
- **Rioolkaart voor Zutphen?** Jullie noemden dat sommige adressen in Zutphen liggen. Hebben jullie een link naar een rioolkaart voor Zutphen? Ik heb alleen een kaart voor Deventer en de dorpen ten noorden daarvan.
- **Vast stuk tekst over de subsidie?** Moet er in het Plan van Aanpak of in de e-mails een vast stuk tekst over de subsidie staan (bijvoorbeeld over de regeling voor de 11 gemeenten)?
- **Kosten Klussendienst: vermelden, en wat valt eronder?** Bij een koopwoning vraagt de e-mail met het plan of de bewoner de Klussendienst wil. Moet daar de prijs bij staan (€ 50 per regenpijp)? En dekt dat bedrag al het werk dat in een Plan van Aanpak kan staan (bijvoorbeeld regentonnen plaatsen of een wadi graven)?
- **Uitvoeringsspecificatie: klopt die voor de administratie?** Drie vragen. 1) Is "Klimaatadaptatie" plus de gemeente (bijvoorbeeld "Klimaatadaptatie Deventer") de juiste projectnaam? 2) De Klussendienst telt de pijpen die bij het bezoek op "Afkoppelen: Ja" staan, niet de pijpen die de uitvoerder echt heeft afgekoppeld. Moet de uitvoerder per pijp bevestigen dat die is afgekoppeld? 3) Wie krijgt bij een huurwoning de factuur: de corporatie of de bewoner?

### E-mail & meldingen

- **E-mail aan klusser noemt alleen het adres: oké?** Voor de privacy noemt de e-mail aan een klusser alleen het adres van het dossier, niet de naam van de bewoner. Is dat goed? (Klusser moet op de link kliken om het app te openen & de bewoner-details te zien.)
- **Meldingen: naar welk adres, en wanneer nog meer?** De app stuurt jullie een e-mail als een klusser op "Klaar voor controle" of "Werk opgeleverd" tikt, als een e-mail niet bezorgd kan worden (dat komt pas in een latere versie), en elke maandag met de lijst van dossiers die aandacht nodig hebben. Naar welk adres moeten deze meldingen? Willen jullie ook op andere momenten een melding?
- **E-mailteksten nakijken en links invullen.** Kijk alle e-mailteksten na en vul de ontbrekende links in, bijvoorbeeld de link "Meer informatie" in de e-mail aan bewoners die subsidie kunnen krijgen.

### Start & inrichting

- **Broncode open source: akkoord?** Vinden jullie het goed als de broncode van de app openbaar is (open source)? Het gaat alleen om de code op GitHub, niet om de database, gegevens van gebruikers of andere vertrouwelijke informatie.
