/**
 * Thin layout helper around jsPDF for professional, consistent medical reports.
 * Uses the standard Helvetica font (WinAnsi), so every string passes through `pdfText`.
 */
import { jsPDF } from 'jspdf';
import { autoTable, type RowInput, type UserOptions } from 'jspdf-autotable';
import { APP_NAME, APP_SUBTITLE, APP_VERSION, BURN_DEPTH_MAP, CLINICAL_DISCLAIMER, segmentKey } from '@/constants/clinical';
import { ANTERIOR_SHAPES, FIGURE_WIDTH, MAP_VIEWBOX, POSTERIOR_OFFSET_X, POSTERIOR_SHAPES, SIDE_LABELS } from '@/features/body-mapping/geometry2d';
import type { BurnDepth } from '@/types/domain';

/** Replaces characters outside WinAnsi (the standard PDF fonts) with readable ASCII. */
export function pdfText(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/[→⟶]/g, '->')
    .replace(/←/g, '<-')
    .replace(/−/g, '-')
    .replace(/⅓/g, '1/3')
    .replace(/₂/g, '2')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, ' ')
    .replace(/[^\x09\x0a\x0d\x20-\x7e -ÿ–—•…€]/g, '?');
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const NAVY: [number, number, number] = [11, 23, 48];
const BLUE: [number, number, number] = [29, 106, 229];
const MUTED: [number, number, number] = [88, 103, 128];
const TEXT: [number, number, number] = [13, 21, 38];

export interface ReportHeader {
  title: string;
  patientLine: string;
  patientCode: string;
  generatedAt: string;
  periodLine?: string;
}

export class PdfBuilder {
  readonly doc: jsPDF;
  readonly margin = 14;
  readonly pageWidth: number;
  readonly pageHeight: number;
  y = 0;
  private header: ReportHeader;
  private headerDrawnOn = new Set<number>([1]);

  constructor(header: ReportHeader) {
    this.doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
    this.header = header;
    this.doc.setProperties({ title: pdfText(`${APP_NAME} - ${header.title} - ${header.patientCode}`), creator: `${APP_NAME} ${APP_VERSION}`, subject: 'Clinical decision-support report' });
    this.drawHeader();
  }

  get contentWidth() {
    return this.pageWidth - this.margin * 2;
  }

  private drawHeader() {
    const d = this.doc;
    d.setFillColor(...NAVY);
    d.rect(0, 0, this.pageWidth, 24, 'F');
    d.setTextColor(255, 255, 255);
    d.setFont('helvetica', 'bold');
    d.setFontSize(14);
    d.text(APP_NAME, this.margin, 10);
    d.setFont('helvetica', 'normal');
    d.setFontSize(7.5);
    d.setTextColor(185, 198, 220);
    d.text(pdfText(APP_SUBTITLE), this.margin, 14.5);
    d.setFontSize(11);
    d.setTextColor(255, 255, 255);
    d.setFont('helvetica', 'bold');
    d.text(pdfText(this.header.title), this.pageWidth - this.margin, 10, { align: 'right' });
    d.setFont('helvetica', 'normal');
    d.setFontSize(7.5);
    d.setTextColor(185, 198, 220);
    d.text(pdfText(`Generated ${this.header.generatedAt}`), this.pageWidth - this.margin, 14.5, { align: 'right' });
    d.setFillColor(...BLUE);
    d.rect(0, 24, this.pageWidth, 0.8, 'F');
    d.setTextColor(...TEXT);
    d.setFontSize(9);
    d.setFont('helvetica', 'bold');
    d.text(pdfText(this.header.patientLine), this.margin, 31);
    d.setFont('helvetica', 'normal');
    if (this.header.periodLine) {
      d.setFontSize(8);
      d.setTextColor(...MUTED);
      d.text(pdfText(this.header.periodLine), this.margin, 35.5);
    }
    this.y = this.header.periodLine ? 41 : 37;
  }

  newPage() {
    this.doc.addPage();
    this.headerDrawnOn.add(this.doc.getCurrentPageInfo().pageNumber);
    this.drawHeader();
  }

  /** Adds a page if fewer than `needed` mm remain above the footer. */
  ensureSpace(needed: number) {
    if (this.y + needed > this.pageHeight - 22) this.newPage();
  }

