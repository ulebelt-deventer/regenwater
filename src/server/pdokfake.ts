// A stand-in for PDOK, BRO and DINO in test mode (unit tests and the E2E server): one known address with one DINO boring 42 m east of it, and a loud error for anything else.
export const PDOK_ADRES = {
  id: 'adr-0a1b2c', type: 'adres', weergavenaam: 'Walstraat 74, 7411GK Deventer', straatnaam: 'Walstraat', huisnummer: 74, postcode: '7411GK', woonplaatsnaam: 'Deventer', gemeentenaam: 'Deventer',
  gekoppeld_perceel: ['DVT00-E-11907'], centroide_rd: 'POINT(207965.881 474195.177)', centroide_ll: 'POINT(6.1628876 52.25324535)',
};
export const DINO_BORING = { DINO_NR: 'B33E0194', x: 6.1635, y: 52.25324535 };
export const PROFIEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="40" height="120" fill="#ffff00"/></svg>';

export function fakePdok(url: string): Response {
  const u = new URL(url);
  const q = u.searchParams.get('q') ?? '';
  if (u.host === 'publiek.broservices.nl' && u.pathname.endsWith('/characteristics/searches')) return new Response('<dispatchCharacteristicsResponse><numberOfDocuments>0</numberOfDocuments></dispatchCharacteristicsResponse>');
  if (u.pathname.endsWith('/lks_gbo_rd_v1/MapServer/0/query')) return Response.json({ features: [{ attributes: { DINO_NR: DINO_BORING.DINO_NR }, geometry: { x: DINO_BORING.x, y: DINO_BORING.y } }] });
  if (u.pathname === `/uitgifteloket/api/brh/profile/${DINO_BORING.DINO_NR}`) return new Response(PROFIEL_SVG);
  if (u.pathname.endsWith('/reverse') && u.searchParams.get('type') === 'weg') return Response.json({ response: { docs: [{ type: 'weg', weergavenaam: 'Walstraat, Deventer' }] } });
  if (u.pathname.endsWith('/suggest')) return Response.json({ response: { docs: [{ id: PDOK_ADRES.id, weergavenaam: PDOK_ADRES.weergavenaam }] } });
  if (u.pathname.endsWith('/lookup')) return Response.json({ response: { docs: u.searchParams.get('id') === PDOK_ADRES.id ? [PDOK_ADRES] : [] } });
  if (u.pathname.endsWith('/free') && q.startsWith('identificatie:')) {
    return Response.json({ response: { docs: [{ geometrie_rd: 'POLYGON((207950 474180,207980 474180,207980 474210,207950 474210,207950 474180))' }] } });
  }
  throw new Error(`Onverwacht extern verzoek in test: ${url}`);
}
