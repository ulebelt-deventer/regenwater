import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './config.ts';
import type { Ctx } from './context.ts';
import { openDb } from './db.ts';
import { VerstelbareKlok } from './klok.ts';
import { BestandMailer, GeheugenMailer, MailgunMailer, type Mailer } from './mail.ts';
import { ChromiumPrinter, OpnemendePrinter } from './pdf.ts';
import { log } from './log.ts';
import { fakePdok } from './pdokfake.ts';

// The real context for the server and the jobs. Mail goes out only in production; development writes it to files; test keeps it in memory, fakes PDOK, records printed documents and logs no requests.
export function maakCtx(config: Config): Ctx & { pdf: ChromiumPrinter } {
  const test = config.modus === 'test';
  fs.mkdirSync(config.fotoDir, { recursive: true });
  const mailers: Record<Config['modus'], () => Mailer> = {
    production: () => new MailgunMailer(config),
    development: () => new BestandMailer(config.emailDir),
    test: () => new GeheugenMailer(),
  };
  return {
    db: openDb(path.join(config.dataDir, 'app.db')),
    klok: new VerstelbareKlok(),
    mailer: mailers[config.modus](),
    config,
    haal: test ? async (invoer) => fakePdok(String(invoer)) : fetch,
    pdf: test ? new OpnemendePrinter() : new ChromiumPrinter(),
    verzoek: test ? () => {} : log.info,
  };
}
