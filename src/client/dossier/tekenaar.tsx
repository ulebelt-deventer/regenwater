// Full-screen photo viewer and drawing tool. Zoom and pan move the SVG viewBox, so image coordinates never change.
import { For, Match, Show, Switch, createMemo, createSignal, onCleanup, onMount, untrack } from 'solid-js';
import { ICOON, KLEUR, TEKST_PX, afstandTotLijn, afstandTotPolygoon, afstandTotRand, annotatieLabels, annotatiesSvg, binnen, isVlak, kaartAnnotaties, verdelingenTeWissen } from '../../shared/kaart.ts';
import type { Annotatie, AnnotatieType, Json } from '../../shared/types.ts';
import { fotoSlotVoor, nieuwId } from '../../shared/velden.ts';
import { del } from '../api.ts';
import { Modal, OnderdeelIcoon, bevestig, melding, probeer, tip } from '../ui.tsx';
import { useDossier } from './staat.ts';

type Pt = [number, number];
type Gereedschap = AnnotatieType | null;

const TIK_PX = 6;
const RAAK_PX = 14;
const HANDVAT_PX = 9;
// A first tap this far inside an existing vlak selects it instead of starting a new one.
const KIES_VLAK_PX = 5;
const DUBBELTIK_MS = 350;

const HINT: Record<string, string> = {
  kies: 'Tik op een tekening om die te kiezen en te verslepen. Sleep de foto om te schuiven; knijp of scroll om te zoomen.',
  schets: 'Teken met je vinger of de muis.',
  pijl: 'Sleep om een pijl te tekenen.',
  tekst: 'Tik waar de tekst moet komen.',
  dak: 'Tik de hoeken van het dak aan. Tik op het eerste punt of op Klaar om te sluiten.',
  tuin: 'Tik de hoeken van de tuin aan. Tik op het eerste punt of op Klaar om te sluiten.',
  steen: 'Tik de hoeken van het stenen vlak aan. Tik op het eerste punt of op Klaar om te sluiten.',
  regenpijp: 'Tik waar de regenpijp staat.',
  bekijk: 'Knijp of scroll om te zoomen; sleep om te schuiven.',
};

const NAAM: Record<AnnotatieType, string> = { schets: 'Vrij tekenen', pijl: 'Pijl', tekst: 'Tekst', dak: 'Dak', tuin: 'Tuin', steen: 'Steen', regenpijp: 'Regenpijp' };
const MET_GEGEVENS = new Set<AnnotatieType>(['dak', 'tuin', 'steen', 'regenpijp']);

const kloon = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const rond = (q: Pt): Pt => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10];

// A schets's bounding box corners, clockwise from top left; dragging one scales the schets towards the opposite corner.
const hoeken = (p: Pt[]): Pt[] => {
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
};
const handvatten = (a: Annotatie): Pt[] => (a.type === 'schets' ? hoeken(a.p) : a.type === 'regenpijp' || a.type === 'tekst' ? [] : a.p);
// The annotation with handle `i` dragged to `p`.
const metHandvat = (a: Annotatie, i: number, p: Pt): Annotatie => {
  if (a.type !== 'schets') return { ...a, p: a.p.map((q, j) => (j === i ? p : q)) };
  const h = hoeken(a.p);
  const [ax, ay] = h[(i + 2) % 4];
  const [cx, cy] = h[i];
  const sx = cx === ax ? 1 : (p[0] - ax) / (cx - ax);
  const sy = cy === ay ? 1 : (p[1] - ay) / (cy - ay);
  return { ...a, p: a.p.map((q) => [ax + (q[0] - ax) * sx, ay + (q[1] - ay) * sy] as Pt) };
};

interface Stap {
  annots: Annotatie[];
  data: Record<string, Json>;
}

