import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leesConfig } from './config.ts';
import { MailgunMailer } from './mail.ts';

describe('STAGING', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is off when unset, empty or blank, and on for any other value', () => {
    expect(leesConfig().staging).toBe(false);
    for (const leeg of ['', '  ']) {
      vi.stubEnv('STAGING', leeg);
      expect(leesConfig().staging).toBe(false);
    }
    vi.stubEnv('STAGING', '1');
    expect(leesConfig().staging).toBe(true);
  });
});

function stubProductie(): void {
  vi.stubEnv('APP_MODUS', 'production');
  vi.stubEnv('BASIS_URL', 'https://regenton.example.org');
  vi.stubEnv('MAILGUN_API_KEY', 'sleutel');
  vi.stubEnv('MAILGUN_DOMEIN', 'mg.example.org');
  vi.stubEnv('MAIL_AFZENDER', 'Test <test@mg.example.org>');
  vi.stubEnv('MELDINGEN_DIGEST', 'a@example.org');
  vi.stubEnv('MELDINGEN_FEEDBACK', 'b@example.org');
  vi.stubEnv('MELDINGEN_DOSSIER', 'c@example.org');
}

describe('MELDINGEN_*', () => {
  beforeEach(stubProductie);
  afterEach(() => vi.unstubAllEnvs());

  it('reads a separate list per soort, trimming spaces around the commas', () => {
    vi.stubEnv('MELDINGEN_DIGEST', 'a@example.org, b@example.org ,c@example.org');
    expect(leesConfig().meldingen).toEqual({ digest: ['a@example.org', 'b@example.org', 'c@example.org'], feedback: ['b@example.org'], dossier: ['c@example.org'] });
  });

  it('refuses to start in production when a list is missing or holds an invalid address', () => {
    vi.stubEnv('MELDINGEN_FEEDBACK', '');
    expect(() => leesConfig()).toThrow('Omgevingsvariabele MELDINGEN_FEEDBACK ontbreekt');
    vi.stubEnv('MELDINGEN_FEEDBACK', 'a@example.org,,b@example.org');
    expect(() => leesConfig()).toThrow('Ongeldig e-mailadres in MELDINGEN_FEEDBACK: ""');
    vi.stubEnv('MELDINGEN_FEEDBACK', 'a@example.org;b@example.org');
    expect(() => leesConfig()).toThrow('Ongeldig e-mailadres in MELDINGEN_FEEDBACK: "a@example.org;b@example.org"');
  });

  it('needs no lists outside production', () => {
    vi.unstubAllEnvs();
    expect(leesConfig().meldingen.digest).toEqual(['meldingen@example.org']);
  });
});

describe('MAILGUN_REGIO', () => {
  let urls: string[];
  beforeEach(() => {
    stubProductie();
    urls = [];
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url);
      return Promise.resolve(new Response('{}'));
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const stuur = () => new MailgunMailer(leesConfig()).verstuur({ aan: 'a@example.org', replyTo: 'r@example.org', onderwerp: 'O', tekst: 'T' });

  it('sends through the EU API when unset', async () => {
    await stuur();
    expect(urls).toEqual(['https://api.eu.mailgun.net/v3/mg.example.org/messages']);
  });

  it('sends through the US API when set to us', async () => {
    vi.stubEnv('MAILGUN_REGIO', 'us');
    await stuur();
    expect(urls).toEqual(['https://api.mailgun.net/v3/mg.example.org/messages']);
  });

  it('logs each accepted send with recipient, cc and subject, and logs nothing when Mailgun refuses', async () => {
    const info = vi.spyOn(console, 'log').mockImplementation(() => {});
    await new MailgunMailer(leesConfig()).verstuur({ aan: 'a@example.org', cc: 'c@example.org', replyTo: 'r@example.org', onderwerp: 'Plan van Aanpak', tekst: 'T' });
    expect(info).toHaveBeenCalledWith('email sent to a@example.org, cc c@example.org, subject Plan van Aanpak');
    info.mockClear();
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('Forbidden', { status: 401 })));
    await expect(stuur()).rejects.toThrow('Mailgun 401: Forbidden');
    expect(info).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it('refuses to start on an unknown region', () => {
    vi.stubEnv('MAILGUN_REGIO', 'US');
    expect(() => leesConfig()).toThrow('Onbekende MAILGUN_REGIO US');
  });
});
