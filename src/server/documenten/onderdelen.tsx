import { For, type JSX, Show } from 'solid-js';
import bricks from 'bootstrap-icons/icons/bricks.svg?raw';
import droplet from 'bootstrap-icons/icons/droplet.svg?raw';
import house from 'bootstrap-icons/icons/house.svg?raw';
import leaf from 'bootstrap-icons/icons/leaf.svg?raw';
import logo from '../../client/public/ulebelt-logo.svg?raw';
import { ICOON, type IcoonSoort, annotatiesSvg } from '../../shared/kaart.ts';
import { corporatieNaam, adresRegel, str } from '../../shared/status.ts';
import { kortDatum } from '../../shared/datum.ts';
import type { Annotatie, Dossier, Foto, Gebruiker } from '../../shared/types.ts';
import { isLeeg, optieLabel, veld, waarde } from '../../shared/velden.ts';

// Everything a document component reads. `concept` marks empty fields instead of leaving them out.
export interface Doc {
  d: Dossier;
  gm: Map<number, Gebruiker>;
  concept: boolean;
  foto: (id: string) => string;
}

const ICOON_SVG: Record<(typeof ICOON)[IcoonSoort]['naam'], string> = { house, leaf, bricks, droplet };

// The app's onderdeel icon, inlined since the PDF has no icon font.
export function OnderdeelIcoon(props: { soort: IcoonSoort }): JSX.Element {
  return <span class="icoon" style={{ color: ICOON[props.soort].kleur }} innerHTML={ICOON_SVG[ICOON[props.soort].naam]} />;
}

export const naamVan = (doc: Doc, id: number | null) => (id === null ? null : doc.gm.get(id)!.naam);

export function Leeg(props: { doc: Doc }): JSX.Element {
  return <Show when={props.doc.concept}>{<span class="leeg">nog niet ingevuld</span>}</Show>;
}

// A value, or the concept placeholder when it's empty.
export function Of(props: { doc: Doc; v: string | null | undefined }): JSX.Element {
  return (
    <Show when={props.v} fallback={<Leeg doc={props.doc} />}>
      {props.v}
    </Show>
  );
}

export function Alinea(props: { doc: Doc; key: string }): JSX.Element {
  const v = () => str(props.doc.d, props.key);
  return (
    <Show when={v() || props.doc.concept}>
      <p>
        <Of doc={props.doc} v={v()} />
      </p>
    </Show>
  );
}

export function Keuze(props: { doc: Doc; key: string; veldKey?: string }): JSX.Element {
  const v = () => optieLabel(veld(props.veldKey ?? props.key), props.doc.d, props.key);
  return <Of doc={props.doc} v={v()} />;
}

export const heeft = (d: Dossier, key: string) => !isLeeg(waarde(d, key));

export function eigenaar(d: Dossier): string | null {
  if (d.huur_koop === 'koop') return 'Bewoner (koopwoning)';
  return corporatieNaam(d);
}

export function Kop(props: { doc: Doc; titel: string; extra?: [string, string | null][] }): JSX.Element {
  const d = () => props.doc.d;
  const rijen = (): [string, string | null][] => [
    ['Locatie', d().adres ? adresRegel(d()) : null],
    ['Bewoner', str(d(), 'bewoner_naam')],
    ['Woningeigenaar', eigenaar(d())],
    ['Datum schouw', d().afspraak ? kortDatum(d().afspraak!) : null],
    ['Schouw door', naamVan(props.doc, d().bezoeker_id)],
    ['Auteur', naamVan(props.doc, d().created_by)],
    ...(props.extra ?? []),
  ];
  return (
    <>
      <div class="kop">
        <h1>{props.titel}</h1>
        <div class="logo" innerHTML={logo} />
      </div>
      <table class="kop-tabel">
        <tbody>
          <For each={rijen()}>
            {([label, v]) => (
              <tr>
                <td>{label}:</td>
                <td>
                  <Of doc={props.doc} v={v} />
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </>
  );
}

// The kaart keeps its tekeningen in the dossier data (they feed the form), so it passes `annots` and its scale.
export function FotoMetTekening(props: { doc: Doc; foto: Foto; annots?: Annotatie[]; mPerPx?: number | null }): JSX.Element {
  const f = () => props.foto;
  const annots = () => (props.annots === undefined ? f().annotaties : props.annots);
  const svg = () => annotatiesSvg(annots(), { schaal: Math.max(f().breedte, f().hoogte) / 700, mPerPx: props.mPerPx === undefined ? null : props.mPerPx });
  return (
    <div class="foto">
      <img src={props.doc.foto(f().id)} alt="" />
      <Show when={annots().length > 0}>
        <svg viewBox={`0 0 ${f().breedte} ${f().hoogte}`} preserveAspectRatio="none" innerHTML={svg()} />
      </Show>
    </div>
  );
}

export function fotosIn(d: Dossier, slot: string): Foto[] {
  return d.fotos.filter((f) => f.slot === slot);
}

export function Fotos(props: { doc: Doc; slot: string; onderschrift?: string; breed?: boolean }): JSX.Element {
  return (
    <Show when={fotosIn(props.doc.d, props.slot).length > 0}>
      <div class="fotos">
        <For each={fotosIn(props.doc.d, props.slot)}>
          {(f) => (
            <figure classList={{ breed: props.breed }}>
              <FotoMetTekening doc={props.doc} foto={f} />
              <Show when={props.onderschrift}>
                <figcaption>{props.onderschrift}</figcaption>
              </Show>
            </figure>
          )}
        </For>
      </div>
    </Show>
  );
}

export function Pagina(props: { titel: string; stijl: string; scherm?: boolean; children: JSX.Element }): JSX.Element {
  return (
    <html lang="nl">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.titel}</title>
        <style innerHTML={props.stijl} />
      </head>
      <body classList={{ scherm: props.scherm }}>
        <div class="blad">{props.children}</div>
      </body>
    </html>
  );
}
