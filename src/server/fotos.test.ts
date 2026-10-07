// Photo routes: who may upload where, replacing, sizes, the luchtfoto frame checks and the nearest boring's profile.
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { DINO_BORING } from './pdokfake.ts';
import { Klant, type TestApp, maakGebruiker, nieuwDossier, testApp } from './testapp.ts';

let t: TestApp;
let bea: Klant;
let kees: Klant;
let ria: Klant;
let keesId: number;
let riaId: number;
let id: number;

const beeld = (width = 40, height = 30) => sharp({ create: { width, height, channels: 3, background: '#336699' } }).png().toBuffer();

beforeEach(async () => {
  t = testApp();
  maakGebruiker(t, 'Bea Beheer', 'beheerder');
  keesId = maakGebruiker(t, 'Kees Klus', 'klusser');
  riaId = maakGebruiker(t, 'Ria Klus', 'klusser');
  bea = await new Klant(t).login('bea.beheer@example.org');
  kees = await new Klant(t).login('kees.klus@example.org');
  ria = await new Klant(t).login('ria.klus@example.org');
  id = await nieuwDossier(bea);
  await bea.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'bezoeker', gebruiker_id: keesId });
});

async function upload(k: Klant, slot: string, status = 201, inhoud?: Buffer, q = '') {
  return k.json<{ foto: { id: string; breedte: number; hoogte: number }; fout?: string }>('POST', `/api/dossiers/${id}/fotos/${slot}${q}`, new Uint8Array(inhoud ?? (await beeld())), status);
}
const slotIds = async (slot: string) => ((await bea.json('GET', `/api/dossiers/${id}`)).dossier.fotos as { id: string; slot: string }[]).filter((f) => f.slot === slot).map((f) => f.id);
const sluit = () => bea.json('POST', `/api/dossiers/${id}/sluiten`, { reden: 'Bewoner afgehaakt', toelichting: '' });

describe('uploading', () => {
  it('refuses an unknown slot, and an item slot with an invalid item id', async () => {
    expect((await upload(bea, 'vakantiefoto', 404)).fout).toBe('Onbekend fotovak');
    await upload(bea, 'tuin.ABC', 404);
    await upload(bea, 'regenpijp.r1', 404);
    await upload(bea, 'tuin.t1', 201);
  });

  it('refuses an empty body and a file over 15 MB', async () => {
    expect((await upload(bea, 'tuinsituatie', 400, Buffer.alloc(0))).fout).toBe('Geen afbeelding ontvangen');
    expect((await upload(bea, 'tuinsituatie', 413, Buffer.alloc(15 * 1024 * 1024 + 1))).fout).toBe('Deze afbeelding is te groot.');
    expect(await slotIds('tuinsituatie')).toEqual([]);
  });

  it('scales a large photo down to 1200 px on its longest side and leaves a small one as it is', async () => {
    expect((await upload(bea, 'tuinsituatie', 201, await beeld(3000, 1500))).foto).toMatchObject({ breedte: 1200, hoogte: 600 });
    expect((await upload(bea, 'tuinsituatie', 201, await beeld(300, 800))).foto).toMatchObject({ breedte: 300, hoogte: 800 });
  });

  it('turns a phone photo upright using its EXIF orientation', async () => {
    const opZijn = await sharp(await beeld(40, 20)).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const { foto } = await upload(bea, 'tuinsituatie', 201, opZijn);
    expect(foto).toMatchObject({ breedte: 20, hoogte: 40 });
    const res = await bea.verzoek('GET', `/api/fotos/${foto.id}`);
    expect(await sharp(Buffer.from(await res.arrayBuffer())).metadata()).toMatchObject({ width: 20, height: 40 });
  });

  it('keeps every photo in a multi-photo slot in upload order', async () => {
    const a = (await upload(bea, 'hoosbuien')).foto.id;
    const b = (await upload(kees, 'hoosbuien')).foto.id;
    expect(await slotIds('hoosbuien')).toEqual([a, b]);
  });

  it('serves a photo as a privately cached JPEG', async () => {
    const { foto } = await upload(bea, 'straatfoto');
    const res = await kees.verzoek('GET', `/api/fotos/${foto.id}`);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
  });
});

