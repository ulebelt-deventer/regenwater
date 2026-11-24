import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { Ctx } from './context.ts';
import { dichtsteBoring, luchtfoto } from './pdok.ts';

// The address as [lon, lat], as PDOK's centroide_ll gives it.
const LL: [number, number] = [6.16, 52.255];

interface Plek {
  id: string;
  lat: number;
  lon: number;
}

// A BRO BHR-GT search response, shaped like the real one: per boring a standardizedLocation in lat/lon, then a deliveredLocation in RD.
function broAntwoord(boringen: Plek[]): string {
  const docs = boringen.map(
    (b) =>
      `<dispatchDocument><BHR_GT_C><brocom:broId>${b.id}</brocom:broId><brocom:standardizedLocation srsName="urn:ogc:def:crs:EPSG::4258"><gml:pos>${b.lat} ${b.lon}</gml:pos></brocom:standardizedLocation><brocom:deliveredLocation srsName="http://www.opengis.net/def/crs/EPSG/0/28992" srsDimension="2"><gml:pos>207700 474400</gml:pos></brocom:deliveredLocation><finalDepthBoring uom="m">3.00</finalDepthBoring></BHR_GT_C></dispatchDocument>`,
  );
  return `<?xml version="1.0"?><dispatchCharacteristicsResponse><numberOfDocuments>${boringen.length}</numberOfDocuments>${docs.join('')}</dispatchCharacteristicsResponse>`;
}

// A DINO MapServer query response, with outSR=4326 geometry.
const dinoAntwoord = (boringen: Plek[]) => ({ features: boringen.map((b) => ({ attributes: { DINO_NR: b.id }, geometry: { x: b.lon, y: b.lat } })) });

const svg = (kleur: string) => `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="${kleur}"/></svg>`;
const LEEG_DINO = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><text x="400" y="200">Dit registratieverzoek bevat geen boormonsterbeschrijving</text></svg>';

interface Script {
  bro?: (string | number)[]; // per circle: a search response, or an HTTP error status
  dino?: (object | number)[];
  dinoProfiel?: Record<string, string>;
  broObject?: Record<string, string>;
  broProfiel?: string;
}

// Answers BRO and DINO from the script by URL, recording the radius of every search and every BRO profile request body.
function nep(s: Script) {
  const broKm: number[] = [];
  const dinoM: number[] = [];
  const profielVerzoeken: string[] = [];
  const haal = async (invoer: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(invoer));
    if (u.pathname.endsWith('/characteristics/searches')) {
      broKm.push((JSON.parse(init!.body as string) as { area: { enclosingCircle: { radius: number } } }).area.enclosingCircle.radius);
      const a = s.bro!.shift()!;
      return typeof a === 'number' ? new Response('kapot', { status: a }) : new Response(a);
    }
    if (u.pathname.endsWith('/MapServer/0/query')) {
      dinoM.push(Number(u.searchParams.get('distance')));
      const a = s.dino!.shift()!;
      return typeof a === 'number' ? new Response('kapot', { status: a }) : Response.json(a);
    }
    const dino = /\/brh\/profile\/(.+)$/.exec(u.pathname);
    if (dino) return new Response(s.dinoProfiel![dino[1]]);
    const obj = /\/sr\/bhrgt\/v2\/objects\/(.+)$/.exec(u.pathname);
    if (obj) return new Response(s.broObject![obj[1]]);
    if (u.pathname.endsWith('/profile/graph/dispatch')) {
      profielVerzoeken.push(init!.body as string);
      return new Response(s.broProfiel);
    }
    throw new Error(`Onverwacht verzoek: ${u}`);
  };
  return { ctx: { haal, klok: { iso: () => '2026-03-02T09:00:00.000Z' } } as unknown as Ctx, broKm, dinoM, profielVerzoeken };
}

// The colour of the rendered profile's centre pixel, to tell which SVG was drawn.
async function kleur(png: Buffer): Promise<string> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const i = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
  return `${data[i]},${data[i + 1]},${data[i + 2]}`;
}

