import '@fontsource/figtree/400.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/800.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles.scss';
import { Navigate, Route, Router } from '@solidjs/router';
import { render } from 'solid-js/web';
import { DossierActiviteit } from './dossier/activiteit.tsx';
import { Bezoek } from './dossier/bezoek.tsx';
import { Inschrijving } from './dossier/inschrijving.tsx';
import { Details, DossierRoute } from './dossier/pagina.tsx';
import { Plan } from './dossier/plan.tsx';
import { Uitvoering } from './dossier/uitvoering.tsx';
import { Layout } from './layout.tsx';
import { startOpslag } from './opslag.ts';
import { Activiteit } from './paginas/activiteit.tsx';
import { Feedback, Materialen, NormafvoerBeheer, SjabloonPagina, Sjablonen, Subsidiepaginas, Woningcorporaties } from './paginas/beheer.tsx';
import { Dossiers } from './paginas/dossiers.tsx';
import { GebruikerPagina, Gebruikers } from './paginas/gebruikers.tsx';
import { Inloggen, InloggenLink } from './paginas/inloggen.tsx';
import { Nieuws } from './paginas/nieuws.tsx';
import { Overzicht } from './paginas/overzicht.tsx';
import { Proberen } from './paginas/proberen.tsx';
import { AandachtUitleg, Databeleid, Installeren, OverDeApp, Privacy, RechtenUitleg, Statussen, UitlegOverzicht } from './paginas/uitleg.tsx';
import { startScrollHerstel } from './scrollherstel.ts';
import { startVersieControle } from './versie.ts';

function NietGevonden() {
  return <div class="alert alert-warning qa-niet-gevonden">Deze pagina bestaat niet.</div>;
}

startOpslag();
startVersieControle();
startScrollHerstel();

render(
  () => (
    <Router root={Layout}>
      <Route path="/" component={Overzicht} />
      <Route path="/inloggen" component={Inloggen} />
      <Route path="/inloggen/link" component={InloggenLink} />
      <Route path="/proberen" component={Proberen} />
      <Route path="/dossiers" component={Dossiers} />
      <Route path="/dossiers/:id" component={DossierRoute}>
        <Route path="/" component={Details} />
        <Route path="/inschrijving" component={Inschrijving} />
        {/* The step was called Intake; old bookmarks and feedback paths use this. */}
        <Route path="/intake" component={() => <Navigate href="../inschrijving" />} />
        <Route path="/bezoek" component={Bezoek} />
        <Route path="/plan" component={Plan} />
        <Route path="/uitvoering" component={Uitvoering} />
        <Route path="/activiteit" component={DossierActiviteit} />
      </Route>
      <Route path="/gebruikers" component={Gebruikers} />
      <Route path="/gebruikers/:id" component={GebruikerPagina} />
      <Route path="/beheer/materialen" component={Materialen} />
      <Route path="/beheer/normafvoer" component={NormafvoerBeheer} />
      <Route path="/beheer/subsidiepaginas" component={Subsidiepaginas} />
      <Route path="/beheer/woningcorporaties" component={Woningcorporaties} />
      <Route path="/beheer/sjablonen" component={Sjablonen} />
      <Route path="/beheer/sjablonen/:key" component={SjabloonPagina} />
      <Route path="/beheer/feedback" component={Feedback} />
      <Route path="/beheer/activiteit" component={Activiteit} />
      <Route path="/beheer/nieuw" component={Nieuws} />
      <Route path="/uitleg" component={UitlegOverzicht} />
      <Route path="/uitleg/statussen" component={Statussen} />
      <Route path="/uitleg/aandacht" component={AandachtUitleg} />
      <Route path="/uitleg/rechten" component={RechtenUitleg} />
      <Route path="/uitleg/databeleid" component={Databeleid} />
      <Route path="/installeren" component={Installeren} />
      <Route path="/over-de-app" component={OverDeApp} />
      <Route path="/privacy" component={Privacy} />
      <Route path="*" component={NietGevonden} />
    </Router>
  ),
  document.getElementById('app')!,
);