describe('replacing', () => {
  it('replaces a photo in place and logs the swap as one change', async () => {
    const oud = (await upload(bea, 'straatfoto')).foto.id;
    t.klok.verschuif(2 * 3600e3);
    const nieuw = (await upload(bea, 'straatfoto', 201, undefined, `?vervang=${oud}`)).foto.id;
    expect(await slotIds('straatfoto')).toEqual([nieuw]);
    const { items } = await bea.json<{ items: { type: string; payload: { changes: Record<string, unknown> } }[] }>('GET', `/api/dossiers/${id}/activiteit`);
    expect(items[0].payload.changes).toEqual({ 'fotos.straatfoto': [[oud], [nieuw]] });
  });

  it('answers 409 when the photo to replace was deleted meanwhile, or sits in another slot', async () => {
    const oud = (await upload(bea, 'straatfoto')).foto.id;
    const ander = (await upload(bea, 'boorprofiel')).foto.id;
    await upload(bea, 'straatfoto', 409, undefined, `?vervang=${ander}`);
    await bea.json('DELETE', `/api/fotos/${oud}`);
    expect((await upload(bea, 'straatfoto', 409, undefined, `?vervang=${oud}`)).fout).toBe('De foto die je wilde vervangen bestaat niet meer.');
    await upload(bea, 'straatfoto', 409, undefined, '?vervang=bestaat-niet');
    expect(await slotIds('straatfoto')).toEqual([]);
    expect(await slotIds('boorprofiel')).toEqual([ander]);
  });
});

describe('who may change photos', () => {
  it('lets the bezoeker add to bezoek slots only, until Klaar voor controle', async () => {
    await upload(kees, 'tuinsituatie');
    await upload(kees, 'regenpijp.r1.waar');
    expect((await upload(kees, 'straatfoto', 403)).fout).toBe('Je mag deze foto niet wijzigen');
    await upload(kees, 'boorprofiel', 403);
    await upload(kees, 'opleverfotos', 403);
    await kees.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'klaar_voor_controle' });
    await upload(kees, 'tuinsituatie', 403);
  });

  it('stops the bezoeker deleting or drawing on a photo after Klaar voor controle, but still shows it', async () => {
    const { foto } = await upload(kees, 'tuinsituatie');
    await kees.json('POST', `/api/dossiers/${id}/mijlpaal`, { mijlpaal: 'klaar_voor_controle' });
    await kees.json('DELETE', `/api/fotos/${foto.id}`, undefined, 403);
    await kees.json('PUT', `/api/fotos/${foto.id}/annotaties`, { annotaties: [] }, 403);
    expect((await kees.verzoek('GET', `/api/fotos/${foto.id}`)).status).toBe(200);
  });

  it('lets the uitvoerder add opleverfoto’s but not touch the bezoek photos', async () => {
    await bea.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'uitvoerder', gebruiker_id: riaId });
    const bezoek = (await upload(kees, 'tuinsituatie')).foto.id;
    await upload(ria, 'opleverfotos');
    await upload(ria, 'tuinsituatie', 403);
    await ria.json('DELETE', `/api/fotos/${bezoek}`, undefined, 403);
  });

  it('hides every photo of a dossier from a klusser who is not assigned to it', async () => {
    const { foto } = await upload(bea, 'straatfoto');
    await upload(ria, 'tuinsituatie', 404);
    expect((await ria.verzoek('GET', `/api/fotos/${foto.id}`)).status).toBe(404);
    await ria.json('DELETE', `/api/fotos/${foto.id}`, undefined, 404);
    await ria.json('PUT', `/api/fotos/${foto.id}/annotaties`, { annotaties: [] }, 404);
  });

  it('makes the photos of a closed dossier read-only, also for an admin', async () => {
    const { foto } = await upload(bea, 'straatfoto');
    await sluit();
    expect((await upload(bea, 'straatfoto', 409)).fout).toMatch(/gesloten/);
    await bea.json('DELETE', `/api/fotos/${foto.id}`, undefined, 409);
    await bea.json('PUT', `/api/fotos/${foto.id}/annotaties`, { annotaties: [] }, 409);
    expect((await bea.verzoek('GET', `/api/fotos/${foto.id}`)).status).toBe(200);
  });

  it('answers 404 for a photo that was already deleted', async () => {
    const { foto } = await upload(bea, 'straatfoto');
    await bea.json('DELETE', `/api/fotos/${foto.id}`);
    await bea.json('DELETE', `/api/fotos/${foto.id}`, undefined, 404);
    await bea.json('PUT', `/api/fotos/${foto.id}/annotaties`, { annotaties: [] }, 404);
  });
});

