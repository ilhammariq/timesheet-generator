import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType, VerticalAlign,
} from 'docx';

const FONT = 'Calibri';
const SIZE = 22; // 11pt (satuan half-point)
const COLS = [1296, 4516, 1276, 1188, 2071]; // total 10347 DXA (sama dengan tabel di file asli)
const TABLE_W = COLS.reduce((a, b) => a + b, 0);
const TEXT_W = 11906 - 2 * 1440; // lebar area tulis A4 dengan margin Normal = 9026
// Tabel dibuat lebih lebar dari area tulis dan digeser ke kiri separuh selisihnya,
// sehingga jarak kiri dan kanan tabel ke tepi kertas sama (+/- 1,4 cm). Margin halaman tetap Normal.
const TABLE_INDENT = -Math.round((TABLE_W - TEXT_W) / 2); // -661
const line = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const BORDERS = { top: line, bottom: line, left: line, right: line };

const run = (text, o = {}) => new TextRun({ text, font: FONT, size: SIZE, ...o });

function cell(text, i, o = {}) {
  return new TableCell({
    width: { size: COLS[i], type: WidthType.DXA },
    borders: BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
    children: [
      new Paragraph({
        alignment: o.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [run(text, { bold: o.bold, color: '000000' })],
      }),
    ],
  });
}

const isHoliday = (r) => /^libur$/i.test((r.task || '').trim());

/** rows = [{ date, task, start, end, remarks }] -> Blob .docx berisi tabel timesheet saja */
export async function buildTimesheetBlob(rows) {
  const header = new TableRow({
    tableHeader: true,
    children: ['Date', 'Task/Activity/Project Name/Ticket No.', 'Start Time', 'End Time', 'Remarks'].map(
      (h, i) => cell(h, i, { bold: true, center: true })
    ),
  });

  const body = rows.map((r) => {
    const o = isHoliday(r) ? { fill: 'FF0000' } : {};
    return new TableRow({
      cantSplit: true,
      children: [
        cell(r.date, 0, o),
        cell(r.task, 1, o),
        cell(r.start, 2, { ...o, center: true }),
        cell(r.end, 3, { ...o, center: true }),
        cell(r.remarks, 4, { ...o, center: true }),
      ],
    });
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      children: [
        new Table({
          width: { size: TABLE_W, type: WidthType.DXA },
          indent: { size: TABLE_INDENT, type: WidthType.DXA },
          columnWidths: COLS,
          rows: [header, ...body],
        }),
      ],
    }],
  });

  return Packer.toBlob(doc);
}