export function Tekenaar(props: { fotoId: string; onSluit: () => void }) {
  const s = useDossier();
  const foto = () => {
    const f = s.d.fotos.find((x) => x.id === props.fotoId);
    if (!f) throw new Error(`Foto ${props.fotoId} niet gevonden`);
    return f;
  };
  const fotoSlot = untrack(foto).slot; // a photo never moves to another slot
  const isKaart = fotoSlot === 'kaart';
  const slot = fotoSlotVoor(fotoSlot)!.slot;
  const uit = () => !s.mag(slot.bewerkers);
  const W = () => foto().breedte;
  const H = () => foto().hoogte;
  const u = () => Math.max(W(), H()) / 900;

  const opgeslagen = () => (isKaart ? kaartAnnotaties(s.d) : foto().annotaties);
  const [concept, setConcept] = createSignal<Annotatie[] | null>(null);
  const annots = () => concept() ?? opgeslagen();
  const labels = createMemo(() => annotatieLabels(annots()));
  const bewaar = (lijst: Annotatie[]) => {
    if (isKaart) s.zet('kaart_annotaties', lijst.length ? (kloon(lijst) as unknown as Json) : null);
    else s.zetAnnotaties(props.fotoId, kloon(lijst));
  };

  const [geschiedenis, setGeschiedenis] = createSignal<Stap[]>([]);
  const onthoud = (data: Record<string, Json> = {}) => setGeschiedenis((g) => [...g, { annots: kloon(opgeslagen()), data }]);
  const ongedaan = () => {
    const g = geschiedenis();
    if (!g.length) return;
    const stap = g[g.length - 1];
    setGeschiedenis(g.slice(0, -1));
    bewaar(stap.annots);
    for (const [k, v] of Object.entries(stap.data)) s.zet(k, v);
    setGekozen(null);
  };
  // Saves `lijst` and clears the `data` keys, undoably. On the kaart it also clears the hand-set verdeling of every dakdeel the edit touches.
  const pasToe = (lijst: Annotatie[], data: Record<string, Json>) => {
    const wissen = isKaart ? verdelingenTeWissen(s.d, opgeslagen(), lijst) : [];
    for (const id of wissen) data[`dak.${id}.verdeling`] = kloon(s.d.data[`dak.${id}.verdeling`]);
    onthoud(data);
    bewaar(lijst);
    for (const k of Object.keys(data)) s.zet(k, null);
    if (wissen.length) melding('success', `Verdeling van ${wissen.map((id) => labels().get(id)!).join(', ')} opnieuw berekend.`);
  };
  const wijzig = (lijst: Annotatie[]) => pasToe(lijst, {});

  const [gereedschap, setGereedschap] = createSignal<Gereedschap>(null);
  const [gekozen, setGekozen] = createSignal<string | null>(null);
  const [inWording, setInWording] = createSignal<Pt[]>([]);
  const [tekstInvoer, setTekstInvoer] = createSignal<{ id: string | null; p: Pt; tekst: string } | null>(null);
  const kies = (g: Gereedschap) => {
    setInWording([]);
    setGekozen(null);
    setGereedschap(gereedschap() === g ? null : g);
  };

  // ---- View: viewBox = x, y, stage size / (fit * z) ----
  let stage!: HTMLDivElement;
  const [maat, setMaat] = createSignal({ b: 1, h: 1 });
  const [beeld, setBeeld] = createSignal({ x: 0, y: 0, z: 1 });
  const fit = () => Math.min(maat().b / W(), maat().h / H());
  const px = () => fit() * beeld().z; // screen pixels per image unit
  const begrens = (x: number, y: number, z: number) => {
    const vw = maat().b / (fit() * z);
    const vh = maat().h / (fit() * z);
    const as = (v: number, zicht: number, totaal: number) => (zicht >= totaal ? (totaal - zicht) / 2 : Math.max(0, Math.min(totaal - zicht, v)));
    return { x: as(x, vw, W()), y: as(y, vh, H()), z };
  };
  const zoomOp = (sx: number, sy: number, factor: number) => {
    const b = beeld();
    const z = Math.max(1, Math.min(12, b.z * factor));
    const p = naarBeeld(sx, sy);
    const nieuwPx = fit() * z;
    setBeeld(begrens(p[0] - sx / nieuwPx, p[1] - sy / nieuwPx, z));
  };
  const schuif = (dsx: number, dsy: number) => {
    const b = beeld();
    setBeeld(begrens(b.x - dsx / px(), b.y - dsy / px(), b.z));
  };
  const naarBeeld = (sx: number, sy: number): Pt => [beeld().x + sx / px(), beeld().y + sy / px()];
  const viewBox = () => `${beeld().x} ${beeld().y} ${maat().b / px()} ${maat().h / px()}`;

  onMount(() => {
    const ro = new ResizeObserver(() => {
      setMaat({ b: stage.clientWidth, h: stage.clientHeight });
      const b = beeld();
      setBeeld(begrens(b.x, b.y, b.z));
    });
    ro.observe(stage);
    const wiel = (e: WheelEvent) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      zoomOp(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.002));
    };
    stage.addEventListener('wheel', wiel, { passive: false });
    window.addEventListener('keydown', toets);
    onCleanup(() => {
      ro.disconnect();
      stage.removeEventListener('wheel', wiel);
      window.removeEventListener('keydown', toets);
    });
  });

  // ---- Hit testing, in image units ----
  const raakt = (a: Annotatie, p: Pt, tol: number): boolean => {
    switch (a.type) {
      case 'schets':
        return a.p.slice(1).some((q, i) => afstandTotLijn(p, a.p[i], q) < 3.5 * u() + tol);
      case 'pijl':
        return afstandTotLijn(p, a.p[0], a.p[1]) < tol;
      case 'regenpijp':
        return Math.hypot(p[0] - a.p[0][0], p[1] - a.p[0][1]) < 11 * u() + tol / 2;
      case 'tekst': {
        const h = TEKST_PX * u();
        const b = (a.tekst ?? '').length * h * 0.6;
        return Math.abs(p[0] - a.p[0][0]) < b / 2 + tol / 2 && Math.abs(p[1] - a.p[0][1]) < h / 2 + tol / 2;
      }
      default:
        return afstandTotPolygoon(p, a.p) < tol;
    }
  };
  const treffers = (p: Pt): string[] => {
    const tol = RAAK_PX / px();
    const omgekeerd = [...annots()].reverse();
    const vlak = (a: Annotatie) => isVlak(a.type);
    return [...omgekeerd.filter((a) => !vlak(a)), ...omgekeerd.filter(vlak)].filter((a) => raakt(a, p, tol)).map((a) => a.id);
  };
  const handvatOp = (p: Pt): number | null => {
    const a = annots().find((x) => x.id === gekozen());
    if (!a) return null;
    const tol = RAAK_PX / px();
    const i = handvatten(a).findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < tol);
    return i < 0 ? null : i;
  };

  // ---- Pointer handling ----
  const wijzers = new Map<number, Pt>();
  type Actie =
    | { soort: 'schuif' }
    | { soort: 'schets'; punten: Pt[] }
    | { soort: 'pijl'; start: Pt }
    | { soort: 'versleep'; id: string; start: Pt; origineel: Annotatie[]; wasGekozen: boolean; ids: string[] }
    | { soort: 'hoek'; id: string; i: number; origineel: Annotatie[] }
    | { soort: 'knijp'; afstand: number; midden: Pt };
  let actie: Actie | null = null;
  let begin: Pt = [0, 0];
  let bewogen = false;
  let laatsteTik = { tijd: 0, id: '' };

  const scherm = (e: PointerEvent): Pt => {
    const r = stage.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const knijpStand = (): { afstand: number; midden: Pt } => {
    const [a, b] = [...wijzers.values()];
    return { afstand: Math.hypot(a[0] - b[0], a[1] - b[1]), midden: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
  };

  const neer = (e: PointerEvent) => {
    stage.setPointerCapture(e.pointerId);
    const sp = scherm(e);
    wijzers.set(e.pointerId, sp);
    if (wijzers.size === 2) {
      setConcept(null);
      actie = { soort: 'knijp', ...knijpStand() };
      return;
    }
    if (wijzers.size > 2) return;
    begin = sp;
    bewogen = false;
    const p = naarBeeld(...sp);
    const g = gereedschap();
    if (uit()) actie = { soort: 'schuif' };
    else if (g === 'schets') actie = { soort: 'schets', punten: [p] };
    else if (g === 'pijl') actie = { soort: 'pijl', start: p };
    else if (g !== null) actie = { soort: 'schuif' }; // a tap places; a drag pans
    else {
      const hoek = handvatOp(p);
      const ids = treffers(p);
      if (hoek !== null) actie = { soort: 'hoek', id: gekozen()!, i: hoek, origineel: kloon(annots()) };
      else if (ids.length) {
        const wasGekozen = gekozen() !== null && ids.includes(gekozen()!);
        const id = wasGekozen ? gekozen()! : ids[0];
        setGekozen(id);
        actie = { soort: 'versleep', id, start: p, origineel: kloon(annots()), wasGekozen, ids };
      } else actie = { soort: 'schuif' };
    }
  };

  // A mouse hovering in select mode shows the hand over anything it can pick or drag.
  const [opTekening, setOpTekening] = createSignal(false);
  const beweeg = (e: PointerEvent) => {
    const sp = scherm(e);
    if (!wijzers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') {
        const p = naarBeeld(...sp);
        setOpTekening(!uit() && (handvatOp(p) !== null || treffers(p).length > 0));
      }
      return;
    }
    const vorig = wijzers.get(e.pointerId)!;
    wijzers.set(e.pointerId, sp);
    if (!actie) return;
    if (actie.soort === 'knijp') {
      if (wijzers.size < 2) return;
      const nu = knijpStand();
      zoomOp(nu.midden[0], nu.midden[1], nu.afstand / actie.afstand);
      schuif(nu.midden[0] - actie.midden[0], nu.midden[1] - actie.midden[1]);
      actie = { soort: 'knijp', ...nu };
      return;
    }
    if (!bewogen && Math.hypot(sp[0] - begin[0], sp[1] - begin[1]) < TIK_PX) return;
    bewogen = true;
    const p = naarBeeld(...sp);
    if (actie.soort === 'schuif') schuif(sp[0] - vorig[0], sp[1] - vorig[1]);
    else if (actie.soort === 'schets') {
      const laatste = actie.punten[actie.punten.length - 1];
      if (Math.hypot(p[0] - laatste[0], p[1] - laatste[1]) * px() < 2) return;
      actie.punten.push(p);
      setConcept([...opgeslagen(), { id: 'nieuw', type: 'schets', p: actie.punten }]);
    }    else if (actie.soort === 'pijl') setConcept([...opgeslagen(), { id: 'nieuw', type: 'pijl', p: [actie.start, p] }]);
    else if (actie.soort === 'versleep') {
      const [dx, dy] = [p[0] - actie.start[0], p[1] - actie.start[1]];
      const id = actie.id;
      setConcept(actie.origineel.map((a) => (a.id === id ? { ...a, p: a.p.map((q) => [q[0] + dx, q[1] + dy] as Pt) } : a)));
    } else {
      const { id, i } = actie;
      setConcept(actie.origineel.map((a) => (a.id === id ? metHandvat(a, i, p) : a)));
    }
  };

  const op = (e: PointerEvent) => {
    if (!wijzers.has(e.pointerId)) return;
    wijzers.delete(e.pointerId);
    const a = actie;
    if (a?.soort === 'knijp') {
      // Lifting one finger of a pinch must not turn into a pan or a tap.
      actie = null;
      return;
    }
    actie = null;
    if (!a || e.type === 'pointercancel') return setConcept(null);
    const p = naarBeeld(...scherm(e));
    const c = concept();
    setConcept(null);
    if (a.soort === 'schets') {
      if (c) wijzig([...opgeslagen(), { id: nieuwId(), type: 'schets', p: [...a.punten, p].map(rond) }]);
    } else if (a.soort === 'pijl') {
      if (c && Math.hypot(p[0] - a.start[0], p[1] - a.start[1]) * px() > 10) {
        const id = nieuwId();
        wijzig([...opgeslagen(), { id, type: 'pijl', p: [a.start, p] }]);
        setGekozen(id);
      }
    } else if (a.soort === 'versleep' || a.soort === 'hoek') {
      if (bewogen && c) wijzig(c);
      else if (a.soort === 'versleep') tikOp(a);
    } else if (!bewogen) plaats(p);
  };

  const tikOp = (a: Extract<Actie, { soort: 'versleep' }>) => {
    const nu = Date.now();
    const ann = annots().find((x) => x.id === a.id)!;
    if (ann.type === 'tekst' && laatsteTik.id === a.id && nu - laatsteTik.tijd < DUBBELTIK_MS) {
      setTekstInvoer({ id: a.id, p: ann.p[0], tekst: ann.tekst ?? '' });
      laatsteTik = { tijd: 0, id: '' };
      return;
    }
    laatsteTik = { tijd: nu, id: a.id };
    if (a.wasGekozen && a.ids.length > 1) setGekozen(a.ids[(a.ids.indexOf(a.id) + 1) % a.ids.length]);
  };

  // A tap with a placing tool (or on empty space while selecting).
  const plaats = (p: Pt) => {
    const g = gereedschap();
    if (g === null || uit()) return setGekozen(null);
    if (g === 'tekst') return setTekstInvoer({ id: null, p, tekst: '' });
    if (g === 'regenpijp') {
      const id = nieuwId();
      wijzig([...opgeslagen(), { id, type: 'regenpijp', p: [p] }]);
      return;
    }
    if (isVlak(g)) {
      const w = inWording();
      if (!w.length) {
        const raak = [...opgeslagen()].reverse().find((a) => isVlak(a.type) && binnen(p, a.p) && afstandTotRand(p, a.p) * px() > KIES_VLAK_PX);
        if (raak) {
          setGereedschap(null);
          return setGekozen(raak.id);
        }
      }
      if (w.length >= 3 && Math.hypot(p[0] - w[0][0], p[1] - w[0][1]) * px() < RAAK_PX) return sluitVlak();
      setInWording([...w, p]);
    }
  };
  const sluitVlak = () => {
    const w = inWording();
    const g = gereedschap();
    if (w.length < 3 || g === null || !isVlak(g)) return;
    const id = nieuwId();
    wijzig([...opgeslagen(), { id, type: g, p: w }]);
    setInWording([]);
  };

  // ---- Deleting: a dak, tuin, steen or regenpijp takes its filled-in fields along (and undo brings them back) ----
  const gegevensVan = (a: Annotatie): Record<string, Json> => {
    const voor = `${a.type}.${a.id}.`;
    return Object.fromEntries(Object.entries(s.d.data).filter(([k]) => k.startsWith(voor)).map(([k, v]) => [k, kloon(v)]));
  };
  const wisMet = (weg: Annotatie[]) => {
    const ids = new Set(weg.map((a) => a.id));
    pasToe(opgeslagen().filter((a) => !ids.has(a.id)), Object.assign({}, ...weg.map(gegevensVan)) as Record<string, Json>);
    setGekozen(null);
  };
  const verwijder = async () => {
    const a = annots().find((x) => x.id === gekozen());
    if (!a) return;
    if (MET_GEGEVENS.has(a.type) && Object.keys(gegevensVan(a)).length) {
      const ok = await bevestig(`${NAAM[a.type]} ${labels().get(a.id)} verwijderen?`, 'Wat je bij dit onderdeel hebt ingevuld wordt ook gewist.', { ja: 'Verwijderen', gevaar: true });
      if (!ok) return;
    }
    wisMet([a]);
  };
  const fotoVerwijderen = async () => {
    const ok = await bevestig('Foto verwijderen?', isKaart ? 'De tekeningen blijven bewaard voor een nieuwe kaart.' : 'De foto en de tekeningen erop worden verwijderd.', { ja: 'Verwijderen', gevaar: true });
    if (!ok) return;
    // onSluit unmounts this component, after which reading props.fotoId throws.
    const id = props.fotoId;
    await probeer(async () => {
      const r = await del<{ plan_gewijzigd_at: string | null }>(`/api/fotos/${id}`);
      props.onSluit();
      s.verwijderFoto(id, r.plan_gewijzigd_at);
    });
  };

  const bewaarTekst = () => {
    const t = tekstInvoer()!;
    setTekstInvoer(null);
    const tekst = t.tekst.trim();
    if (t.id === null) {
      if (tekst) wijzig([...opgeslagen(), { id: nieuwId(), type: 'tekst', p: [t.p], tekst }]);
    } else if (!tekst) wisMet(opgeslagen().filter((a) => a.id === t.id));
    else wijzig(opgeslagen().map((a) => (a.id === t.id ? { ...a, tekst } : a)));
  };

  function toets(e: KeyboardEvent) {
    if (document.querySelector('.modal') || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || uit()) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      ongedaan();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && gekozen()) {
      e.preventDefault();
      void verwijder();
    } else if (e.key === 'Escape') {
      if (inWording().length) setInWording([]);
      else setGekozen(null);
    }
  }

  const gereedschappen = (): AnnotatieType[] => (isKaart ? ['dak', 'tuin', 'steen', 'regenpijp', 'schets', 'pijl', 'tekst'] : ['schets', 'pijl', 'tekst']);
  const geselecteerd = () => annots().find((x) => x.id === gekozen());
  const hint = () => (uit() ? HINT.bekijk : HINT[gereedschap() ?? 'kies']);
  const svg = () => annotatiesSvg(annots(), { schaal: u(), mPerPx: foto().m_per_px, geselecteerd: gekozen() });

  return (
    <div class="annot qa-tekenaar">
      <div class="tools">
        <Show when={!uit()}>
          <button type="button" class="btn btn-sm btn-outline-secondary qa-gereedschap-kies" classList={{ active: gereedschap() === null }} aria-label="Kiezen" ref={tip('Kiezen')} onClick={() => kies(null)}><i class="bi bi-hand-index" aria-hidden="true" /></button>
          <For each={gereedschappen()}>
            {(g) => (
              // A tool with an ICOON shows its name; only the icon-only ones need it as a tooltip.
              <button type="button" class={`btn btn-sm btn-outline-secondary qa-gereedschap-${g}`} classList={{ active: gereedschap() === g }} aria-label={NAAM[g]} ref={g in ICOON ? undefined : tip(NAAM[g])} onClick={() => kies(g)}>
                <Switch fallback={NAAM[g]}>
                  <Match when={g in ICOON && (g as keyof typeof ICOON)}>
                    {(soort) => (
                      <>
                        <OnderdeelIcoon soort={soort()} class="me-1" />
                        {NAAM[g]}
                      </>
                    )}
                  </Match>
                  <Match when={g === 'schets'}><i class="bi bi-brush" aria-hidden="true" /></Match>
                  <Match when={g === 'pijl'}><i class="bi bi-arrow-up-right" aria-hidden="true" /></Match>
                  <Match when={g === 'tekst'}><span class="fw-bold font-serif" aria-hidden="true">T</span></Match>
                </Switch>
              </button>
            )}
          </For>
          <Show when={inWording().length >= 3}>
            <button type="button" class="btn btn-sm btn-primary qa-klaar" onClick={sluitVlak}>Klaar</button>
          </Show>
          <span class="vr mx-1" />
          <Show when={gekozen()}>
            <button type="button" class="btn btn-sm btn-outline-danger qa-verwijder" aria-label="Verwijderen" ref={tip('Verwijderen')} onClick={() => void verwijder()}><i class="bi bi-eraser" aria-hidden="true" /></button>
          </Show>
          <button type="button" class="btn btn-sm btn-outline-secondary qa-ongedaan" aria-label="Ongedaan maken" ref={tip('Ongedaan maken')} disabled={!geschiedenis().length} onClick={ongedaan}><i class="bi bi-arrow-counterclockwise" aria-hidden="true" /></button>
          <button type="button" class="btn btn-sm btn-outline-danger qa-foto-verwijderen" onClick={() => void fotoVerwijderen()}><i class="bi bi-trash3 me-1" aria-hidden="true" />Foto<span class="d-none d-sm-inline"> verwijderen</span></button>
        </Show>
        <button type="button" class="btn btn-sm btn-success ms-auto qa-tekenaar-sluiten" aria-label="Sluiten" onClick={() => props.onSluit()}>✕</button>
      </div>
      <div class="hint qa-hint">
        {hint()}
        <Show when={isKaart && s.kaartVervangen()}>
          <div class="text-warning qa-kaart-vervangen">Je hebt de kaart vervangen, dus de tekeningen kloppen mogelijk niet meer. Verplaats of pas ze aan waar nodig.</div>
        </Show>
      </div>
      <div class="stage qa-tekenvlak" classList={{ 'cursor-pointer': opTekening() && gereedschap() === null }} ref={stage} onPointerDown={neer} onPointerMove={beweeg} onPointerUp={op} onPointerCancel={op}>
        <svg viewBox={viewBox()} preserveAspectRatio="xMinYMin meet" class="qa-tekenaar-svg">
          <image href={`/api/fotos/${props.fotoId}`} width={W()} height={H()} />
          {/* eslint-disable-next-line solid/no-innerhtml -- annotatiesSvg escapes all text */}
          <g innerHTML={svg()} />
          <Show when={geselecteerd()}>
            {(a) => (
              <>
                <Show when={a().type === 'schets' && hoeken(a().p)}>
                  {(h) => <rect x={h()[0][0]} y={h()[0][1]} width={h()[2][0] - h()[0][0]} height={h()[2][1] - h()[0][1]} fill="none" stroke="#1a1a1a" stroke-width={1.5 / px()} stroke-dasharray={`${6 / px()} ${4 / px()}`} />}
                </Show>
                <For each={handvatten(a())}>{(q) => <circle cx={q[0]} cy={q[1]} r={HANDVAT_PX / px()} fill="#fff" stroke="#1a1a1a" stroke-width={2 / px()} />}</For>
              </>
            )}
          </Show>
          <Show when={inWording().length}>
            <polyline points={inWording().map((q) => q.join(',')).join(' ')} fill="none" stroke={KLEUR[gereedschap() ?? 'dak']} stroke-width={3 * u()} stroke-dasharray={`${8 * u()} ${5 * u()}`} />
            <For each={inWording()}>{(q, i) => <circle cx={q[0]} cy={q[1]} r={(i() === 0 ? HANDVAT_PX * 1.4 : HANDVAT_PX) / px()} fill={i() === 0 ? '#ffd84d' : '#fff'} stroke="#1a1a1a" stroke-width={2 / px()} />}</For>
          </Show>
        </svg>
      </div>
      <Show when={tekstInvoer()}>
        {(t) => (
          <Modal
            titel={t().id ? 'Tekst wijzigen' : 'Tekst toevoegen'}
            onSluit={() => setTekstInvoer(null)}
            voet={
              <>
                <button type="button" class="btn btn-outline-secondary" onClick={() => setTekstInvoer(null)}>Annuleren</button>
                <button type="button" class="btn btn-primary qa-tekst-ok" onClick={bewaarTekst}>OK</button>
              </>
            }
          >
            <input
              class="form-control qa-tekst-invoer"
              value={t().tekst}
              ref={(el) => queueMicrotask(() => el.focus())}
              onInput={(e) => setTekstInvoer({ ...t(), tekst: e.currentTarget.value })}
              onKeyDown={(e) => e.key === 'Enter' && bewaarTekst()}
            />
          </Modal>
        )}
      </Show>
    </div>
  );
}
