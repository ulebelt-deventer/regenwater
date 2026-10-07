// Frames a square luchtfoto around the address. While dragging, the last loaded preview is moved and scaled with CSS; a fresh preview loads once the frame settles.
import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import { kaartAnnotaties } from '../../shared/kaart.ts';
import type { Dossier } from '../../shared/types.ts';
import { post } from '../api.ts';
import { Modal, probeer } from '../ui.tsx';
import { useDossier } from './staat.ts';

interface Kader {
  cx: number;
  cy: number;
  zijde: number; // meters
}

const MIN_M = 20;
const MAX_M = 400;
const MAX_AFSTAND_M = 450;
const RUST_MS = 300;

const bbox = (k: Kader) => [k.cx - k.zijde / 2, k.cy - k.zijde / 2, k.cx + k.zijde / 2, k.cy + k.zijde / 2].map((n) => Math.round(n * 10) / 10);

export function Luchtfoto(props: { onSluit: () => void }) {
  const s = useDossier();
  const adres = s.d.adres;
  if (!adres) throw new Error('Luchtfoto zonder adres');
  const [rx, ry] = adres.rd;

  const begrens = (k: Kader): Kader => {
    const zijde = Math.max(MIN_M, Math.min(MAX_M, k.zijde));
    const dx = k.cx - rx;
    const dy = k.cy - ry;
    const afstand = Math.hypot(dx, dy);
    const f = afstand > MAX_AFSTAND_M ? MAX_AFSTAND_M / afstand : 1;
    return { cx: rx + dx * f, cy: ry + dy * f, zijde };
  };
  const pb = adres.perceel_bbox;
  const [kader, setKader] = createSignal<Kader>(
    begrens(pb ? { cx: (pb[0] + pb[2]) / 2, cy: (pb[1] + pb[3]) / 2, zijde: Math.max(pb[2] - pb[0], pb[3] - pb[1]) + 20 } : { cx: rx, cy: ry, zijde: 60 }),
  );
  const [geladen, setGeladen] = createSignal<{ url: string; k: Kader } | null>(null);
  const [laadt, setLaadt] = createSignal(false);
  const [bewaart, setBewaart] = createSignal(false);
  const [maat, setMaat] = createSignal(1);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let nr = 0;
  const laad = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const k = kader();
      const url = `/api/dossiers/${s.id}/luchtfoto?bbox=${bbox(k).join(',')}`;
      const mijn = ++nr;
      setLaadt(true);
      const img = new Image();
      img.onload = () => {
        if (mijn !== nr) return;
        setGeladen({ url, k });
        setLaadt(false);
      };
      img.onerror = () => {
        if (mijn === nr) setLaadt(false);
      };
      img.src = url;
    }, RUST_MS);
  };
  const zet = (k: Kader) => {
    setKader(begrens(k));
    laad();
  };

  let vlak!: HTMLDivElement;
  const wijzers = new Map<number, [number, number]>();
  let knijp: number | null = null;
  const neer = (e: PointerEvent) => {
    vlak.setPointerCapture(e.pointerId);
    wijzers.set(e.pointerId, [e.clientX, e.clientY]);
    if (wijzers.size === 2) {
      const [a, b] = [...wijzers.values()];
      knijp = Math.hypot(a[0] - b[0], a[1] - b[1]);
    }
  };
  const beweeg = (e: PointerEvent) => {
    const vorig = wijzers.get(e.pointerId);
    if (!vorig) return;
    wijzers.set(e.pointerId, [e.clientX, e.clientY]);
    const k = kader();
    if (wijzers.size === 2 && knijp !== null) {
      const [a, b] = [...wijzers.values()];
      const afstand = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zet({ ...k, zijde: (k.zijde * knijp) / afstand });
      knijp = afstand;
    } else if (wijzers.size === 1) {
      const mPerPx = k.zijde / maat();
      zet({ ...k, cx: k.cx - (e.clientX - vorig[0]) * mPerPx, cy: k.cy + (e.clientY - vorig[1]) * mPerPx });
    }
  };
  const op = (e: PointerEvent) => {
    wijzers.delete(e.pointerId);
    if (wijzers.size < 2) knijp = null;
  };

  onMount(() => {
    const ro = new ResizeObserver(() => setMaat(vlak.clientWidth));
    ro.observe(vlak);
    const wiel = (e: WheelEvent) => {
      e.preventDefault();
      const k = kader();
      zet({ ...k, zijde: k.zijde * Math.exp(e.deltaY * 0.002) });
    };
    vlak.addEventListener('wheel', wiel, { passive: false });
    laad();
    onCleanup(() => {
      ro.disconnect();
      vlak.removeEventListener('wheel', wiel);
      clearTimeout(timer);
    });
  });

  // Where the loaded preview sits inside the current frame, in pixels (RD y points north, screen y down).
  const plek = () => {
    const g = geladen();
    if (!g) return null;
    const k = kader();
    const f = maat() / k.zijde;
    const [gx1, , , gy2] = bbox(g.k);
    const [kx1, , , ky2] = bbox(k);
    return { left: `${(gx1 - kx1) * f}px`, top: `${(ky2 - gy2) * f}px`, width: `${g.k.zijde * f}px`, height: `${g.k.zijde * f}px` };
  };

  const opslaan = async () => {
    setBewaart(true);
    const hadTekeningen = kaartAnnotaties(s.d).length > 0;
    const ok = await probeer(async () => {
      const r = await post<{ dossier: Dossier; plan_gewijzigd_at: string | null }>(`/api/dossiers/${s.id}/luchtfoto`, { bbox: bbox(kader()) });
      s.vervang(r.dossier);
    });
    setBewaart(false);
    if (!ok) return;
    if (hadTekeningen) s.setKaartVervangen(true);
    props.onSluit();
  };

  return (
    <Modal
      titel="Luchtfoto laden"
      onSluit={() => props.onSluit()}
      class="qa-luchtfoto"
      voet={
        <>
          <button type="button" class="btn btn-outline-secondary" onClick={() => props.onSluit()}>Annuleren</button>
          <button type="button" class="btn btn-primary qa-luchtfoto-opslaan" disabled={bewaart() || !geladen()} onClick={() => void opslaan()}>
            {bewaart() ? 'Bezig...' : 'Gebruik deze luchtfoto'}
          </button>
        </>
      }
    >
      <p class="small text-muted">Sleep en zoom tot het huis en de tuin in beeld zijn.</p>
      <div ref={vlak} class="ratio ratio-1x1 bg-secondary-subtle overflow-hidden position-relative" style={{ 'touch-action': 'none', cursor: 'grab' }} onPointerDown={neer} onPointerMove={beweeg} onPointerUp={op} onPointerCancel={op}>
        <div>
          <Show when={plek()}>
            {(p) => <img src={geladen()!.url} alt="Luchtfoto" class="position-absolute qa-luchtfoto-beeld" style={p()} draggable={false} />}
          </Show>
          <Show when={laadt()}>
            <span class="position-absolute top-0 end-0 m-2 badge text-bg-light">Laden...</span>
          </Show>
        </div>
      </div>
      <div class="d-flex align-items-center gap-2 mt-2">
        <button type="button" class="btn btn-sm btn-outline-secondary" aria-label="Uitzoomen" onClick={() => zet({ ...kader(), zijde: kader().zijde * 1.25 })}>−</button>
        <input type="range" class="form-range flex-grow-1" min={MIN_M} max={MAX_M} step="1" value={MAX_M + MIN_M - kader().zijde} aria-label="Zoom" onInput={(e) => zet({ ...kader(), zijde: MAX_M + MIN_M - e.currentTarget.valueAsNumber })} />
        <button type="button" class="btn btn-sm btn-outline-secondary" aria-label="Inzoomen" onClick={() => zet({ ...kader(), zijde: kader().zijde / 1.25 })}>+</button>
        <span class="small text-muted text-nowrap qa-luchtfoto-zijde">{Math.round(kader().zijde)} m</span>
      </div>
    </Modal>
  );
}
