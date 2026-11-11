import path from 'node:path';
import { EMAIL_RE } from './mail.ts';

export type Modus = 'production' | 'development' | 'test';
export type MeldingSoort = 'digest' | 'feedback';

export interface Config {
  modus: Modus;
  basisUrl: string;
  dataDir: string;
  fotoDir: string;
  emailDir: string;
  mailgun: { sleutel: string; domein: string; api: string } | null;
  afzender: string; // From address
  meldingen: Record<MeldingSoort, string[]>; // recipients of the automatic admin emails not about one dossier
  healthcheckUrl: string | null;
  staging: boolean; // A test or demo install; the navbar says TEST.
}

function verplicht(naam: string): string {
  const v = process.env[naam];
  if (!v) throw new Error(`Omgevingsvariabele ${naam} ontbreekt`);
  return v;
}

// A Mailgun domain lives in one region; the other region's API answers 401/404 for it.
const MAILGUN_API = { eu: 'https://api.eu.mailgun.net', us: 'https://api.mailgun.net' };
function mailgunApi(): string {
  const regio = process.env.MAILGUN_REGIO ?? 'eu';
  if (regio !== 'eu' && regio !== 'us') throw new Error(`Onbekende MAILGUN_REGIO ${regio} (eu of us)`);
  return MAILGUN_API[regio];
}

function adressen(naam: string): string[] {
  const lijst = verplicht(naam).split(',').map((a) => a.trim());
  const ongeldig = lijst.find((a) => !EMAIL_RE.test(a));
  if (ongeldig !== undefined) throw new Error(`Ongeldig e-mailadres in ${naam}: "${ongeldig}"`);
  return lijst;
}

export function leesConfig(): Config {
  const modus = (process.env.APP_MODUS ?? 'development') as Modus;
  if (!['production', 'development', 'test'].includes(modus)) throw new Error(`Onbekende APP_MODUS ${modus}`);
  const dataDir = process.env.DATA_DIR ?? path.resolve('data');
  const productie = modus === 'production';
  const meldingAdressen = (naam: string) => (productie ? adressen(naam) : ['meldingen@example.org']);
  return {
    modus,
    basisUrl: productie ? verplicht('BASIS_URL') : (process.env.BASIS_URL ?? 'http://localhost:7425'),
    dataDir,
    fotoDir: path.join(dataDir, 'fotos'),
    emailDir: path.resolve('tmp/emails'),
    mailgun: productie ? { sleutel: verplicht('MAILGUN_API_KEY'), domein: verplicht('MAILGUN_DOMEIN'), api: mailgunApi() } : null,
    afzender: productie ? verplicht('MAIL_AFZENDER') : 'Ulebelt Regenwater <regenwater@example.org>',
    meldingen: { digest: meldingAdressen('MELDINGEN_DIGEST'), feedback: meldingAdressen('MELDINGEN_FEEDBACK') },
    healthcheckUrl: process.env.HEALTHCHECK_URL ?? null,
    staging: (process.env.STAGING ?? '').trim() !== '',
  };
}
