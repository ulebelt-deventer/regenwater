// The server's only time source. Tests and the test-only endpoint set it, because the aandacht rules depend on elapsed days.
export interface Klok {
  nu(): Date;
  iso(): string;
}

export class VerstelbareKlok implements Klok {
  private vast: number | null = null;
  private verschil = 0;
  nu(): Date {
    return new Date(this.vast ?? Date.now() + this.verschil);
  }
  iso(): string {
    return this.nu().toISOString();
  }
  zet(t: Date | null): void {
    this.vast = t ? t.getTime() : null;
  }
  // Moves time forward while it keeps running, for E2E tests.
  verschuif(ms: number): void {
    if (this.vast !== null) this.vast += ms;
    else this.verschil += ms;
  }
  reset(): void {
    this.vast = null;
    this.verschil = 0;
  }
}
