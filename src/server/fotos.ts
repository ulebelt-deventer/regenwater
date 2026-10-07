import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './config.ts';

export function fotoPad(config: Config, id: string): string {
  return path.join(config.fotoDir, `${id}.jpg`);
}

export function bewaarFoto(config: Config, id: string, inhoud: Buffer): void {
  fs.mkdirSync(config.fotoDir, { recursive: true });
  fs.writeFileSync(fotoPad(config, id), inhoud);
}

// For documents: the photo inlined, so the PDF printer and the concept-Plan page need no authenticated image requests.
export function fotoDataUrl(config: Config, id: string): string {
  return `data:image/jpeg;base64,${fs.readFileSync(fotoPad(config, id)).toString('base64')}`;
}
