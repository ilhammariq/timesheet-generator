import { useState, useEffect } from 'react';
import Head from 'next/head';
import { buildTimesheetBlob } from '../lib/exportTimesheet';

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const isHoliday = (t) => /^libur$/i.test((t || '').trim());

function makeRows(from, to, start, end, remarks) {
  const rows = [];
  const d = new Date(from + 'T00:00:00');
  const last = new Date(to + 'T00:00:00');
  while (d <= last) {
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    rows.push(weekend
      ? { date: fmt(d), task: 'Libur', start: '', end: '', remarks: '' }
      : { date: fmt(d), task: '', start, end, remarks });
    d.setDate(d.getDate() + 1);
  }
  return rows;
}

const STORAGE_KEY = 'timesheet-data-v1';

const inputCls =
  'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600';
const labelCls = 'mb-1 block text-xs font-medium text-slate-600';
const ghostBtn =
  'rounded-md border border-blue-700 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-600';
const primaryBtn =
  'rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50';

export default function Home() {
  const [range, setRange] = useState({ from: '', to: '', start: '', end: '', remarks: '' });
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Muat data tersimpan setelah halaman tampil di browser (hindari mismatch SSR)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.range) setRange(saved.range);
        if (Array.isArray(saved.rows)) setRows(saved.rows);
      }
    } catch (e) {
      // data rusak atau localStorage tidak tersedia: pakai nilai awal
    }
    setLoaded(true);
  }, []);

  // Simpan otomatis setiap ada perubahan (setelah data awal selesai dimuat)
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ range, rows }));
    } catch (e) {
      // penyimpanan penuh atau diblokir: abaikan
    }
  }, [range, rows, loaded]);

  const setR = (k) => (e) => setRange({ ...range, [k]: e.target.value });
  const setRow = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  function onGenerate() {
    if (!range.from || !range.to) {
      setMsg('Isi tanggal awal dan akhir dulu.');
      return;
    }
    setMsg('');
    setRows(makeRows(range.from, range.to, range.start, range.end, range.remarks));
  }

  async function onExport() {
    if (rows.length === 0) {
      setMsg('Tabel masih kosong.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const blob = await buildTimesheetBlob(rows);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Timesheet.docx';
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg('File sudah diunduh.');
    } catch (e) {
      setMsg('Gagal membuat file: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head><title>Timesheet Generator</title></Head>
      <main className="mx-auto max-w-4xl space-y-4 p-4 text-slate-900 sm:p-6">
        <h1 className="text-xl font-semibold">Timesheet ke Word</h1>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label><span className={labelCls}>Dari tanggal</span><input type="date" className={inputCls} value={range.from} onChange={setR('from')} /></label>
            <label><span className={labelCls}>Sampai tanggal</span><input type="date" className={inputCls} value={range.to} onChange={setR('to')} /></label>
            <label className="w-24"><span className={labelCls}>Jam mulai</span><input className={inputCls} value={range.start} onChange={setR('start')} /></label>
            <label className="w-24"><span className={labelCls}>Jam selesai</span><input className={inputCls} value={range.end} onChange={setR('end')} /></label>
            <label className="w-24"><span className={labelCls}>Remarks</span><input className={inputCls} value={range.remarks} onChange={setR('remarks')} /></label>
            <button className={ghostBtn} onClick={onGenerate}>
              Buat baris tanggal
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Sabtu dan Minggu otomatis diisi Libur. Untuk libur nasional, ketik &quot;Libur&quot; di kolom Task.
          </p>
        </section>

        <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-xs text-slate-600">
                <th className="w-28 border border-slate-300 p-1.5">Date</th>
                <th className="border border-slate-300 p-1.5">Task/Activity/Project Name/Ticket No.</th>
                <th className="w-20 border border-slate-300 p-1.5">Start</th>
                <th className="w-20 border border-slate-300 p-1.5">End</th>
                <th className="w-24 border border-slate-300 p-1.5">Remarks</th>
                <th className="w-8 border border-slate-300" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="border border-slate-300 p-4 text-center text-slate-500">
                    Belum ada baris. Isi tanggal lalu klik &quot;Buat baris tanggal&quot;, atau klik &quot;Tambah baris&quot;.
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={i} className={isHoliday(r.task) ? 'bg-red-100' : ''}>
                  {['date', 'task', 'start', 'end', 'remarks'].map((k) => (
                    <td key={k} className="border border-slate-300 p-0">
                      <input className="w-full bg-transparent px-2 py-1 focus:bg-blue-50 focus:outline-none"
                        value={r[k]} onChange={(e) => setRow(i, k, e.target.value)} />
                    </td>
                  ))}
                  <td className="border border-slate-300 text-center">
                    <button aria-label="Hapus baris" className="px-2 text-slate-500 hover:text-red-600"
                      onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className={ghostBtn + ' mt-3'} onClick={() => setRows([...rows, { date: '', task: '', start: '', end: '', remarks: '' }])}>
            Tambah baris
          </button>
        </section>

        <div className="flex items-center gap-3">
          <button className={primaryBtn} onClick={onExport} disabled={busy}>{busy ? 'Membuat file…' : 'Export ke Word (.docx)'}</button>
          <span className="text-sm text-slate-600" role="status">{msg}</span>
        </div>
      </main>
    </>
  );
}