  section(title: string) {
    this.ensureSpace(16);
    this.y += 3;
    const d = this.doc;
    d.setFont('helvetica', 'bold');
    d.setFontSize(11);
    d.setTextColor(...NAVY);
    d.text(pdfText(title), this.margin, this.y);
    d.setDrawColor(...BLUE);
    d.setLineWidth(0.4);
    d.line(this.margin, this.y + 1.5, this.margin + 24, this.y + 1.5);
    d.setTextColor(...TEXT);
    d.setFont('helvetica', 'normal');
    this.y += 6;
  }

  paragraph(text: string, opts: { size?: number; muted?: boolean; bold?: boolean } = {}) {
    const d = this.doc;
    d.setFontSize(opts.size ?? 9);
    d.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    d.setTextColor(...(opts.muted ? MUTED : TEXT));
    const lines = d.splitTextToSize(pdfText(text), this.contentWidth) as string[];
    const lh = (opts.size ?? 9) * 0.42;
    for (const line of lines) {
      this.ensureSpace(lh + 1);
      d.text(line, this.margin, this.y);
      this.y += lh;
    }
    this.y += 1.5;
    d.setTextColor(...TEXT);
    d.setFont('helvetica', 'normal');
  }

  /** Coloured call-out box (warnings, notices). */
  callout(text: string, tone: 'warning' | 'info' | 'danger' = 'warning') {
    const d = this.doc;
    const colors = { warning: { bg: [255, 244, 223], fg: [122, 70, 0] }, info: { bg: [231, 239, 252], fg: [19, 73, 160] }, danger: { bg: [253, 237, 240], fg: [160, 30, 55] } }[tone];
    d.setFontSize(8.5);
    const lines = d.splitTextToSize(pdfText(text), this.contentWidth - 6) as string[];
    const h = lines.length * 3.7 + 4;
    this.ensureSpace(h + 2);
    d.setFillColor(...(colors.bg as [number, number, number]));
    d.roundedRect(this.margin, this.y - 1, this.contentWidth, h, 1.5, 1.5, 'F');
    d.setTextColor(...(colors.fg as [number, number, number]));
    lines.forEach((l, i) => d.text(l, this.margin + 3, this.y + 3 + i * 3.7));
    d.setTextColor(...TEXT);
    this.y += h + 2;
  }

  keyValues(rows: [string, string][], columns = 2) {
    const body: RowInput[] = [];
    for (let i = 0; i < rows.length; i += columns) {
      const row: string[] = [];
      for (let c = 0; c < columns; c++) {
        const r = rows[i + c];
        row.push(r ? pdfText(r[0]) : '', r ? pdfText(r[1] || '-') : '');
      }
      body.push(row);
    }
    this.table({
      body,
      theme: 'plain',
      styles: { fontSize: 8.5, cellPadding: { top: 1.2, bottom: 1.2, left: 1.5, right: 2 }, overflow: 'linebreak' },
      columnStyles: Object.fromEntries(Array.from({ length: columns }, (_, c) => [c * 2, { fontStyle: 'bold', textColor: MUTED, cellWidth: 34 }])),
    });
  }

  table(options: UserOptions) {
    const sanitize = (rows?: RowInput[]) =>
      rows?.map((r) => (Array.isArray(r) ? r.map((c) => (typeof c === 'object' && c !== null && 'content' in c ? { ...c, content: pdfText(c.content) } : pdfText(c))) : r)) as RowInput[] | undefined;
    autoTable(this.doc, {
      startY: this.y,
      margin: { left: this.margin, right: this.margin, top: 40, bottom: 22 },
      theme: 'striped',
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 1.6, textColor: TEXT, lineColor: [220, 227, 236] },
      alternateRowStyles: { fillColor: [245, 248, 252] },
      ...options,
      head: sanitize(options.head as RowInput[] | undefined),
      body: sanitize(options.body as RowInput[] | undefined),
      didDrawPage: () => {
        // Re-draw the header on pages created by the table.
        if (this.doc.getCurrentPageInfo().pageNumber > 1 && !this.headerDrawnOn.has(this.doc.getCurrentPageInfo().pageNumber)) {
          this.headerDrawnOn.add(this.doc.getCurrentPageInfo().pageNumber);
          const saveY = this.y;
          this.drawHeader();
          this.y = saveY;
        }
      },
    });
    const last = (this.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    this.y = (last?.finalY ?? this.y) + 4;
  }

