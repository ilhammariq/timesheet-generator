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

const DEFAULT_SIGNERS = [
  { name: '', date: '', sign: '' },
  { name: '', date: '', sign: '' },
  { name: '', date: '', sign: '' },
];
const signLabel = (i) => (i === 0 ? 'Prepared by' : 'Acknowledge by');

const DEFAULT_HEADER = {
  logo: '',
  title: 'TIMESHEET',
  vendor: 'PT Kobus Smart Service',
  consultant: '',
  role: 'Software Developer',
  supervisor: '',
};

const inputCls =
  'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600';
const labelCls = 'mb-1 block text-xs font-medium text-slate-600';
const ghostBtn =
  'rounded-md border border-blue-700 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-600';
const primaryBtn =
  'rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50';

export default function Home() {
  const [header, setHeader] = useState(DEFAULT_HEADER);
  const [range, setRange] = useState({ from: '', to: '', start: '', end: '', remarks: '' });
  const [rows, setRows] = useState([]);
  const [signers, setSigners] = useState(DEFAULT_SIGNERS);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Muat data tersimpan setelah halaman tampil di browser (hindari mismatch SSR)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.header) setHeader({ ...DEFAULT_HEADER, ...saved.header });
        if (saved.range) setRange(saved.range);
        if (Array.isArray(saved.rows)) setRows(saved.rows);
        if (Array.isArray(saved.signers)) {
          setSigners(DEFAULT_SIGNERS.map((d, i) => ({ ...d, ...(saved.signers[i] || {}) })));
        }
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ header, range, rows, signers }));
    } catch (e) {
      // penyimpanan penuh atau diblokir: abaikan
    }
  }, [header, range, rows, signers, loaded]);

  const setH = (k) => (e) => setHeader({ ...header, [k]: e.target.value });
  const setR = (k) => (e) => setRange({ ...range, [k]: e.target.value });
  const setRow = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const setSigner = (i, k, v) => setSigners(signers.map((s, j) => (j === i ? { ...s, [k]: v } : s)));

  // Satu tanggal untuk semua kolom tanda tangan
  const signDate = signers[0].date || '';
  const setSignDate = (v) => setSigners(signers.map((s) => ({ ...s, date: v })));

  function onSign(i) {
    return (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (!/^image\/(png|jpeg|gif|bmp)$/.test(file.type)) {
        setMsg('Tanda tangan harus berformat PNG, JPG, GIF, atau BMP.');
        return;
      }
      if (file.size > 1024 * 1024) {
        setMsg('Ukuran gambar maksimal 1 MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setSigners((list) => list.map((s, j) => (j === i ? { ...s, sign: reader.result } : s)));
        setMsg('');
      };
      reader.onerror = () => setMsg('Gagal membaca file.');
      reader.readAsDataURL(file);
    };
  }

  function onLogo(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|gif|bmp)$/.test(file.type)) {
      setMsg('Logo harus berformat PNG, JPG, GIF, atau BMP.');
      return;
    }
    if (file.size > 1024 * 1024) {
      setMsg('Ukuran logo maksimal 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setHeader((h) => ({ ...h, logo: reader.result }));
      setMsg('');
    };
    reader.onerror = () => setMsg('Gagal membaca file logo.');
    reader.readAsDataURL(file);
  }

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
      const blob = await buildTimesheetBlob(rows, header, signers);
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
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Bagian atas dokumen</h2>
          <div className="flex flex-wrap items-start gap-4">
            <div className="w-40">
              <span className={labelCls}>Logo</span>
              <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50">
                {header.logo
                  ? <img src={header.logo} alt="Logo" className="max-h-full max-w-full object-contain p-1" />
                  : <span className="text-xs text-slate-400">Belum ada logo</span>}
              </div>
              <div className="mt-2 flex gap-2">
                <label className={ghostBtn + ' cursor-pointer'}>
                  Pilih
                  <input type="file" accept="image/png,image/jpeg,image/gif,image/bmp" className="sr-only" onChange={onLogo} />
                </label>
                {header.logo && (
                  <button className="text-sm text-slate-500 hover:text-red-600" onClick={() => setHeader({ ...header, logo: '' })}>
                    Hapus
                  </button>
                )}
              </div>
            </div>

            <div className="grid min-w-[280px] flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className={labelCls}>Judul</span><input className={inputCls} value={header.title} onChange={setH('title')} /></label>
              <label><span className={labelCls}>Vendor Name</span><input className={inputCls} value={header.vendor} onChange={setH('vendor')} /></label>
              <label><span className={labelCls}>Consultant Role</span><input className={inputCls} value={header.role} onChange={setH('role')} /></label>
              <label><span className={labelCls}>Consultant Name</span><input className={inputCls} value={header.consultant} onChange={setH('consultant')} /></label>
              <label><span className={labelCls}>Supervisor Name</span><input className={inputCls} value={header.supervisor} onChange={setH('supervisor')} /></label>
            </div>
          </div>
        </section>

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

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Bagian bawah dokumen (tanda tangan)</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {signers.map((s, i) => (
              <div key={i} className="space-y-2 rounded-md border border-slate-200 p-3">
                <label><span className={labelCls}>{signLabel(i)}</span><input className={inputCls} value={s.name} onChange={(e) => setSigner(i, 'name', e.target.value)} /></label>
                {i === 0 && (
                  <div>
                    <span className={labelCls}>Tanda tangan</span>
                    <div className="flex h-16 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50">
                      {s.sign
                        ? <img src={s.sign} alt="Tanda tangan" className="max-h-full max-w-full object-contain p-1" />
                        : <span className="text-xs text-slate-400">Belum ada gambar</span>}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <label className={ghostBtn + ' cursor-pointer'}>
                        Pilih
                        <input type="file" accept="image/png,image/jpeg,image/gif,image/bmp" className="sr-only" onChange={onSign(i)} />
                      </label>
                      {s.sign && (
                        <button className="text-sm text-slate-500 hover:text-red-600" onClick={() => setSigner(i, 'sign', '')}>Hapus</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <label className="mt-3 block w-48">
            <span className={labelCls}>Tanggal</span>
            <input type="date" className={inputCls} value={signDate} onChange={(e) => setSignDate(e.target.value)} />
          </label>
        </section>

        <div className="flex items-center gap-3">
          <button className={primaryBtn} onClick={onExport} disabled={busy}>{busy ? 'Membuat file…' : 'Export ke Word (.docx)'}</button>
          <span className="text-sm text-slate-600" role="status">{msg}</span>
        </div>
      </main>
    </>
  );
}