// The autosave queue for fields and kaart tekeningen, with the server and browser storage faked. Photo uploads (IndexedDB) are covered end to end.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Json } from '../shared/types.ts';
import { ApiFout } from './api.ts';
import type { Item } from './opslag.ts';

vi.mock('./ui.tsx', () => ({ melding: vi.fn(() => 7), sluitMelding: vi.fn() }));
vi.mock('./api.ts', async (echt) => ({ ...(await echt<typeof import('./api.ts')>()), api: vi.fn() }));

const SLEUTEL = 'regenton.wachtrij';
let opslag: Map<string, string>;
let venster: EventTarget;

beforeEach(() => {
  vi.useFakeTimers();
  opslag = new Map();
  venster = new EventTarget();
  vi.stubGlobal('localStorage', { getItem: (k: string) => opslag.get(k) ?? null, setItem: (k: string, v: string) => opslag.set(k, v) });
  vi.stubGlobal('window', venster);
  vi.stubGlobal('indexedDB', { open: () => ({}) }); // never answers: no photo uploads are pending
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// A fresh copy of the module, as after a page load, with whatever the queue held in localStorage.
async function laad(bewaard?: Item[]) {
  if (bewaard) opslag.set(SLEUTEL, JSON.stringify(bewaard));
  vi.resetModules();
  const m = await import('./opslag.ts');
  const api = vi.mocked((await import('./api.ts')).api);
  const ui = await import('./ui.tsx');
  const melding = vi.mocked(ui.melding);
  const sluitMelding = vi.mocked(ui.sluitMelding);
  api.mockResolvedValue({ plan_gewijzigd_at: '2026-03-02T09:00:00.000Z' });
  return { ...m, api, melding, sluitMelding };
}

const veld = (key: string, value: unknown, dossierId = 1): Item => ({ soort: 'veld', dossierId, key, value: value as Json });
const verzonden = (api: ReturnType<typeof vi.fn>) => api.mock.calls.map(([methode, pad, inhoud]) => [methode, pad, inhoud]);
const bewaard = () => JSON.parse(opslag.get(SLEUTEL) ?? '[]') as Item[];
const geenVerbinding = () => new TypeError('Failed to fetch');

describe('sending edits', () => {
  it('waits for a 400 ms pause in typing, then sends the field', async () => {
    const q = await laad();
    q.zetInWachtrij(veld('wensen', 'a'));
    await vi.advanceTimersByTimeAsync(399);
    expect(q.api).not.toHaveBeenCalled();
    expect(q.opslagStatus()).toBe('bezig');
    await vi.advanceTimersByTimeAsync(1);
    expect(verzonden(q.api)).toEqual([['PATCH', '/api/dossiers/1', { key: 'wensen', value: 'a' }]]);
    expect(q.opslagStatus()).toBe('opgeslagen');
    expect(q.opgeslagenOm()).not.toBeNull();
  });

  it('sends only the last value of a field typed in quick succession', async () => {
    const q = await laad();
    for (const v of ['W', 'Wa', 'Wat']) {
      q.zetInWachtrij(veld('wensen', v));
      await vi.advanceTimersByTimeAsync(200);
    }
    await vi.advanceTimersByTimeAsync(400);
    expect(verzonden(q.api)).toEqual([['PATCH', '/api/dossiers/1', { key: 'wensen', value: 'Wat' }]]);
  });

  it('sends different fields in the order they were first edited, keeping each one’s latest value', async () => {
    const q = await laad();
    q.zetInWachtrij(veld('wensen', 'a'));
    q.zetInWachtrij(veld('hoosbuien', 'b'));
    q.zetInWachtrij(veld('wensen', 'a2'));
    q.zetInWachtrij(veld('wensen', 'x', 2));
    await vi.advanceTimersByTimeAsync(400);
    expect(verzonden(q.api).map(([, pad, b]) => [pad, b])).toEqual([
      ['/api/dossiers/1', { key: 'wensen', value: 'a2' }],
      ['/api/dossiers/1', { key: 'hoosbuien', value: 'b' }],
      ['/api/dossiers/2', { key: 'wensen', value: 'x' }],
    ]);
  });

  it('sends kaart tekeningen to their photo, merging edits per photo', async () => {
    const q = await laad();
    const pijl = { id: 'p1', type: 'pijl' as const, p: [[1, 2]] as [number, number][] };
    q.zetInWachtrij({ soort: 'annotaties', dossierId: 1, fotoId: 'f1', value: [] });
    q.zetInWachtrij({ soort: 'annotaties', dossierId: 1, fotoId: 'f1', value: [pijl] });
    q.zetInWachtrij({ soort: 'annotaties', dossierId: 1, fotoId: 'f2', value: [] });
    await vi.advanceTimersByTimeAsync(400);
    expect(verzonden(q.api)).toEqual([['PUT', '/api/fotos/f1/annotaties', { annotaties: [pijl] }], ['PUT', '/api/fotos/f2/annotaties', { annotaties: [] }]]);
  });

  it('sends an edit made while the older value was on its way, instead of dropping it', async () => {
    const q = await laad();
    let antwoord!: (v: unknown) => void;
    q.api.mockImplementationOnce(() => new Promise((ok) => (antwoord = ok)));
    q.zetInWachtrij(veld('wensen', 'oud'));
    await vi.advanceTimersByTimeAsync(400);
    q.zetInWachtrij(veld('wensen', 'nieuw'));
    antwoord({ plan_gewijzigd_at: null });
    await vi.advanceTimersByTimeAsync(400);
    expect(verzonden(q.api).map(([, , b]) => b)).toEqual([{ key: 'wensen', value: 'oud' }, { key: 'wensen', value: 'nieuw' }]);
    expect(bewaard()).toEqual([]);
  });

  it('tells only the listeners of that dossier, with the new Plan gewijzigd time', async () => {
    const q = await laad();
    const een = vi.fn();
    const twee = vi.fn();
    q.luister(1, { opgeslagen: een, afgewezen: vi.fn(), foto: vi.fn() });
    const stop = q.luister(2, { opgeslagen: twee, afgewezen: vi.fn(), foto: vi.fn() });
    stop();
    q.zetInWachtrij(veld('wensen', 'a'));
    q.zetInWachtrij(veld('wensen', 'b', 2));
    await vi.advanceTimersByTimeAsync(400);
    expect(een.mock.calls).toEqual([[veld('wensen', 'a'), '2026-03-02T09:00:00.000Z']]);
    expect(twee).not.toHaveBeenCalled();
  });
});

describe('surviving a reload', () => {
  it('keeps unsent edits in localStorage and empties it once they are saved', async () => {
    const q = await laad();
    q.zetInWachtrij(veld('wensen', 'a'));
    q.zetInWachtrij(veld('hoosbuien', 'b'));
    expect(bewaard()).toEqual([veld('wensen', 'a'), veld('hoosbuien', 'b')]);
    await vi.advanceTimersByTimeAsync(400);
    expect(bewaard()).toEqual([]);
  });

  it('lays unsent edits over the page after a reload and sends them on start', async () => {
    const q = await laad([veld('wensen', 'a'), veld('notities', 'n', 2)]);
    expect(q.wachtend(1)).toEqual([veld('wensen', 'a')]);
    expect(q.opslagStatus()).toBe('bezig');
    q.startOpslag();
    await vi.advanceTimersByTimeAsync(0);
    expect(q.api).toHaveBeenCalledTimes(2);
  });

  it('merges a new edit into one restored from before the reload', async () => {
    const q = await laad([veld('wensen', 'a'), veld('hoosbuien', 'b')]);
    q.zetInWachtrij(veld('wensen', 'a2'));
    expect(bewaard()).toEqual([veld('wensen', 'a2'), veld('hoosbuien', 'b')]);
  });

  it('asks before leaving the page while edits are unsent, and not after', async () => {
    const q = await laad();
    q.startOpslag();
    const verlaat = () => {
      const e = new Event('beforeunload', { cancelable: true });
      venster.dispatchEvent(e);
      return e.defaultPrevented;
    };
    q.zetInWachtrij(veld('wensen', 'a'));
    expect(verlaat()).toBe(true);
    await vi.advanceTimersByTimeAsync(400);
    expect(verlaat()).toBe(false);
  });
});

describe('without a connection', () => {
  it('keeps the edit, says so once, and retries after 2, 4, 8, 16 and then every 30 seconds', async () => {
    const q = await laad();
    q.api.mockRejectedValue(geenVerbinding());
    q.zetInWachtrij(veld('wensen', 'a'));
    await vi.advanceTimersByTimeAsync(400);
    expect(q.opslagStatus()).toBe('mislukt');
    for (const [i, wacht] of [2000, 4000, 8000, 16000, 30000, 30000].entries()) {
      await vi.advanceTimersByTimeAsync(wacht - 1);
      expect(q.api, `poging ${i + 2}`).toHaveBeenCalledTimes(i + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(q.api).toHaveBeenCalledTimes(i + 2);
    }
    expect(q.melding.mock.calls).toEqual([['danger', 'Opslaan mislukt: er is geen verbinding met de server. Je wijzigingen blijven bewaard en worden opnieuw verstuurd.', 'wifi-off']]);
    expect(q.sluitMelding).not.toHaveBeenCalled();
    expect(bewaard()).toEqual([veld('wensen', 'a')]);
  });

  it('closes the no-connection alert once every edit is saved, and not while one is still waiting', async () => {
    const q = await laad();
    q.api.mockRejectedValueOnce(geenVerbinding());
    q.zetInWachtrij(veld('wensen', 'a'));
    await vi.advanceTimersByTimeAsync(400);
    q.api.mockImplementationOnce(async () => {
      q.zetInWachtrij(veld('hoosbuien', 'b'));
      return { plan_gewijzigd_at: null };
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(q.api).toHaveBeenCalledTimes(3); // the retry, then the edit made meanwhile in the same run
    expect(q.sluitMelding.mock.calls).toEqual([[7]]);
  });

  it('treats a server error (5xx) like a dropped connection', async () => {
    const q = await laad();
    q.api.mockRejectedValueOnce(new ApiFout(502, 'Bad Gateway'));
    q.zetInWachtrij(veld('wensen', 'a'));
    await vi.advanceTimersByTimeAsync(400);
    expect(q.opslagStatus()).toBe('mislukt');
    await vi.advanceTimersByTimeAsync(2000);
    expect(q.opslagStatus()).toBe('opgeslagen');
    expect(bewaard()).toEqual([]);
  });

  it('retries at once when the browser comes back online', async () => {
    const q = await laad();
    q.startOpslag();
    q.api.mockRejectedValueOnce(geenVerbinding()).mockRejectedValueOnce(geenVerbinding());
    q.zetInWachtrij(veld('wensen', 'a'));
    await vi.advanceTimersByTimeAsync(400 + 2000); // two failures: the next try is 4 s away
    venster.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(q.api).toHaveBeenCalledTimes(3);
    expect(q.opslagStatus()).toBe('opgeslagen');
  });

  it('starts the wait over at 2 seconds after a success', async () => {
    const q = await laad();
    q.api.mockRejectedValueOnce(geenVerbinding()).mockRejectedValueOnce(geenVerbinding());
    q.zetInWachtrij(veld('wensen', 'a'));
    await vi.advanceTimersByTimeAsync(400 + 2000 + 4000);
    q.api.mockRejectedValueOnce(geenVerbinding());
    q.zetInWachtrij(veld('hoosbuien', 'b'));
    await vi.advanceTimersByTimeAsync(400 + 1999);
    expect(q.api).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(q.api).toHaveBeenCalledTimes(5);
  });

  it('says it again when the connection drops a second time', async () => {
    const q = await laad();
    q.api.mockRejectedValueOnce(geenVerbinding());
    q.zetInWachtrij(veld('wensen', 'a'));
    await vi.advanceTimersByTimeAsync(400 + 2000);
    q.api.mockRejectedValueOnce(geenVerbinding());
    q.zetInWachtrij(veld('wensen', 'b'));
    await vi.advanceTimersByTimeAsync(400);
    expect(q.melding).toHaveBeenCalledTimes(2);
  });

  it('sends a new edit soon after it is typed, even while waiting to retry', async () => {
    const q = await laad();
    q.api.mockRejectedValueOnce(geenVerbinding()).mockRejectedValueOnce(geenVerbinding()).mockRejectedValueOnce(geenVerbinding());
    q.zetInWachtrij(veld('wensen', 'a'));
    await vi.advanceTimersByTimeAsync(400 + 2000 + 4000); // the next try is 8 s away
    q.zetInWachtrij(veld('hoosbuien', 'b'));
    await vi.advanceTimersByTimeAsync(400);
    expect(verzonden(q.api).slice(3).map(([, , b]) => b)).toEqual([{ key: 'wensen', value: 'a' }, { key: 'hoosbuien', value: 'b' }]);
  });
});

describe('when the server refuses an edit', () => {
  it('shows why, drops that edit, reloads the page and carries on with the rest', async () => {
    const q = await laad();
    const afgewezen = vi.fn();
    q.luister(1, { opgeslagen: vi.fn(), afgewezen, foto: vi.fn() });
    q.api.mockRejectedValueOnce(new ApiFout(403, 'Je mag dit veld niet wijzigen'));
    q.zetInWachtrij(veld('wensen', 'a'));
    q.zetInWachtrij(veld('hoosbuien', 'b'));
    await vi.advanceTimersByTimeAsync(400);
    expect(q.melding.mock.calls).toEqual([['danger', 'Opslaan mislukt: Je mag dit veld niet wijzigen']]);
    expect(afgewezen).toHaveBeenCalledTimes(1);
    expect(q.api).toHaveBeenCalledTimes(2);
    expect(bewaard()).toEqual([]);
    expect(q.opslagStatus()).toBe('opgeslagen');
  });

  it('keeps every edit when the session has expired, to send after logging in again', async () => {
    const q = await laad();
    q.api.mockRejectedValue(new ApiFout(401, 'Niet ingelogd'));
    q.zetInWachtrij(veld('wensen', 'a'));
    q.zetInWachtrij(veld('hoosbuien', 'b'));
    await vi.advanceTimersByTimeAsync(400 + 60000);
    expect(bewaard()).toEqual([veld('wensen', 'a'), veld('hoosbuien', 'b')]);
    expect(q.api).toHaveBeenCalledTimes(1);
    expect(q.melding).not.toHaveBeenCalled();
  });
});
