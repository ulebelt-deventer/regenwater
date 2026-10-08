// Values the team still has to confirm are marked PLACEHOLDER. Each is shown in the UI where it applies.

export const APP_NAAM = 'Ulebelt Regenwater';
export const ULEBELT_CONTACT_EMAIL = 'regenwater@ulebelt.nl'; // PLACEHOLDER
export const MELDINGEN_EMAIL = 'regenwater@ulebelt.nl'; // PLACEHOLDER: receives klaar-voor-controle, opgeleverd, niet-afgeleverd and the weekly digest
export const ONTWIKKELAAR_EMAIL = 'hunt.topher@gmail.com'; // receives every feedback item, next to MELDINGEN_EMAIL

export const CORPORATIES = ['Ieder1', 'Rentree', 'Salland Wonen'] as const;
export const CORPORATIE_EMAIL: Record<string, string> = {
  Ieder1: 'regenwater@ieder1.nl', // PLACEHOLDER
  Rentree: 'regenwater@rentree.nl', // PLACEHOLDER
  'Salland Wonen': 'regenwater@sallandwonen.nl', // PLACEHOLDER
};

export const RIOOLKAARTEN: Record<string, string> = {
  Deventer: 'https://deventer.maps.arcgis.com/apps/webappviewer/index.html?id=f981cd8df5744a18aa87f59998905764',
  Raalte: 'https://experience.arcgis.com/experience/8b52137b53714e35a54b3a4e8f1217e8',
  'Olst-Wijhe': 'https://olst-wijhe.maps.arcgis.com/apps/instant/basic/index.html?appid=859f1b244196497e9f13df1f7c136676',
};

// The PDOK viewer centred on an RD point, with the kadastrale kaart layers on (layer id from the PDOK service catalog).
export function kadastraleKaartUrl([x, y]: [number, number]): string {
  const l = '97cf6a64-9cfc-4ce6-9741-2db44fd27fca';
  const lagen = ['kadastralekaart;_', 'Perceel;standaard:perceel', 'KadastraleGrens;standaard:kadastralegrens', 'Bebouwing;standaard:bebouwing', 'OpenbareRuimteNaam;_'];
  return `https://app.pdok.nl/viewer/#x=${Math.round(x)}&y=${Math.round(y)}&z=14&background=BRT-A%20standaard&layers=${lagen.map((n) => `${l};${n};1`).join(',')}`;
}
export const SUBSIDIE_INFO_URL = 'https://www.ulebelt.nl/regenwater'; // PLACEHOLDER
export const NORMAFVOER_MM = 20; // PLACEHOLDER: the sample says 20 mm, its numbers match 10 mm
export const KLUSSENDIENST_PER_REGENPIJP_CENT = 5000; // PLACEHOLDER

// Login
export const LOGIN_CODE_GELDIG_MIN = 15;
export const LOGIN_MAX_FOUTE_CODES = 5;
export const LOGIN_MAILS_PER_ADRES_PER_UUR = 5;
export const LOGIN_POGINGEN_PER_IP_PER_UUR = 20;
export const SESSIE_DAGEN = 30;
export const LAATST_ACTIEF_INTERVAL_MIN = 5;

// Audit: adjacent autosaves by the same person merge into one entry within this window.
export const AUDIT_MERGE_MIN = 60;

export const DOSSIERS_PER_PAGINA = 30;
export const FOTO_MAX_PX = 1200;
export const LUCHTFOTO_MAX_PX = 2400;
export const BORING_MAX_KM = 1.5; // the nearest-boring search gives up beyond this

export const DOORLAATBAARHEID: [string, string][] = [
  ['Klei', 'Slecht'],
  ['Zavel (zand en klei)', 'Slecht'],
  ['Veen', 'Slecht'],
  ['Zandig leem', 'Matig'],
  ['Sterk zandig veen', 'Zeer slecht'],
  ['Leem/ Löss', 'Zeer slecht'],
  ['Lichte zavel', 'Matig'],
  ['(Zeer) grof zand', 'Zeer goed'],
  ['(Duin)zand', 'Zeer goed'],
  ['Middelfijn (duin)zand', 'Goed'],
  ['Zeer fijn (duin)zand', 'Matig'],
  ['Fijn en grof grind', 'Zeer goed'],
  ['Schelpen', 'Zeer goed'],
];

export const STANDAARD_MATERIALEN: [string, number][] = [
  ['Regenton 210 liter', 4500],
  ['Regentonstandaard', 2000],
  ['Tegel 60x60 (onder regenton)', 500],
  ['Vulautomaat regenton 80 mm', 1500],
  ['Vulautomaat regenton 100 mm', 1800],
  ['Holie Molie', 2500],
  ['HWA eindkap 80 mm', 250],
  ['HWA bocht 80 mm 90°', 450],
  ['HWA bocht 100 mm 90°', 600],
  ['HWA buis 80 mm, per meter', 500],
  ['Regenpijpbeugel 80 mm', 300],
  ['Verloopring 80 > 50 mm', 350],
  ['Drainagebuis blind HWA 50 mm, per meter', 200],
  ['Drainagebuis geperforeerd HWA 50 mm, per meter', 300],
  ['Klikmof 50 mm', 200],
  ['Infiltratiekrat', 3500],
  ['Worteldoek, per m²', 250],
  ['Grind 16-32 mm, zak 25 kg', 600],
  ['PVC-lijm, tube', 800],
];
