// Photo slots: drop or pick images, see thumbnails with their drawings, tap one to open the drawing tool.
import { For, Show, createSignal } from 'solid-js';
import { KADASTRALE_KAART_URL } from '../../shared/constants.ts';
import { annotatiesSvg, kaartAnnotaties } from '../../shared/kaart.ts';
import type { Foto } from '../../shared/types.ts';
import { fotoSlotVoor } from '../../shared/velden.ts';
import { fotoInWachtrij, naarJpeg, wachtendeFotos } from '../opslag.ts';
import { bevestig, melding } from '../ui.tsx';
import { Luchtfoto } from './luchtfoto.tsx';
import { useDossier } from './staat.ts';
import { Tekenaar } from './tekenaar.tsx';

export function FotoDuim(props: { foto: Foto; onClick: () => void }) {
  const s = useDossier();
  const annots = () => (props.foto.slot === 'kaart' ? kaartAnnotaties(s.d) : props.foto.annotaties);
  const svg = () => annotatiesSvg(annots(), { schaal: Math.max(props.foto.breedte, props.foto.hoogte) / 450, mPerPx: null });
  return (
    <button type="button" class="thumb p-0 border-0 qa-foto" onClick={() => props.onClick()} aria-label="Foto bekijken">
      <svg viewBox={`0 0 ${props.foto.breedte} ${props.foto.hoogte}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
        <image href={`/api/fotos/${props.foto.id}`} width={props.foto.breedte} height={props.foto.hoogte} />
        {/* eslint-disable-next-line solid/no-innerhtml -- annotatiesSvg escapes all text */}
        <g innerHTML={svg()} />
      </svg>
    </button>
  );
}

export function FotoSlot(props: { k: string; label?: string }) {
  const s = useDossier();
  const def = fotoSlotVoor(props.k);
  if (!def) throw new Error(`Geen fotoslot voor ${props.k}`);
  const slot = def.slot;
  const uit = () => !s.mag(slot.bewerkers);
  const fotos = () => s.d.fotos.filter((f) => f.slot === props.k);
  const wachtend = () => wachtendeFotos().filter((w) => w.dossierId === s.id && w.slot === props.k);
  const [open, setOpen] = createSignal<string | null>(null);
  const [sleep, setSleep] = createSignal(false);
  let kiezer!: HTMLInputElement;
  let camera!: HTMLInputElement;

  const zetOm = async (b: File) => {
    try {
      return await naarJpeg(b);
    } catch {
      melding('danger', `${b.name} kon niet worden toegevoegd. Gebruik een JPG- of PNG-afbeelding.`);
      return null;
    }
  };

  const voegToe = async (bestanden: File[]) => {
    if (!bestanden.length || uit()) return;
    const huidig = fotos();
    let vervang: string | null = null;
    let blobs: (Blob | null)[];
    if (slot.enkel) {
      vervang = huidig.length ? huidig[huidig.length - 1].id : null;
      blobs = [await zetOm(bestanden[0])];
    } else if (huidig.length === 1 && bestanden.length === 1) {
      const [blob, vervangen] = await Promise.all([zetOm(bestanden[0]), bevestig('Foto toevoegen of vervangen?', 'Er staat al een foto. Wil je die vervangen of deze foto erbij zetten?', { ja: 'Vervangen', nee: 'Nog een toevoegen' })]);
      if (vervangen) vervang = huidig[0].id;
      blobs = [blob];
    } else blobs = await Promise.all(bestanden.map(zetOm));
    if (props.k === 'kaart' && vervang && kaartAnnotaties(s.d).length) s.setKaartVervangen(true);
    for (const [i, blob] of blobs.entries()) {
      if (blob) await fotoInWachtrij({ dossierId: s.id, slot: props.k, vervang: i === 0 ? vervang : null, naam: bestanden[i].name, blob });
    }
  };
  const uitInvoer = (e: Event & { currentTarget: HTMLInputElement }) => {
    const bestanden = [...e.currentTarget.files!];
    e.currentTarget.value = '';
    void voegToe(bestanden);
  };

  return (
    <div
      class={`foto-slot qa-fotoslot qa-fotoslot-${slot.key.replace(/\.\*\./g, '-').replace(/\.\*$/, '').replace(/\./g, '-')}`}
      classList={{ sleep: sleep() }}
      onDragOver={(e) => {
        if (uit()) return;
        e.preventDefault();
        setSleep(true);
      }}
      onDragLeave={() => setSleep(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSleep(false);
        void voegToe([...e.dataTransfer!.files].filter((f) => f.type.startsWith('image/')));
      }}
    >
      <Show when={props.label}>
        <div class="small fw-semibold mb-1">{props.label}</div>
      </Show>
      <div class="d-flex flex-wrap gap-2 mb-2">
        <For each={fotos()}>{(f) => <FotoDuim foto={f} onClick={() => setOpen(f.id)} />}</For>
        <For each={wachtend()}>
          {(w) => (
            <div class="thumb wacht qa-foto-wacht">
              <img src={w.url} alt="" />
            </div>
          )}
        </For>
      </div>
      <Show when={!uit()}>
        <div class="d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-sm btn-outline-primary qa-foto-maken" onClick={() => camera.click()}>📷 Foto maken</button>
          <button type="button" class="btn btn-sm btn-outline-secondary qa-foto-kiezen" onClick={() => kiezer.click()}>Bestand kiezen</button>
        </div>
        <div class="small text-muted mt-1 d-none d-md-block">Of sleep een foto hierheen.</div>
        <input ref={camera} type="file" accept="image/*" capture="environment" class="d-none" onChange={uitInvoer} />
        <input ref={kiezer} type="file" accept="image/*" multiple={!slot.enkel} class="d-none qa-foto-invoer" onChange={uitInvoer} />
      </Show>
      <Show when={open()}>{(id) => <Tekenaar fotoId={id()} onSluit={() => setOpen(null)} />}</Show>
    </div>
  );
}

// The kaart: an uploaded plattegrond or a luchtfoto framed on the address, which the bezoeker draws on.
export function KaartVeld() {
  const s = useDossier();
  const [lucht, setLucht] = createSignal(false);
  const magBewerken = () => s.mag(fotoSlotVoor('kaart')!.slot.bewerkers);
  return (
    <div id="veld-kaart" class="mb-3 qa-veld qa-veld-kaart">
      <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
        <div class="form-label fw-semibold mb-0">Plattegrond van kadaster</div>
        <Show when={magBewerken() && s.d.adres}>
          <button type="button" class="btn btn-sm btn-outline-primary qa-luchtfoto-laden" onClick={() => setLucht(true)}>Luchtfoto laden</button>
        </Show>
        <a href={KADASTRALE_KAART_URL} target="_blank" rel="noopener" class="small">Kadastrale kaart</a>
      </div>
      <div class="form-text mt-0 mb-1">Teken de daken, tuinen en regenpijpen in. Met een luchtfoto rekent de app de oppervlakken zelf uit.</div>
      <Show when={s.kaartVervangen()}>
        <div class="small text-warning mb-1 qa-kaart-vervangen">Je hebt de kaart vervangen, dus de tekeningen kloppen mogelijk niet meer. Verplaats of pas ze aan waar nodig.</div>
      </Show>
      <FotoSlot k="kaart" />
      <Show when={lucht()}>
        <Luchtfoto onSluit={() => setLucht(false)} />
      </Show>
    </div>
  );
}
