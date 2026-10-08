import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  WidthType, AlignmentType, BorderStyle, ShadingType, VerticalAlign, HeightRule,
} from 'docx';

const FONT = 'Calibri';
const SIZE = 22; // 11pt (satuan half-point)
const COLS = [1296, 4516, 1276, 1188, 2071]; // total 10347 DXA
const TABLE_W = COLS.reduce((a, b) => a + b, 0);
const TEXT_W = 11906 - 2 * 1440; // 9026
const TABLE_INDENT = -Math.round((TABLE_W - TEXT_W) / 2); // -661
const line = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const BORDERS = { top: line, bottom: line, left: line, right: line };
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: none, bottom: none, left: none, right: none };

// Kolom blok info atas: label | nilai | label | nilai (total = TABLE_W)
const INFO_COLS = [1750, 3300, 1900, 3397];

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

/** Ambil ukuran asli gambar dari data URL */
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('Logo tidak bisa dibaca'));
    img.src = dataUrl;
  });
}

function dataUrlToBytes(dataUrl) {
  const bin = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function imageType(dataUrl) {
  const mime = (dataUrl.match(/^data:image\/([a-z+]+);/i) || [])[1] || 'png';
  if (mime === 'jpeg' || mime === 'jpg') return 'jpg';
  if (mime === 'gif' || mime === 'bmp') return mime;
  return 'png';
}

async function makeImageRun(dataUrl, maxW, maxH) {
  const { w, h } = await loadImage(dataUrl);
  const scale = Math.min(maxW / w, maxH / h, 1);
  return new ImageRun({
    type: imageType(dataUrl),
    data: dataUrlToBytes(dataUrl),
    transformation: { width: Math.round(w * scale), height: Math.round(h * scale) },
  });
}

async function logoParagraph(dataUrl) {
  if (!dataUrl) return null;
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    children: [await makeImageRun(dataUrl, 180, 75)],
  });
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// "2026-09-25" -> "Date: 25 September 2026"
function dateText(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return 'Date: ';
  return `Date: ${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

const SIGN_W = TABLE_W; // selebar tabel timesheet (kiri-kanan sama)

async function signatureTable(signers) {
  const n = signers.length;
  const base = Math.floor(SIGN_W / n);
  const widths = signers.map((_, i) => (i === n - 1 ? SIGN_W - base * (n - 1) : base));

  // keepNext: baris menempel ke baris berikutnya, jadi seluruh tabel pindah
  // bersama ke halaman 2 kalau tidak muat di halaman 1 (baris terakhir tidak perlu).
  const textCell = (text, i, keepNext = true) =>
    new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      borders: BORDERS,
      verticalAlign: VerticalAlign.TOP,
      children: [new Paragraph({ keepNext, children: [run(text, { color: '000000' })] })],
    });

  const signCells = [];
  for (let i = 0; i < n; i++) {
    const img = i === 0 && signers[i].sign ? await makeImageRun(signers[i].sign, 170, 80) : null;
    signCells.push(
      new TableCell({
        width: { size: widths[i], type: WidthType.DXA },
        borders: BORDERS,
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          keepNext: true,
          alignment: AlignmentType.CENTER,
          children: img ? [img] : [],
        })],
      })
    );
  }

  const mk = (cells, extra = {}) => new TableRow({ cantSplit: true, children: cells, ...extra });

  return new Table({
    width: { size: SIGN_W, type: WidthType.DXA },
    indent: { size: TABLE_INDENT, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      mk(signers.map((s, i) => textCell(i === 0 ? 'Prepared by' : 'Acknowledge by', i))),
      mk(signers.map((s, i) => textCell(s.name || '', i))),
      mk(signCells, { height: { value: 1700, rule: HeightRule.ATLEAST } }),
      mk(signers.map((s, i) => textCell(dateText(s.date), i, false))),
    ],
  });
}

function infoCell(text, i, bold) {
  return new TableCell({
    width: { size: INFO_COLS[i], type: WidthType.DXA },
    borders: NO_BORDERS,
    verticalAlign: VerticalAlign.TOP,
    children: [
      new Paragraph({
        spacing: { after: 120 },
        children: [run(text, { bold, color: '000000' })],
      }),
    ],
  });
}

function infoTable(h) {
  const pairs = [
    [['Vendor Name', h.vendor], ['Consultant Role', h.role]],
    [['Consultant Name', h.consultant], ['Supervisor Name', h.supervisor]],
  ];
  return new Table({
    width: { size: TABLE_W, type: WidthType.DXA },
    indent: { size: TABLE_INDENT, type: WidthType.DXA },
    columnWidths: INFO_COLS,
    rows: pairs.map(([l, r]) =>
      new TableRow({
        cantSplit: true,
        children: [
          infoCell(l[0], 0, true),
          infoCell(': ' + (l[1] || ''), 1, false),
          infoCell(r[0], 2, true),
          infoCell(': ' + (r[1] || ''), 3, false),
        ],
      })
    ),
  });
}

/**
 * rows   = [{ date, task, start, end, remarks }]
 * header = { logo (data URL), title, vendor, role, consultant, supervisor }
 * signers = [{ name, date (YYYY-MM-DD), sign (data URL) }]  (kosong = tanpa bagian bawah)
 * -> Blob .docx
 */
export async function buildTimesheetBlob(rows, header = {}, signers = []) {
  const tableHeader = new TableRow({
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

  const children = [];

  const logo = await logoParagraph(header.logo);
  if (logo) children.push(logo);

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 360 },
      children: [run(header.title || 'TIMESHEET', { bold: true, size: 28, color: '000000' })],
    }),
    infoTable(header),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
    new Table({
      width: { size: TABLE_W, type: WidthType.DXA },
      indent: { size: TABLE_INDENT, type: WidthType.DXA },
      columnWidths: COLS,
      rows: [tableHeader, ...body],
    })
  );

  if (signers.length > 0) {
    children.push(
      new Paragraph({ keepNext: true, spacing: { before: 240, after: 120 }, children: [] }),
      await signatureTable(signers)
    );
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      children,
    }],
  });

  return Packer.toBlob(doc);
}