describe('drawing on photos', () => {
  it('refuses annotaties on the kaart photo, whose drawings live in the dossier', async () => {
    const { foto } = await upload(bea, 'kaart');
    expect((await bea.json('PUT', `/api/fotos/${foto.id}/annotaties`, { annotaties: [] }, 400)).fout).toBe('De tekeningen op de kaart worden bij het dossier opgeslagen');
  });

  it('refuses malformed annotaties', async () => {
    const { foto } = await upload(bea, 'straatfoto');
    const zet = (annotaties: unknown) => bea.json('PUT', `/api/fotos/${foto.id}/annotaties`, { annotaties }, 400);
    await zet('geen lijst');
    await zet([{ id: 'a1', type: 'pijl', p: [[1, 2]] }].map((a) => ({ ...a, p: 'x' })));
    await zet([{ id: 'a1', type: 'regenpijp', p: [[1, 2]] }]);
  });

  it('logs a changed drawing and ignores an unchanged one', async () => {
    const { foto } = await upload(bea, 'straatfoto');
    t.klok.verschuif(2 * 3600e3);
    const pijl = { id: 'a1', type: 'pijl', p: [[1, 2], [10, 12]] };
    expect((await bea.json('PUT', `/api/fotos/${foto.id}/annotaties`, { annotaties: [pijl] })).plan_gewijzigd_at).not.toBeNull();
    t.klok.verschuif(2 * 3600e3);
    const voor = (await bea.json<{ items: unknown[] }>('GET', `/api/dossiers/${id}/activiteit`)).items.length;
    expect((await bea.json('PUT', `/api/fotos/${foto.id}/annotaties`, { annotaties: [pijl] })).plan_gewijzigd_at).toBeNull();
    expect((await bea.json<{ items: unknown[] }>('GET', `/api/dossiers/${id}/activiteit`)).items).toHaveLength(voor);
  });

  it('does not bump Plan gewijzigd for an opleverfoto, which is not in the plan', async () => {
    const { foto, plan_gewijzigd_at } = await bea.json('POST', `/api/dossiers/${id}/fotos/opleverfotos`, new Uint8Array(await beeld()), 201);
    expect(plan_gewijzigd_at).toBeNull();
    expect((await bea.json('PUT', `/api/fotos/${foto.id}/annotaties`, { annotaties: [{ id: 'a1', type: 'tekst', p: [[1, 2]], tekst: 'hier' }] })).plan_gewijzigd_at).toBeNull();
  });
});

