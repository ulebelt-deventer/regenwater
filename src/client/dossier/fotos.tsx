// Photo slots: drop or pick images, see thumbnails with their drawings, tap one to open the drawing tool.
import { For, Show, createSignal, untrack } from 'solid-js';
import { kadastraleKaartUrl } from '../../shared/constants.ts';
import { annotatiesSvg, kaartAnnotaties } from '../../shared/kaart.ts';
import type { Foto } from '../../shared/types.ts';
import { fotoSlotVoor } from '../../shared/velden.ts';
import { fotoInWachtrij, naarJpeg, wachtendeFotos } from '../opslag.ts';
import { Dropdown, Modal, bevestig, kies, melding, probeer } from '../ui.tsx';
import { Luchtfoto } from './luchtfoto.tsx';
import { useDossier } from './staat.ts';
import { Tekenaar } from './tekenaar.tsx';

// `heel`: the whole image at its own aspect ratio, wider than a cropped thumbnail (single-photo slots like the kaart).
// `vierkant`: cropped square, as wide as its container up to the `heel` width.
export function FotoDuim(props: { foto: Foto; onClick: () => void; klein?: boolean; heel?: boolean; vierkant?: boolean }) {
  const s = useDossier();
  const annots = () => (props.foto.slot === 'kaart' ? kaartAnnotaties(s.d) : props.foto.annotaties);
  const svg = () => annotatiesSvg(annots(), { schaal: Math.max(props.foto.breedte, props.foto.hoogte) / 450, mPerPx: null });
  return (
    <button
      type="button"
      class="thumb p-0 border rounded overflow-hidden qa-foto"
      classList={{ 'thumb-klein': props.klein, 'thumb-heel': props.heel, 'thumb-vierkant': props.vierkant }}
      style={props.heel ? { 'aspect-ratio': `${props.foto.breedte} / ${props.foto.hoogte}` } : undefined}
      onClick={() => props.onClick()}
      aria-label="Foto bekijken"
    >
      <svg viewBox={`0 0 ${props.foto.breedte} ${props.foto.hoogte}`} preserveAspectRatio={props.heel ? 'xMidYMid meet' : 'xMidYMid slice'} width="100%" height="100%">
        <image href={`/api/fotos/${props.foto.id}`} width={props.foto.breedte} height={props.foto.hoogte} />
        {/* eslint-disable-next-line solid/no-innerhtml -- annotatiesSvg escapes all text */}
        <g innerHTML={svg()} />
      </svg>
    </button>
  );
}

// A slot's photos as thumbnails for the details page summaries, small or `vierkant`; tapping one opens the drawing tool.
export function FotoDuimen(props: { slot: string; vierkant?: boolean }) {
  const s = useDossier();
  const [open, setOpen] = createSignal<string | null>(null);
  const fotos = () => s.d.fotos.filter((f) => f.slot === props.slot);
  return (
    <Show when={fotos().length}>
      <div class={`d-flex flex-wrap gap-1 my-1 qa-duimen qa-duimen-${props.slot.replace(/\./g, '-')}`}>
        <For each={fotos()}>{(f) => <FotoDuim foto={f} klein={!props.vierkant} vierkant={props.vierkant} onClick={() => setOpen(f.id)} />}</For>
      </div>
      <Show when={open()}>{(id) => <Tekenaar fotoId={id()} onSluit={() => setOpen(null)} onFoto={setOpen} />}</Show>
    </Show>
  );
}

