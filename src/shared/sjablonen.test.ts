import { describe, expect, it } from 'vitest';
import { SJABLONEN, TAG_UITLEG, controleerTags, gebruikteTags, ontbrekendeWaarden, probleemTeksten, sjabloonDef, vulIn } from './sjablonen.ts';

describe('gebruikteTags', () => {
  it('finds every lowercase {tag}, repeats included, and ignores look-alikes', () => {
    expect(gebruikteTags('{adres} en {adres}, {subsidie_info}')).toEqual(['adres', 'adres', 'subsidie_info']);
    expect(gebruikteTags('{Adres} { adres } {} {adres-2} {{bewoner}}')).toEqual(['bewoner']);
  });
});

describe('controleerTags', () => {
  const bezoeker = sjabloonDef('bezoeker_toegewezen');

  it('finds no problems in any default template', () => {
    for (const s of SJABLONEN) expect(controleerTags(s, s.onderwerp, s.tekst), s.key).toEqual({ onbekend: [], ontbrekend: [] });
  });

  it('lists an unknown or misspelled tag once, from the subject or the body', () => {
    expect(controleerTags(bezoeker, '{adress}', '{link} {adress} {bewoner}').onbekend).toEqual(['adress', 'bewoner']);
  });

  it('counts a required tag found only in the subject as present', () => {
    expect(controleerTags(bezoeker, 'Zie {link}', 'Hoi').ontbrekend).toEqual([]);
    expect(controleerTags(bezoeker, 'Hoi', 'Geen link hier').ontbrekend).toEqual(['link']);
  });

  it('does not count a misspelled required tag as the required one', () => {
    expect(controleerTags(bezoeker, '', '{Link} {lnk}')).toEqual({ onbekend: ['lnk'], ontbrekend: ['link'] });
  });
});

describe('probleemTeksten', () => {
  it('words unknown tags first, then missing ones', () => {
    expect(probleemTeksten({ onbekend: ['adress'], ontbrekend: ['link'] })).toEqual(['{adress} is geen bekende tag voor deze e-mail.', '{link} ontbreekt, maar is nodig.']);
    expect(probleemTeksten({ onbekend: [], ontbrekend: [] })).toEqual([]);
  });
});

describe('ontbrekendeWaarden', () => {
  const def = sjabloonDef('subsidie_koop');
  it('flags a required value deleted from the text, and not one still there', () => {
    expect(ontbrekendeWaarden(def, { subsidie_info: 'https://gemeente.example.org' }, 'Subsidie', 'Zie https://gemeente.example.org')).toEqual([]);
    expect(ontbrekendeWaarden(def, { subsidie_info: 'https://gemeente.example.org' }, 'Subsidie', 'Zie de website')).toEqual(['subsidie_info']);
  });

  it('flags a required value that is empty for this dossier, whatever the text says', () => {
    expect(ontbrekendeWaarden(def, { subsidie_info: '' }, 'Subsidie', 'Zie https://gemeente.example.org')).toEqual(['subsidie_info']);
  });
});

describe('vulIn', () => {
  it('fills known tags and leaves an unknown tag visible', () => {
    expect(vulIn('Beste {bewoner}, over {adres} ({adress})', { bewoner: 'Anna', adres: 'Walstraat 74' })).toBe('Beste Anna, over Walstraat 74 ({adress})');
  });

  it('fills an empty value as empty, not as the tag', () => {
    expect(vulIn('Beste {bewoner},', { bewoner: '' })).toBe('Beste ,');
  });

  it('does not fill tags inside a filled-in value, nor treat $ in a value specially', () => {
    expect(vulIn('{bewoner} / {adres}', { bewoner: '{adres} $& $1', adres: 'X' })).toBe('{adres} $& $1 / X');
  });

  it('does not fill inherited object keys', () => {
    expect(vulIn('{constructor} {toString}', {})).toBe('{constructor} {toString}');
  });
});

describe('the template definitions', () => {
  it('explain every tag they offer and require only tags they offer', () => {
    for (const s of SJABLONEN) {
      for (const t of s.tags) expect(TAG_UITLEG[t], `${s.key}: ${t}`).toBeDefined();
      for (const t of s.verplicht) expect(s.tags, s.key).toContain(t);
    }
  });

  it('refuses an unknown template key loudly', () => {
    expect(() => sjabloonDef('bestaat_niet')).toThrow('Onbekend sjabloon: bestaat_niet');
  });
});