describe('luchtfoto frame', () => {
  // The address sits at RD 207966, 474195; these checks all fail before PDOK is asked for an image.
  const frame = (bbox: unknown, k = bea, status = 400) => k.json('POST', `/api/dossiers/${id}/luchtfoto`, { bbox }, status);

  it('refuses a frame that is not four finite numbers', async () => {
    await frame('207900,474100,208000,474200');
    await frame([207900, 474100, 208000]);
    await frame([207900, 474100, 208000, null]);
    expect((await frame([207900, 474100, 208000, '474200'])).fout).toBe('Ongeldig kaartkader');
  });

  it('keeps the frame between 10 and 400 meters on each side', async () => {
    expect((await frame([207960, 474190, 207969, 474200])).fout).toBe('Het kader moet tussen 10 en 400 meter breed en hoog zijn.');
    await frame([207760, 474000, 208161, 474300]);
    await frame([207970, 474190, 207960, 474200]);
  });

  it('keeps the frame within 500 meters of the address', async () => {
    expect((await frame([208450, 474150, 208550, 474250])).fout).toBe('Het kader ligt te ver van het adres.');
  });

  it('asks for an address first', async () => {
    const { id: zonder } = await bea.json<{ id: number }>('POST', '/api/dossiers');
    const res = await bea.json('POST', `/api/dossiers/${zonder}/luchtfoto`, { bbox: [0, 0, 100, 100] }, 409);
    expect(res.fout).toBe('Kies eerst een adres.');
    expect((await bea.json('POST', `/api/dossiers/${zonder}/boring`, {}, 409)).fout).toBe('Kies eerst een adres.');
  });

  it('lets only the bezoeker and admins set the kaart, and only admins look up a boring', async () => {
    await bea.json('POST', `/api/dossiers/${id}/toewijzen`, { rol: 'uitvoerder', gebruiker_id: riaId });
    await frame([207900, 474100, 208000, 474200], ria, 403);
    await frame([207900, 474100, 208000, 474200, 1], kees, 400);
    await kees.json('POST', `/api/dossiers/${id}/boring`, {}, 403);
  });
});

describe('nearest boring', () => {
  const boorlocatie = async () => (await bea.json('GET', `/api/dossiers/${id}`)).dossier.data.boorlocatie as string;

  it('stores the nearest profile as the boorprofiel, replacing one there, and says where it came from in boorlocatie', async () => {
    const oud = (await upload(bea, 'boorprofiel')).foto.id;
    await bea.json('PATCH', `/api/dossiers/${id}`, { key: 'boorlocatie', value: 'Ergens' });
    t.klok.verschuif(2 * 3600e3);
    const r = await bea.json('POST', `/api/dossiers/${id}/boring`, {}, 201);
    expect(r.boring).toEqual({ bron: 'DINO', id: DINO_BORING.DINO_NR, afstand_m: 42 });
    const [nieuw] = await slotIds('boorprofiel');
    expect(nieuw).not.toBe(oud);
    expect(r.dossier.fotos.filter((f: { slot: string }) => f.slot === 'boorprofiel').map((f: { id: string }) => f.id)).toEqual([nieuw]);
    const beeld = await (await bea.verzoek('GET', `/api/fotos/${nieuw}`)).arrayBuffer();
    expect((await sharp(Buffer.from(beeld)).metadata()).format).toBe('jpeg');
    expect(await boorlocatie()).toBe(`Walstraat, Deventer: boring ${DINO_BORING.DINO_NR} (DINOloket), 42 m van het huis`);

    const { items } = await bea.json<{ items: { payload: { changes: Record<string, unknown> } }[] }>('GET', `/api/dossiers/${id}/activiteit`);
    expect(items[0].payload.changes).toMatchObject({ 'fotos.boorprofiel': [[oud], [nieuw]], boorlocatie: ['Ergens', await boorlocatie()] });
  });

  it('keeps a field saved by someone else while the lookup was running', async () => {
    const echt = t.ctx.haal;
    t.ctx.haal = async (invoer, init) => {
      if (String(invoer).includes('/MapServer/0/query')) await bea.json('PATCH', `/api/dossiers/${id}`, { key: 'bodemsituatie', value: 'klei' });
      return echt(invoer, init);
    };
    await bea.json('POST', `/api/dossiers/${id}/boring`, {}, 201);
    const { data } = (await bea.json('GET', `/api/dossiers/${id}`)).dossier;
    expect(data.bodemsituatie).toBe('klei');
    expect(data.boorlocatie).toContain(DINO_BORING.DINO_NR);
  });

  it('changes nothing in a closed dossier', async () => {
    await sluit();
    await bea.json('POST', `/api/dossiers/${id}/boring`, {}, 409);
    expect(await slotIds('boorprofiel')).toEqual([]);
  });
});
