/**
 * ===================================================================
 * schedule.js — Aturan jadwal kelas & logika pembuatan jadwal otomatis
 * ===================================================================
 * SCHEDULE_RULES adalah business logic (aturan hari/jam/lokasi tiap grup),
 * karena itu dipindahkan keluar dari Code.gs ke file terpisah ini agar
 * mudah dikelola tanpa membebani Apps Script.
 *
 * Dipakai oleh business-logic.js saat status pembayaran peserta berubah
 * menjadi LUNAS (lihat BizLogic.generateScheduleForPeserta).
 */
const SCHEDULE_RULES = {
  'Grup A': { location: 'Kenari Waterpark Bontang', sessions: [
    { day: 1, startTime: '16:00', endTime: '17:45' },
    { day: 3, startTime: '16:00', endTime: '17:45' },
    { day: 6, startTime: '16:00', endTime: '17:45' }
  ]},
  'Grup B': { location: 'Kenari Waterpark Bontang', sessions: [
    { day: 2, startTime: '16:00', endTime: '17:45' },
    { day: 4, startTime: '16:00', endTime: '17:45' },
    { day: 6, startTime: '07:00', endTime: '08:45' }
  ]},
  'Grup C': { location: 'Grand Equator Hotel Bontang', sessions: [
    { day: 6, startTime: '16:00', endTime: '17:45' },
    { day: 0, startTime: '08:00', endTime: '09:30' }
  ]}
};

/**
 * Hasilkan baris Jadwal kelas BARU (belum ada) untuk seorang peserta,
 * berdasarkan SCHEDULE_RULES & periode pendaftarannya (Tanggal_Mulai s.d
 * Tanggal_Akhir). Murni fungsi kalkulasi — TIDAK menulis apa pun; hasilnya
 * dikirim ke backend lewat CrudApi.create('jadwal', { items: [...] }).
 *
 * @param {object} peserta            record Peserta dari Store (data lokal)
 * @param {object[]} existingJadwal   seluruh Jadwal dari Store (data lokal)
 * @param {string} idPelatih          id pelatih default untuk baris jadwal baru
 * @returns {object[]} baris Jadwal baru (nama kolom sudah sesuai header sheet)
 */
function buildScheduleForPeserta(peserta, existingJadwal, idPelatih) {
  if (!peserta || !peserta.Kelas || !peserta.Tanggal_Mulai || !peserta.Tanggal_Akhir) return [];
  const rules = SCHEDULE_RULES[peserta.Kelas];
  if (!rules) return [];
  const start = new Date(peserta.Tanggal_Mulai), end = new Date(peserta.Tanggal_Akhir);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];

  const existingKeys = new Set(
    existingJadwal
      .filter(j => j.Kelas === peserta.Kelas && !j.Id_Peserta)
      .map(j => BizUtil.formatDate(j.Tanggal) + '|' + j.Pukul)
  );

  const cursor = new Date(start.getTime()); cursor.setHours(0, 0, 0, 0);
  const endNorm = new Date(end.getTime()); endNorm.setHours(23, 59, 59, 999);
  const newRows = [];

  while (cursor.getTime() <= endNorm.getTime()) {
    const dow = cursor.getDay();
    rules.sessions.filter(s => s.day === dow).forEach(s => {
      const pukul = s.startTime + ' - ' + s.endTime;
      const key = BizUtil.formatDate(cursor) + '|' + pukul;
      if (!existingKeys.has(key)) {
        newRows.push({
          Id_Jadwal: BizUtil.genId('JDW'),
          Id_Pelatih: idPelatih,
          Id_Peserta: '',
          Tanggal: BizUtil.formatDate(new Date(cursor.getTime())),
          Pukul: pukul,
          Lokasi: rules.location,
          Kelas: peserta.Kelas,
          Status: 'Pending'
        });
        existingKeys.add(key);
      }
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return newRows;
}
