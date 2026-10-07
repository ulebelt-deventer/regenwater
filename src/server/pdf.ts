import { type Browser, chromium } from 'playwright';
import type { PdfPrinter } from './context.ts';

// One headless Chromium, launched on first use and reused. Renders run one at a time to keep memory flat on a small VPS.
export class ChromiumPrinter implements PdfPrinter {
  private browser: Promise<Browser> | null = null;
  private wachtrij: Promise<unknown> = Promise.resolve();

  print(html: string): Promise<Buffer> {
    const taak = this.wachtrij.then(() => this.render(html));
    this.wachtrij = taak.catch(() => undefined);
    return taak;
  }

  private async render(html: string): Promise<Buffer> {
    if (this.browser === null) this.browser = chromium.launch();
    const browser = await this.browser;
    if (!browser.isConnected()) {
      this.browser = null;
      return this.render(html);
    }
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    } finally {
      await page.close();
    }
  }

  async sluit(): Promise<void> {
    if (this.browser) await (await this.browser).close();
  }
}

// Test mode: prints for real and keeps each document's HTML, so E2E tests can check what a PDF says.
export class OpnemendePrinter extends ChromiumPrinter {
  html: string[] = [];

  override print(html: string): Promise<Buffer> {
    this.html.push(html);
    return super.print(html);
  }
}