// `eerst`: runs before an image is added and calls `doorgaan` to go on, eg the kaart's warning that an own image has no scale.
export function FotoSlot(props: { k: string; label?: string; eerst?: (doorgaan: () => void) => void }) {
  const s = useDossier();
  const k = untrack(() => props.k); // fixed for the life of the slot
  const def = fotoSlotVoor(k);
  if (!def) throw new Error(`Geen fotoslot voor ${k}`);
  const slot = def.slot;
  const uit = () => !s.mag(slot.bewerkers);
  const fotos = () => s.d.fotos.filter((f) => f.slot === k);
  const wachtend = () => wachtendeFotos().filter((w) => w.dossierId === s.id && w.slot === k);
  const [open, setOpen] = createSignal<string | null>(null);
  const [sleep, setSleep] = createSignal(false);
  // Photos being converted to JPEG, before they reach the upload queue.
  const [omzetten, setOmzetten] = createSignal(0);
  let kiezer!: HTMLInputElement;
  let camera!: HTMLInputElement;
  let vak!: HTMLDivElement;

  const eerst = (doe: () => void) => (props.eerst ? props.eerst(doe) : doe());
  const weiger = (naam: string) => melding('danger', `${naam} kon niet worden toegevoegd. Gebruik een JPG- of PNG-afbeelding.`);
  const zetOm = async (b: File) => {
    try {
      return await naarJpeg(b);
    } catch {
      weiger(b.name);
      return null;
    }
  };

  const voegToe = async (alle: File[]) => {
    if (uit()) return;
    // A file typed as something else (eg a PDF) is refused before the replace question; HEIC often has no type at all, so that is tried.
    const bestanden = alle.filter((b) => !b.type || b.type.startsWith('image/'));
    for (const b of alle) if (!bestanden.includes(b)) weiger(b.name);
    if (!bestanden.length) return;
    setOmzetten((n) => n + 1);
    try {
      await zetInWachtrij(bestanden);
    } finally {
      setOmzetten((n) => n - 1);
    }
  };
  const zetInWachtrij = async (bestanden: File[]) => {
    const huidig = fotos();
    let vervang: string | null = null;
    let blobs: (Blob | null)[];
    if (slot.enkel && huidig.length) {
      const [blob, ja] = await Promise.all([
        zetOm(bestanden[0]),
        bevestig('Bestaande foto vervangen?', 'Hier past maar één foto. Wil je de foto die er staat vervangen door de nieuwe?', { ja: 'Vervangen' }),
      ]);
      if (!ja) return;
      vervang = huidig[0].id;
      blobs = [blob];
    } else if (slot.enkel) blobs = [await zetOm(bestanden[0])];
    else if (huidig.length === 1 && bestanden.length === 1) {
      const [blob, keuze] = await Promise.all([
        zetOm(bestanden[0]),
        kies('Foto toevoegen of vervangen?', 'Er staat al een foto. Wil je die vervangen of deze foto erbij zetten?', [
          { label: 'Nog een toevoegen', class: 'btn-success', qa: 'qa-toevoegen', icoon: 'plus-lg' },
          { label: 'Vervangen', class: 'btn-warning', qa: 'qa-vervangen', icoon: 'arrow-left-right' },
        ]),
      ]);
      if (keuze === null) return;
      if (keuze === 1) vervang = huidig[0].id;
      blobs = [blob];
    } else blobs = await Promise.all(bestanden.map(zetOm));
    if (k === 'kaart' && kaartAnnotaties(s.d).length) s.setKaartVervangen(true);
    for (const [i, blob] of blobs.entries()) {
      if (blob) await fotoInWachtrij({ dossierId: s.id, slot: k, vervang: i === 0 ? vervang : null, naam: bestanden[i].name, blob });
    }
  };
  const GEEN_AFBEELDING = 'Er staat geen afbeelding op het klembord. Kopieer eerst een afbeelding. Een gekopieerd bestand plak je met ⌘V of Ctrl+V.';
  // The button reads the clipboard through the async API, which can't see files copied in Finder or Explorer.
  const plak = async () => {
    vak.focus(); // so a ⌘V that follows lands in this slot
    if (!navigator.clipboard?.read) return melding('danger', 'Plakken van een afbeelding werkt niet in deze browser. Gebruik Uploaden.');
    let items: ClipboardItems;
    try {
      items = await navigator.clipboard.read();
    } catch (e) {
      // Chrome refuses an empty or text-only clipboard with a DataError; a denied permission is a NotAllowedError.
      if (e instanceof DOMException && e.name === 'NotAllowedError') return melding('danger', 'De browser gaf geen toegang tot het klembord. Sta plakken toe en probeer het opnieuw.');
      if (e instanceof DOMException && e.name === 'DataError') return melding('danger', GEEN_AFBEELDING);
      throw e;
    }
    const bestanden: File[] = [];
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) bestanden.push(new File([await item.getType(type)], `geplakt.${type.slice('image/'.length)}`, { type }));
    }
    if (!bestanden.length) return melding('danger', GEEN_AFBEELDING);
    await voegToe(bestanden);
  };
  // A real paste (⌘V / Ctrl+V) into the focused slot also carries copied files.
  const plakToets = (e: ClipboardEvent) => {
    if (uit() || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const bestanden = [...e.clipboardData!.files];
    if (!bestanden.length) return melding('danger', GEEN_AFBEELDING);
    e.preventDefault();
    eerst(() => void voegToe(bestanden));
  };
  const uitInvoer = (e: Event & { currentTarget: HTMLInputElement }) => {
    const bestanden = [...e.currentTarget.files!];
    e.currentTarget.value = '';
    void voegToe(bestanden);
  };
  // The add menu, in the empty slot's button and in the + on the last photo. It sits inside the slot, so a drop on it lands in the slot.
  const Opties = () => (
    <>
      <button type="button" class="dropdown-item qa-foto-maken" onClick={() => eerst(() => camera.click())}><i class="bi bi-camera me-2" aria-hidden="true" />Camera</button>
      <button type="button" class="dropdown-item qa-foto-kiezen" onClick={() => eerst(() => kiezer.click())}><i class="bi bi-cloud-upload me-2" aria-hidden="true" />Uploaden</button>
      <button type="button" class="dropdown-item qa-foto-plakken" onClick={() => eerst(() => void probeer(plak))}><i class="bi bi-clipboard me-2" aria-hidden="true" />Plakken</button>
      <div class="dropdown-item-text small text-muted d-none d-md-block">Of hierheen slepen.</div>
    </>
  );

  return (
    <div
      ref={vak}
      tabindex="-1"
      onPaste={plakToets}
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
        const bestanden = [...e.dataTransfer!.files];
        eerst(() => void voegToe(bestanden));
      }}
    >
      <Show when={props.label}>
        <div class="small fw-semibold mb-1">{props.label}</div>
      </Show>
      <div class="d-flex flex-wrap align-items-start gap-2">
        <For each={fotos()}>
          {(f, i) => (
            <div class="position-relative">
              <FotoDuim foto={f} heel={slot.heel} klein={!slot.heel} onClick={() => setOpen(f.id)} />
              {/* A full single-photo slot gets no +; a photo dropped or pasted on it asks to replace the old one. */}
              <Show when={!uit() && !slot.enkel && i() === fotos().length - 1}>
                <Dropdown class="foto-plus" knop={<i class="bi bi-plus-lg" aria-hidden="true" />} knopClass="btn btn-sm btn-light border border-secondary shadow-sm zonder-caret qa-foto-toevoegen" label="Foto toevoegen">
                  <Opties />
                </Dropdown>
              </Show>
            </div>
          )}
        </For>
        <For each={wachtend()}>
          {(w) => (
            <div class="thumb wacht border rounded overflow-hidden qa-foto-wacht" classList={{ 'thumb-klein': !slot.heel, 'thumb-heel': slot.heel }}>
              <img src={w.url} alt="" class="w-100 h-100 object-fit-cover" />
            </div>
          )}
        </For>
        <Show when={omzetten() > 0 || wachtend().length > 0}>
          <div class="d-flex align-items-center align-self-center small text-muted qa-uploaden">
            <span class="spinner-border spinner-border-sm me-2" aria-hidden="true" />
            Uploaden...
          </div>
        </Show>
        <Show when={!uit() && !fotos().length}>
          <Dropdown
            knop={
              <>
                <i class="bi bi-plus-lg me-1" aria-hidden="true" />
                <i class="bi bi-image" aria-hidden="true" />
              </>
            }
            knopClass="btn btn-sm btn-outline-secondary zonder-caret qa-foto-toevoegen"
            label="Foto toevoegen"
          >
            <Opties />
          </Dropdown>
        </Show>
      </div>
      <Show when={!uit()}>
        <input ref={camera} type="file" accept="image/*" capture="environment" class="d-none" onChange={uitInvoer} />
        <input ref={kiezer} type="file" accept="image/*" multiple={!slot.enkel} class="d-none qa-foto-invoer" onChange={uitInvoer} />
      </Show>
      <Show when={open()}>{(id) => <Tekenaar fotoId={id()} onSluit={() => setOpen(null)} onFoto={setOpen} />}</Show>
    </div>
  );
}