describe('dichtsteBoring', () => {
  it('takes a DINO boring nearer than any BRO one and renders its profile', async () => {
    const { ctx } = nep({
      bro: [broAntwoord([{ id: 'BHR-OOST', lat: 52.255, lon: 6.161 }])], // 0.001° east: about 68 m
      dino: [dinoAntwoord([{ id: 'B33E0001', lat: 52.2552, lon: 6.16 }])], // 0.0002° north: about 22 m
      dinoProfiel: { B33E0001: svg('#ffff00') },
    });
    const b = await dichtsteBoring(ctx, LL);
    expect(b).toMatchObject({ bron: 'DINO', id: 'B33E0001', ll: [6.16, 52.2552], afstand_m: 22 });
    expect(await kleur(b!.png)).toBe('255,255,0');
  });

  it('takes a nearer BRO boring, drawing its profile from the object BRO returns', async () => {
    const { ctx, profielVerzoeken } = nep({
      bro: [broAntwoord([{ id: 'BHR-NOORD', lat: 52.257, lon: 6.16 }, { id: 'BHR-OOST', lat: 52.255, lon: 6.161 }])], // about 222 m and 68 m
      dino: [dinoAntwoord([{ id: 'B33E0002', lat: 52.258, lon: 6.16 }])], // about 332 m
      broObject: { 'BHR-OOST': '<BHR_GT_O>oost</BHR_GT_O>' },
      broProfiel: svg('#00ff00'),
    });
    const b = await dichtsteBoring(ctx, LL);
    expect(b).toMatchObject({ bron: 'BRO', id: 'BHR-OOST', afstand_m: 68 });
    expect(profielVerzoeken).toEqual(['<BHR_GT_O>oost</BHR_GT_O>']);
    expect(await kleur(b!.png)).toBe('0,255,0');
  });

  it('skips a DINO boring without a layer description for the next nearest', async () => {
    const { ctx } = nep({
      bro: [broAntwoord([])],
      dino: [dinoAntwoord([{ id: 'B-LEEG', lat: 52.2552, lon: 6.16 }, { id: 'B-VOL', lat: 52.2555, lon: 6.16 }])],
      dinoProfiel: { 'B-LEEG': LEEG_DINO, 'B-VOL': svg('#0000ff') },
    });
    expect(await dichtsteBoring(ctx, LL)).toMatchObject({ id: 'B-VOL', afstand_m: 55 });
  });

  it('fails rather than searching on when none of the five nearest has a description', async () => {
    const leeg = ['A', 'B', 'C', 'D', 'E', 'F'].map((id, i) => ({ id, lat: 52.255 + (i + 1) * 0.0001, lon: 6.16 }));
    const { ctx, dinoM } = nep({ bro: [broAntwoord([])], dino: [dinoAntwoord(leeg)], dinoProfiel: { A: LEEG_DINO, B: LEEG_DINO, C: LEEG_DINO, D: LEEG_DINO, E: LEEG_DINO, F: svg('#ff0000') } });
    await expect(dichtsteBoring(ctx, LL)).rejects.toMatchObject({ status: 502, message: 'Geen van de 5 dichtstbijzijnde boringen heeft een beschrijving. Zoek zelf op DINOloket.' });
    expect(dinoM).toEqual([500]);
  });

  it('searches both sources in wider circles until one holds a boring', async () => {
    const { ctx, broKm, dinoM } = nep({
      bro: [broAntwoord([]), broAntwoord([{ id: 'BHR-VER', lat: 52.265, lon: 6.16 }])], // 0.01° north: about 1106 m
      dino: [dinoAntwoord([]), dinoAntwoord([])],
      broObject: { 'BHR-VER': '<x/>' },
      broProfiel: svg('#000000'),
    });
    expect(await dichtsteBoring(ctx, LL)).toMatchObject({ bron: 'BRO', id: 'BHR-VER', afstand_m: 1106 });
    expect(broKm).toEqual([0.5, 1.5]);
    expect(dinoM).toEqual([500, 1500]);
  });

  it('gives null when neither source has a boring within 1.5 km', async () => {
    const { ctx, broKm, dinoM } = nep({ bro: [broAntwoord([]), broAntwoord([])], dino: [dinoAntwoord([]), dinoAntwoord([])] });
    expect(await dichtsteBoring(ctx, LL)).toBeNull();
    expect(broKm).toEqual([0.5, 1.5]);
    expect(dinoM).toEqual([500, 1500]);
  });

  it('fails with a 502 when BRO answers with an error', async () => {
    const { ctx } = nep({ bro: [503], dino: [dinoAntwoord([])] });
    await expect(dichtsteBoring(ctx, LL)).rejects.toMatchObject({ status: 502, message: 'BRO gaf een fout (503). Probeer het later opnieuw.' });
  });

  it('fails with a 502 when DINO answers with an error, including ArcGIS errors sent with status 200', async () => {
    await expect(dichtsteBoring(nep({ bro: [broAntwoord([])], dino: [500] }).ctx, LL)).rejects.toMatchObject({ status: 502, message: 'DINOloket gaf een fout (500). Probeer het later opnieuw.' });
    await expect(dichtsteBoring(nep({ bro: [broAntwoord([])], dino: [{ error: { code: 400 } }] }).ctx, LL)).rejects.toMatchObject({ status: 502, message: 'DINOloket gaf een fout (400). Probeer het later opnieuw.' });
  });

  it('fails with a 502 naming the service when BRO or DINO cannot be reached or does not answer in time', async () => {
    const onbereikbaar = (pad: string, e: Error) => {
      const { ctx } = nep({ bro: [broAntwoord([])], dino: [dinoAntwoord([])] });
      const echt = ctx.haal;
      ctx.haal = async (invoer, init) => {
        if (String(invoer).includes(pad)) throw e;
        return echt(invoer, init);
      };
      return dichtsteBoring(ctx, LL);
    };
    await expect(onbereikbaar('/characteristics/searches', new TypeError('fetch failed'))).rejects.toMatchObject({ status: 502, message: 'BRO is niet bereikbaar. Probeer het later opnieuw.' });
    await expect(onbereikbaar('/MapServer/0/query', new DOMException('signal timed out', 'TimeoutError'))).rejects.toMatchObject({ status: 502, message: 'DINOloket is niet bereikbaar. Probeer het later opnieuw.' });
  });

  it('gives up on a request that does not answer within the timeout', async () => {
    const { ctx } = nep({ bro: [broAntwoord([]), broAntwoord([])], dino: [dinoAntwoord([]), dinoAntwoord([])] });
    const signalen: (AbortSignal | null | undefined)[] = [];
    const echt = ctx.haal;
    ctx.haal = async (invoer, init) => {
      signalen.push(init?.signal);
      return echt(invoer, init);
    };
    await dichtsteBoring(ctx, LL);
    expect(signalen.length).toBeGreaterThan(0);
    for (const s of signalen) expect(s).toBeInstanceOf(AbortSignal);
  });

  it('fails when DINO returns only part of the borings in the circle', async () => {
    const { ctx } = nep({ bro: [broAntwoord([])], dino: [{ ...dinoAntwoord([{ id: 'X', lat: 52.255, lon: 6.16 }]), exceededTransferLimit: true }] });
    await expect(dichtsteBoring(ctx, LL)).rejects.toThrow('DINOloket gaf niet alle boringen binnen 0.5 km');
  });
});

