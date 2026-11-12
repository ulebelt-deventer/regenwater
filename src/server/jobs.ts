import Database from 'better-sqlite3';
import { controleerBackup } from './backupcheck.ts';
import { leesConfig } from './config.ts';
import { log, stelHealthcheckIn } from './log.ts';
import { EMAIL_RE } from './mail.ts';
import { maakCtx } from './opstart.ts';

// Usage: node dist/server/jobs.js beheerder <naam> <email> | backupcheck <restored-db>
const [taak, ...args] = process.argv.slice(2);
const config = leesConfig();
stelHealthcheckIn(config.healthcheckUrl);
const ctx = maakCtx(config);

try {
  if (taak === 'beheerder') {
    // Bootstraps the first admin on a fresh database; later admins are added in the app.
    const [naam, email] = args;
    if (!naam || !email || !EMAIL_RE.test(email)) throw new Error('Gebruik: beheerder <naam> <email>');
    ctx.db.prepare("INSERT INTO gebruikers (naam, email, rol, created_at) VALUES (?, ?, 'beheerder', ?)").run(naam, email, ctx.klok.iso());
    log.info(`beheerder ${email} aangemaakt`);
  } else if (taak === 'backupcheck') {
    // Read-only, so the restore isn't migrated or touched before it's checked. Exits non-zero on a problem; the caller pings Healthchecks.
    const [pad] = args;
    if (!pad) throw new Error('Gebruik: backupcheck <restored-db>');
    const kopie = new Database(pad, { readonly: true, fileMustExist: true });
    const problemen = controleerBackup(ctx.db, kopie);
    kopie.close();
    if (problemen.length) throw new Error(`backup: ${problemen.join('; ')}`);
    log.info('backup in orde');
  } else {
    throw new Error(`Onbekende taak: ${taak}`);
  }
} finally {
  ctx.db.close();
}
