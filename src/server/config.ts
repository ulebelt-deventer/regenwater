import path from 'node:path';

export type Modus = 'production' | 'development' | 'test';

export interface Config {
  modus: Modus;
  basisUrl: string;
  dataDir: string;
  fotoDir: string;
  emailDir: string;
  mailgun: { sleutel: string; domein: string } | null;
  afzender: string; // From address
  healthcheckUrl: string | null;
}

function verplicht(naam: string): string {
  const v = process.env[naam];
  if (!v) throw new Error(`Omgevingsvariabele ${naam} ontbreekt`);
  return v;
}

export function leesConfig(): Config {
  const modus = (process.env.APP_MODUS ?? 'development') as Modus;
  if (!['production', 'development', 'test'].includes(modus)) throw new Error(`Onbekende APP_MODUS ${modus}`);
  const dataDir = process.env.DATA_DIR ?? path.resolve('data');
  const productie = modus === 'production';
  return {
    modus,
    basisUrl: productie ? verplicht('BASIS_URL') : (process.env.BASIS_URL ?? 'http://localhost:7425'),
    dataDir,
    fotoDir: path.join(dataDir, 'fotos'),
    emailDir: path.resolve('tmp/emails'),
    mailgun: productie ? { sleutel: verplicht('MAILGUN_API_KEY'), domein: verplicht('MAILGUN_DOMEIN') } : null,
    afzender: productie ? verplicht('MAIL_AFZENDER') : 'Ulebelt Regenwater <regenwater@example.org>',
    healthcheckUrl: process.env.HEALTHCHECK_URL ?? null,
  };
}
