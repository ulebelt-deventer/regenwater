// The admins' "Wat is er nieuw" page: user-visible changes, newest date first. A beheerder sees a red dot until they've opened the page since the newest datum, so bullets added to a section that is already live don't light it again.
export interface NieuwsDatum {
  datum: string; // YYYY-MM-DD
  groepen: { kop: string; punten: string[] }[];
}

export const NIEUWS: NieuwsDatum[] = [
  {
    datum: '2026-10-22',
    groepen: [
      {
        kop: 'Inschrijving',
        punten: [
          'Onderaan de Inschrijving kun je nu Notities kwijt, bijvoorbeeld wie de opdrachtgever is of wie toestemming heeft gegeven. Het zijn dezelfde notities als bovenaan de dossierpagina, dus de bezoeker en uitvoerder zien ze ook.',
        ],
      },
      {
        kop: "Foto's",
        punten: [
          'Staat een foto of de kaart scheef? Open hem en tik op de knop met de ronde pijl: hij draait een kwartslag naar links, en je tekeningen draaien mee. Tik vaker voor de andere kanten. De knop met de pijl naar links die je eerder zag, is Ongedaan maken.',
        ],
      },
    ],
  },
  {
    datum: '2026-10-19',
    groepen: [
      {
        kop: 'Overal in de app',
        punten: [
          'De eerste stap heet nu Inschrijving in plaats van Intake. Oude links blijven werken.',
          'Tikt een klusser op de dossierlink in een e-mail terwijl die niet is ingelogd? Dan staat het e-mailadres al ingevuld, en na het inloggen kom je meteen op dat dossier uit.',
          'De CSV-download van de dossierlijst werkt weer.',
          'De privacypagina is ingevuld: De Ulebelt als verantwoordelijke, waarom we gegevens bewaren, en voorlopig 5 jaar bewaartermijn. Je kunt hem ook lezen zonder in te loggen.',
        ],
      },
      {
        kop: 'Dossierpagina',
        punten: [
          'Latere stappen (Uitvoerder, Uitvoering, Oplevering) zie je al als grijze blokken, met waarom ze nog niet beschikbaar of niet van toepassing zijn.',
        ],
      },
      {
        kop: 'Inschrijving',
        punten: [
          'Op een tablet of computer staan de velden naast elkaar in rijen, dus de pagina is veel korter. Op de telefoon blijft alles onder elkaar.',
          'De keuzes bij Bodemsituatie komen nu uit de referentietabel (grondsoort en doorlaatbaarheid), met de link naar die tabel ernaast.',
        ],
      },
      {
        kop: 'Kaart en tekenen',
        punten: [
          'Nieuw vlak Steen (rood, S1, S2...) voor terras en andere bestrating, met m² en een foto per vlak, net als dak en tuin. Het Plan van Aanpak krijgt er een eigen tabel voor.',
          'Nieuw: Vrij tekenen. Schets met de vinger of muis op elke foto of op de kaart, en verplaats of vergroot je schets daarna.',
          'Tik in een vlak dat al getekend is om het te selecteren en de hoeken te verschuiven.',
        ],
      },
      {
        kop: 'Foto\'s',
        punten: [
          'Plakken: zet een screenshot (bijvoorbeeld van Street View) direct uit het klembord in een fotovakje. Een gekopieerd bestand plak je met ⌘V of Ctrl+V.',
          'Foto\'s worden minder bijgesneden: kleine foto\'s zijn 3:2, en straatfoto, plattegrond en boorprofiel tonen de hele foto.',
        ],
      },
      {
        kop: 'Bezoek: daken en regenpijpen',
        punten: [
          'Een regenpijp kan nu water krijgen van meerdere dakdelen, en een dakdeel kan verdeeld worden over meerdere regenpijpen. De app verdeelt zelf, naar welke pijp het dichtst bij welk stuk dak ligt.',
          'Die verdeling pas je aan in de Dak-tabel, kolom Regenpijpen. Een † betekent dat de app het dakdeel zelf automatisch heeft verdeeld.',
          'De waterberging wordt nu per regenpijp berekend, met de berekening erbij.',
          'Elke regenpijp heeft een eigen blok direct onder de Dak-tabel, met een stukje van de kaart rond die pijp. Tik op dat kaartje om naar de kaart te gaan. Elk regenpijp-blok kun je dichtklappen.',
          'Soort, Diameter, Regenton, Afkoppelen en Hoe zijn nu keuzemenu\'s, dus de blokken zijn compacter.',
          'De vragen "Waar moet het water naartoe?" en "Hoe moet het water daarnaartoe komen?" gaan nu duidelijk over het plan, niet over hoe het nu is.',
          'Het veld "Verhard %" is weg.',
        ],
      },
      {
        kop: 'Bezoek: afspraken met de bewoner',
        punten: [
          'De Afspraken (wat doet de bewoner, wat doet De Ulebelt) staan nu op de Bezoekpagina in plaats van in het Plan van Aanpak, zodat je ze ter plekke samen maakt.',
          'Elke afspraak is nu een lijstje met opsommingstekens: schrijf je eigen regels, of tik op een suggestie erboven.',
          'Het papieren bezoekformulier noemt de suggesties om te omcirkelen.',
        ],
      },
      {
        kop: 'Oplevering en factuur (beheerders)',
        punten: [
          '"Materialen met prijzen" is vervangen door de Uitvoeringsspecificatie: alles wat de administratie nodig heeft voor de factuur, met bewonersgegevens, gebruikte materialen, subtotaal, btw en totaal. Met knoppen Afdrukken en Kopieer als tekst.',
          'De specificatie is beschikbaar zodra de uitvoerder "Werk opgeleverd" heeft aangetikt (bij een koopwoning alleen als de bewoner voor de Klussendienst koos).',
          'De Klussendienst rekent € 50 per regenpijp waarbij bij het Bezoek "Afkoppelen: Ja" is gekozen, voor huur- en koopwoningen.',
        ],
      },
    ],
  },
];

export const nieuwsOngezien = (gezien: string | null): boolean => gezien === null || gezien < NIEUWS[0].datum;
