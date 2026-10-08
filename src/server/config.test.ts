import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leesConfig } from './config.ts';
import { MailgunMailer } from './mail.ts';

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

  it('refuses to start on an unknown region', () => {
    vi.stubEnv('MAILGUN_REGIO', 'US');
    expect(() => leesConfig()).toThrow('Onbekende MAILGUN_REGIO US');
  });
});