  /** Vector rendering of the 2D anatomical body map with depth colours. */
  bodyMap(depthBySegment: Map<string, BurnDepth>, widthMm = 120) {
    const scale = widthMm / MAP_VIEWBOX.width;
    const height = MAP_VIEWBOX.height * scale;
    this.ensureSpace(height + 14);
    const x0 = this.margin + (this.contentWidth - widthMm) / 2;
    const y0 = this.y;
    const d = this.doc;
    d.setLineWidth(0.2);
    const draw = (shapes: typeof ANTERIOR_SHAPES, offsetX: number) => {
      for (const s of shapes) {
        const depth = depthBySegment.get(segmentKey(s.segment, s.surface));
        d.setFillColor(...(depth ? hexToRgb(BURN_DEPTH_MAP[depth].color) : ([236, 240, 245] as [number, number, number])));
        d.setDrawColor(120, 132, 152);
        const pts = s.points.map(([x, y]) => [x0 + (x + offsetX) * scale, y0 + y * scale] as const);
        const deltas = pts.slice(1).map((p, i) => [p[0] - pts[i]![0], p[1] - pts[i]![1]]);
        d.lines(deltas, pts[0]![0], pts[0]![1], [1, 1], 'FD', true);
      }
    };
    draw(ANTERIOR_SHAPES, 0);
    draw(POSTERIOR_SHAPES, POSTERIOR_OFFSET_X);
    d.setFontSize(8);
    d.setTextColor(...MUTED);
    d.setFont('helvetica', 'bold');
    d.text(SIDE_LABELS.anterior.viewerLeft, x0 + 6 * scale, y0 + 20 * scale);
    d.text(SIDE_LABELS.anterior.viewerRight, x0 + (FIGURE_WIDTH - 12) * scale, y0 + 20 * scale);
    d.text(SIDE_LABELS.posterior.viewerLeft, x0 + (POSTERIOR_OFFSET_X + 6) * scale, y0 + 20 * scale);
    d.text(SIDE_LABELS.posterior.viewerRight, x0 + (POSTERIOR_OFFSET_X + FIGURE_WIDTH - 12) * scale, y0 + 20 * scale);
    d.text('Anterior', x0 + (FIGURE_WIDTH / 2) * scale, y0 + 403 * scale, { align: 'center' });
    d.text('Posterior', x0 + (POSTERIOR_OFFSET_X + FIGURE_WIDTH / 2) * scale, y0 + 403 * scale, { align: 'center' });
    d.setFont('helvetica', 'normal');
    this.y = y0 + height + 4;
    // Legend
    let lx = this.margin;
    d.setFontSize(7.5);
    for (const def of Object.values(BURN_DEPTH_MAP)) {
      const label = pdfText(`${def.label}${def.tbsaEligible ? '' : ' (not in TBSA)'}`);
      const w = d.getTextWidth(label) + 8;
      if (lx + w > this.pageWidth - this.margin) {
        lx = this.margin;
        this.y += 5;
      }
      d.setFillColor(...hexToRgb(def.color));
      d.rect(lx, this.y - 2.5, 3, 3, 'F');
      d.setTextColor(...TEXT);
      d.text(label, lx + 4.5, this.y);
      lx += w;
    }
    this.y += 4;
    d.setFontSize(7);
    d.setTextColor(...MUTED);
    d.text("R / L = patient's right / left. Colour shows the most severe depth recorded in each region. Schematic 2D chart; not to scale.", this.margin, this.y + 1);
    this.y += 5;
    d.setTextColor(...TEXT);
  }

  /** Footer with disclaimer and "Page X of Y" on every page. Call once, last. */
  finalize(): jsPDF {
    const d = this.doc;
    const total = d.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      d.setPage(i);
      d.setDrawColor(220, 227, 236);
      d.setLineWidth(0.2);
      d.line(this.margin, this.pageHeight - 17, this.pageWidth - this.margin, this.pageHeight - 17);
      d.setFontSize(6.8);
      d.setTextColor(...MUTED);
      const lines = d.splitTextToSize(pdfText(CLINICAL_DISCLAIMER), this.contentWidth - 30) as string[];
      lines.forEach((l, k) => d.text(l, this.margin, this.pageHeight - 13 + k * 3));
      d.setFontSize(8);
      d.text(`Page ${i} of ${total}`, this.pageWidth - this.margin, this.pageHeight - 13, { align: 'right' });
      d.text(pdfText(`Patient ID ${this.header.patientCode}`), this.pageWidth - this.margin, this.pageHeight - 9.5, { align: 'right' });
    }
    return d;
  }
}
