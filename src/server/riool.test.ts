import { describe, expect, it } from 'vitest';
import type { Adres } from '../shared/types.ts';
import type { Ctx } from './context.ts';
import { detecteerRiool } from './riool.ts';

const RD: [number, number] = [207965, 474195];
const adres = (gemeente: string) => ({ gemeente, rd: RD }) as Adres;

// A horizontal line `m` metres north of the address, as Deventer's layer returns it with outSR=28992.
const lijn = (TypLei: string | null, m: number) => ({ attributes: { TypLei }, geometry: { paths: [[[RD[0] - 20, RD[1] + m], [RD[0] + 20, RD[1] + m]]] } });

// Answers every rioolkaart query with `antwoord`, recording the URLs asked.
function nep(antwoord: object | number) {
  const urls: URL[] = [];
  const haal = async (invoer: string | URL | Request) => {
    urls.push(new URL(String(invoer)));
    return typeof antwoord === 'number' ? new Response('kapot', { status: antwoord }) : Response.json(antwoord);
  };
  return { ctx: { haal, klok: { iso: () => '2026-03-02T09:00:00.000Z' } } as unknown as Ctx, urls };
}

const detecteer = (gemeente: string, antwoord: object | number) => detecteerRiool(nep(antwoord).ctx, adres(gemeente));

describe('detecteerRiool in Deventer', () => {
  it('lets a nearby house connection outweigh a nearer main of the other kind', async () => {
    const r = await detecteer('Deventer', { features: [lijn('Gemengd riool', 4), lijn('DWA perceelaansluitleiding', 9), lijn('Kolkaansluitleiding', 2)] });
    expect(r).toEqual({ soort: 'gevonden', stelsel: 'gescheiden', uitleg: 'DWA perceelaansluitleiding op 9 m', at: '2026-03-02T09:00:00.000Z' });
  });

  it('falls back to the nearest main when no house connection is within 15 m', async () => {
    const r = await detecteer('Deventer', { features: [lijn('Gemengde perceelaansluitleiding', 20), lijn('Vuilwaterriool', 30), lijn('Gemengd riool', 12), lijn(null, 1)] });
    expect(r).toMatchObject({ stelsel: 'gemengd', uitleg: 'Gemengd riool op 12 m, geen huisaansluiting gevonden' });
  });

  it('does not choose between a gemengd and a gescheiden main less than 5 m apart in distance', async () => {
    const r = await detecteer('Deventer', { features: [lijn('Hemelwaterriool', 36), lijn('Gemengd riool', 37)] });
    expect(r).toMatchObject({ stelsel: null, uitleg: 'Hemelwaterriool op 36 m en Gemengd riool op 37 m, geen huisaansluiting gevonden' });
  });

  it('says so when no riool lies within 40 m', async () => {
    expect(await detecteer('Deventer', { features: [lijn('Drain', 3)] })).toMatchObject({ stelsel: null, uitleg: 'Geen riool gevonden binnen 40 m' });
  });

  it('asks for the lines within 40 m of the address in RD', async () => {
    const { ctx, urls } = nep({ features: [] });
    await detecteerRiool(ctx, adres('Deventer'));
    expect(urls[0].searchParams.get('geometry')).toBe('207965,474195');
    expect(urls[0].searchParams.get('inSR')).toBe('28992');
    expect(urls[0].searchParams.get('distance')).toBe('40');
  });

  it('fails on an ArcGIS error, which comes as a 200', async () => {
    await expect(detecteer('Deventer', { error: { code: 498 } })).rejects.toThrow('De rioolkaart van de gemeente gaf een fout (498).');
    await expect(detecteer('Deventer', 503)).rejects.toThrow('De rioolkaart van de gemeente gaf een fout (503).');
  });
});

describe('detecteerRiool per pand', () => {
  it('maps Raalte categories, keeping its own wording', async () => {
    const r = await detecteer('Raalte', { features: [{ attributes: { Categorie: 'Subsidie mogelijk - Gemengd riool, maar risicopand' } }] });
    expect(r).toMatchObject({ stelsel: 'gemengd', uitleg: 'Subsidie mogelijk - Gemengd riool, maar risicopand' });
    expect(await detecteer('Raalte', { features: [{ attributes: { Categorie: 'Geen afkoppelsubsidie mogelijk – Buiten de bebouwde kom' } }] })).toMatchObject({ stelsel: null });
  });

  it("maps Olst-Wijhe's codes, including gescheiden with subsidie", async () => {
    expect(await detecteer('Olst-Wijhe', { features: [{ attributes: { hemelwater_gebied: '4' } }] })).toMatchObject({ stelsel: 'gemengd', uitleg: 'Gemengd riool, subsidie mogelijk' });
    expect(await detecteer('Olst-Wijhe', { features: [{ attributes: { hemelwater_gebied: '3' } }] })).toMatchObject({ stelsel: 'gescheiden', uitleg: 'Gescheiden riool, afkoppelsubsidie mogelijk' });
  });

  it('says so when the address is on no pand', async () => {
    expect(await detecteer('Olst-Wijhe', { features: [] })).toMatchObject({ stelsel: null, uitleg: 'Het pand staat niet op de kaart van de gemeente' });
  });

  it('does not choose when the address lies on panden of different stelsels', async () => {
    const r = await detecteer('Olst-Wijhe', { features: [{ attributes: { hemelwater_gebied: '4' } }, { attributes: { hemelwater_gebied: '2' } }] });
    expect(r).toMatchObject({ stelsel: null, uitleg: 'Gemengd riool, subsidie mogelijk; Gescheiden opvang regenwater met bergingseis per perceel, geen afkoppelsubsidie' });
  });

  it('fails on a category it does not know rather than guessing', async () => {
    await expect(detecteer('Olst-Wijhe', { features: [{ attributes: { hemelwater_gebied: '5' } }] })).rejects.toThrow('Onbekende categorie op de rioolkaart van de gemeente: 5');
  });
});

it('reports a gemeente without detection as niet ondersteund, without asking anything', async () => {
  const { ctx, urls } = nep({ features: [] });
  expect(await detecteerRiool(ctx, adres('Zutphen'))).toEqual({ soort: 'niet_ondersteund', at: '2026-03-02T09:00:00.000Z' });
  expect(urls).toEqual([]);
});