// The kaart: an uploaded plattegrond or a luchtfoto framed on the address, which the bezoeker draws on.
// `alvast`: on the Inschrijving, where the admin may draw ahead of the bezoeker.
export function KaartVeld(props: { alvast?: boolean }) {
  const s = useDossier();
  const [lucht, setLucht] = createSignal(false);
  // Open while warning that an own image has no scale; `doorgaan` adds the image.
  const [eigen, setEigen] = createSignal<{ doorgaan: () => void } | null>(null);
  const magBewerken = () => s.mag(fotoSlotVoor('kaart')!.slot.bewerkers);
  return (
    <div id="veld-kaart" class="mb-3 qa-veld qa-veld-kaart">
      <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
        <div class="form-label fw-semibold mb-0">Plattegrond</div>
        <Show when={magBewerken() && s.d.adres}>
          <button type="button" class="btn btn-sm btn-outline-primary qa-luchtfoto-laden" onClick={() => setLucht(true)}>Luchtfoto laden</button>
        </Show>
        <Show when={s.d.adres}>
          {(a) => <a href={kadastraleKaartUrl(a().rd)} target="_blank" rel="noopener" class="small qa-kadastrale-kaart">Kadastrale kaart</a>}
        </Show>
      </div>
      <Show when={!props.alvast}>
        <div class="form-text mt-0 mb-1 qa-kaart-hint">Teken de daken, tuinen, stenen vlakken en regenpijpen in. Met een luchtfoto rekent de app de oppervlakken zelf uit.</div>
      </Show>
      <Show when={s.kaartVervangen()}>
        <div class="small text-warning mb-1 qa-kaart-vervangen">Je hebt de kaart vervangen, dus de tekeningen kloppen mogelijk niet meer. Verplaats of pas ze aan waar nodig.</div>
      </Show>
      <FotoSlot k="kaart" eerst={(doorgaan) => setEigen({ doorgaan })} />
      <Show when={props.alvast}>
        <div class="form-text mt-1 qa-kaart-hint">Teken hier alvast de daken, tuinen, stenen vlakken en regenpijpen in, of laat dat aan de bezoeker ter plekke over. Met een luchtfoto rekent de app de oppervlakken zelf uit.</div>
      </Show>
      <Show when={lucht()}>
        <Luchtfoto onSluit={() => setLucht(false)} />
      </Show>
      <Show when={eigen()}>
        {(e) => (
          <EigenKaart
            doorgaan={e().doorgaan}
            onLuchtfoto={() => {
              setEigen(null);
              setLucht(true);
            }}
            onSluit={() => setEigen(null)}
          />
        )}
      </Show>
    </div>
  );
}

