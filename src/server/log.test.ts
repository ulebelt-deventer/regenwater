// Under systemd, warnings and errors carry a syslog prefix on every line so journald files them at their real priority.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from './log.ts';

describe('log', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('prefixes every line of a warning or error under journald, and info not at all', () => {
    vi.stubEnv('JOURNAL_STREAM', '8:12345');
    const uit = vi.spyOn(console, 'log').mockImplementation(() => {});
    const waarschuwing = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fout = vi.spyOn(console, 'error').mockImplementation(() => {});
    const e = new Error('kapot');
    e.stack = 'Error: kapot\n    at plek (bestand.ts:1:1)';
    log.info('email sent to a@example.org');
    log.warn('let op');
    log.error('mislukt', e);
    expect(uit).toHaveBeenCalledWith('email sent to a@example.org');
    expect(waarschuwing).toHaveBeenCalledWith('<4>WARN let op');
    expect(fout).toHaveBeenCalledWith('<3>ERROR mislukt Error: kapot\n<3>    at plek (bestand.ts:1:1)');
  });

  it('leaves lines unprefixed outside journald, as in a dev terminal', () => {
    vi.stubEnv('JOURNAL_STREAM', '');
    const fout = vi.spyOn(console, 'error').mockImplementation(() => {});
    log.error('mislukt', 'reden');
    expect(fout).toHaveBeenCalledWith('ERROR mislukt reden');
  });
});
