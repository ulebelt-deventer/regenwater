import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './config.ts';
import { log } from './log.ts';

export interface Bijlage {
  naam: string;
  inhoud: Buffer;
}

export interface Bericht {
  aan: string;
  cc?: string | null;
  replyTo: string;
  onderwerp: string;
  tekst: string;
  html?: string; // without it, the HTML part is tekstNaarHtml(tekst)
  bijlagen?: Bijlage[];
}

export interface Mailer {
  verstuur(b: Bericht): Promise<void>;
}

export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function htmlMail(inhoud: string): string {
  return `<!doctype html><html><body style="font-family: Figtree, Arial, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.5">${inhoud}</body></html>`;
}

// Plain text with blank-line paragraphs; URLs become links.
export function tekstNaarHtml(tekst: string): string {
  const alinea = (p: string) => escHtml(p).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>');
  return htmlMail(
    tekst
      .split(/\n{2,}/)
      .map((p) => `<p>${alinea(p)}</p>`)
      .join(''),
  );
}

export class GeheugenMailer implements Mailer {
  verstuurd: Bericht[] = [];
  faalVoor: string | null = null; // a test sets this to make sends to one address fail
  async verstuur(b: Bericht): Promise<void> {
    if (this.faalVoor && b.aan === this.faalVoor) throw new Error('Geweigerd door de provider (test)');
    this.verstuurd.push(b);
  }
}

export class BestandMailer implements Mailer {
  private dir: string;
  constructor(dir: string) {
    this.dir = dir;
  }
  async verstuur(b: Bericht): Promise<void> {
    fs.mkdirSync(this.dir, { recursive: true });
    const naam = `${new Date().toISOString().replace(/[:.]/g, '-')}-${b.aan.replace(/[^a-z0-9@.-]/gi, '_')}.html`;
    const pad = path.join(this.dir, naam);
    const kop = `<pre style="background:#f7f0e5;padding:8px">Aan: ${escHtml(b.aan)}\nCc: ${escHtml(b.cc ?? '')}\nReply-To: ${escHtml(b.replyTo)}\nOnderwerp: ${escHtml(b.onderwerp)}\nBijlagen: ${(b.bijlagen ?? []).map((x) => escHtml(x.naam)).join(', ')}</pre>`;
    fs.writeFileSync(pad, kop + (b.html ?? tekstNaarHtml(b.tekst)));
    for (const bijlage of b.bijlagen ?? []) fs.writeFileSync(`${pad}-${bijlage.naam}`, bijlage.inhoud);
    log.info(`email sent to ${b.aan}, subject ${b.onderwerp}, view at: ${pad}`);
  }
}

export class MailgunMailer implements Mailer {
  private sleutel: string;
  private domein: string;
  private afzender: string;
  constructor(cfg: Config) {
    if (!cfg.mailgun) throw new Error('Mailgun niet geconfigureerd');
    this.sleutel = cfg.mailgun.sleutel;
    this.domein = cfg.mailgun.domein;
    this.afzender = cfg.afzender;
  }
  async verstuur(b: Bericht): Promise<void> {
    const form = new FormData();
    form.set('from', this.afzender);
    form.set('to', b.aan);
    if (b.cc) form.set('cc', b.cc);
    form.set('h:Reply-To', b.replyTo);
    form.set('subject', b.onderwerp);
    form.set('text', b.tekst);
    form.set('html', b.html ?? tekstNaarHtml(b.tekst));
    for (const x of b.bijlagen ?? []) form.append('attachment', new Blob([new Uint8Array(x.inhoud)], { type: 'application/pdf' }), x.naam);
    const res = await fetch(`https://api.eu.mailgun.net/v3/${this.domein}/messages`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`api:${this.sleutel}`).toString('base64')}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Mailgun ${res.status}: ${await res.text()}`);
  }
}