function EigenKaart(props: { doorgaan: () => void; onLuchtfoto: () => void; onSluit: () => void }) {
  const s = useDossier();
  return (
    <Modal titel="Eigen kaart gebruiken?" onSluit={() => props.onSluit()} class="qa-eigen-kaart">
      <p>Met <strong>Luchtfoto laden</strong> zet de app een luchtfoto of kaart met de perceelgrenzen en gebouwen van de kadastrale kaart erop. Die is op schaal, dus de app rekent de oppervlakken van de daken, tuinen en stenen vlakken zelf uit.</p>
      <p class="text-danger">Een eigen schermafbeelding of foto van de kaart kan ook, maar die is niet op schaal. <strong>De app kan de oppervlakken dan niet uitrekenen</strong>, en je vult ze zelf in.</p>
      <button
        type="button"
        class="btn btn-primary btn-lg w-100 qa-eigen-kaart-doorgaan"
        onClick={() => {
          // Read before closing: closing clears the signal that props.doorgaan reads from.
          const doorgaan = props.doorgaan;
          props.onSluit();
          doorgaan();
        }}
      >
        Toch een eigen afbeelding gebruiken
      </button>
      <Show when={s.d.adres}>
        <button type="button" class="btn btn-outline-primary w-100 mt-2 qa-eigen-kaart-luchtfoto" onClick={() => props.onLuchtfoto()}>Liever de luchtfoto laden</button>
      </Show>
    </Modal>
  );
}