describe('luchtfoto', () => {
  // Answers at the requested size: the luchtfoto in green, the kadaster lines as a transparent PNG, or a red one when not asked for transparency.
  async function wms() {
    const verzoeken: URL[] = [];
    const haal = async (invoer: string | URL | Request) => {
      const u = new URL(String(invoer));
      verzoeken.push(u);
      const foto = u.pathname.includes('luchtfotorgb');
      const background = foto ? '#00ff00' : u.searchParams.get('TRANSPARENT') === 'true' ? { r: 0, g: 0, b: 0, alpha: 0 } : '#ff0000';
      const vlak = sharp({ create: { width: Number(u.searchParams.get('WIDTH')), height: Number(u.searchParams.get('HEIGHT')), channels: 4, background } });
      const beeld = await (foto ? vlak.jpeg() : vlak.png()).toBuffer();
      return new Response(new Uint8Array(beeld), { headers: { 'content-type': foto ? 'image/jpeg' : 'image/png' } });
    };
    return { ctx: { haal } as unknown as Ctx, verzoeken };
  }
  const BBOX: [number, number, number, number] = [207900, 474100, 207904, 474104];
  const diensten = (vs: URL[]) => vs.map((u) => `${u.pathname.split('/')[1]} ${u.searchParams.get('LAYERS')} transparent=${u.searchParams.get('TRANSPARENT')}`).sort();

  it('draws the transparent kadaster lines over the luchtfoto', async () => {
    const { ctx, verzoeken } = await wms();
    expect(await kleur(await luchtfoto(ctx, BBOX, 4, 4, false))).toMatch(/^\d,2\d\d,\d$/);
    expect(diensten(verzoeken)).toEqual(['hwh Actueel_orthoHR transparent=null', 'kadaster Perceel,KadastraleGrens,Bebouwing,Label transparent=true']);
  });

  it('for the kaart, asks only for the kadaster lines on their own background', async () => {
    const { ctx, verzoeken } = await wms();
    expect(await kleur(await luchtfoto(ctx, BBOX, 4, 4, true))).toMatch(/^2\d\d,\d,\d$/);
    expect(diensten(verzoeken)).toEqual(['kadaster Perceel,KadastraleGrens,Bebouwing,Label transparent=null']);
  });

  it('asks for the kadaster lines no finer than PDOK draws them and scales them up to the full size', async () => {
    const klein: [number, number, number, number] = [207900, 474100, 207945, 474145];
    for (const kaart of [false, true]) {
      const { ctx, verzoeken } = await wms();
      const { width, height } = await sharp(await luchtfoto(ctx, klein, 2400, 2400, kaart)).metadata();
      expect([width, height]).toEqual([2400, 2400]);
      const lijnen = verzoeken.find((u) => u.pathname.includes('kadastralekaart'))!;
      expect(45 / Number(lijnen.searchParams.get('WIDTH'))).toBeGreaterThanOrEqual(0.028);
      expect(45 / Number(lijnen.searchParams.get('HEIGHT'))).toBeGreaterThanOrEqual(0.028);
    }
  });
});
