// A stand-in for PDOK in test mode (unit tests and the E2E server): one known address, and a loud error for anything else.
export const PDOK_ADRES = {
  id: 'adr-0a1b2c', type: 'adres', weergavenaam: 'Walstraat 74, 7411GK Deventer', straatnaam: 'Walstraat', huisnummer: 74, postcode: '7411GK', woonplaatsnaam: 'Deventer', gemeentenaam: 'Deventer',
  gekoppeld_perceel: ['DVT00-E-11907'], centroide_rd: 'POINT(207965.881 474195.177)', centroide_ll: 'POINT(6.1628876 52.25324535)',
};

export function fakePdok(url: string): Response {
  const u = new URL(url);
  const q = u.searchParams.get('q') ?? '';
  if (u.pathname.endsWith('/suggest')) return Response.json({ response: { docs: [{ id: PDOK_ADRES.id, weergavenaam: PDOK_ADRES.weergavenaam }] } });
  if (u.pathname.endsWith('/lookup')) return Response.json({ response: { docs: u.searchParams.get('id') === PDOK_ADRES.id ? [PDOK_ADRES] : [] } });
  if (u.pathname.endsWith('/free') && q.startsWith('identificatie:')) {
    return Response.json({ response: { docs: [{ geometrie_rd: 'POLYGON((207950 474180,207980 474180,207980 474210,207950 474210,207950 474180))' }] } });
  }
  throw new Error(`Onverwacht extern verzoek in test: ${url}`);
}
