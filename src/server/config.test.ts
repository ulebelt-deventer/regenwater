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

describe('MAILGUN_REGIO', () => {
  let urls: string[];
  beforeEach(() => {
    vi.stubEnv('APP_MODUS', 'production');
    vi.stubEnv('BASIS_URL', 'https://regenton.example.org');
    vi.stubEnv('MAILGUN_API_KEY', 'sleutel');
    vi.stubEnv('MAILGUN_DOMEIN', 'mg.example.org');
    vi.stubEnv('MAIL_AFZENDER', 'Test <test@mg.example.org>');
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
