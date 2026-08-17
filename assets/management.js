export function createManagementModule(ctx) {
  const esc = ctx.escapeHtml;
  const api = () => ctx.getApi();
  const token = () => ctx.getToken();
  const page = () => document.getElementById('pageContent');
  const MIN_STATS_SAMPLE = Math.max(2, Number(ctx.minimumStatsSample || 10));

  const state = {
    data: null,
    loading: null,
    preset: 'month',
    basis: 'DAFTAR',
    start: '',
    end: '',
    lastLoadedKey: '',
    performanceTab: 'pharmacy'
  };

  function localDateKey(date = new Date()) {
    const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  }
  function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
  function startOfQuarter(d) { return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1); }
  function startOfSemester(d) { return new Date(d.getFullYear(), d.getMonth() < 6 ? 0 : 6, 1); }
  function applyPreset(preset) {
    state.preset = preset;
    const now = new Date();
    let start = now;
    if (preset === '7d') start = addDays(now, -6);
    else if (preset === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (preset === 'quarter') start = startOfQuarter(now);
    else if (preset === 'semester') start = startOfSemester(now);
    else if (preset === 'year') start = new Date(now.getFullYear(), 0, 1);
    else if (preset === 'custom') return;
    state.start = localDateKey(start);
    state.end = localDateKey(now);
  }
  applyPreset('month');

  const n = value => Number(value || 0).toLocaleString('id-ID');
  const pct = value => `${(Number(value || 0) * 100).toFixed(1)}%`;
  const minutes = value => `${n(value)} menit`;
  function fmtDate(value) {
    if (!value) return '—';
    const [y, m, d] = String(value).slice(0, 10).split('-');
    return y && m && d ? `${d}/${m}/${y}` : String(value);
  }
  function periodLabel() { return state.start === state.end ? fmtDate(state.start) : `${fmtDate(state.start)}–${fmtDate(state.end)}`; }

  function hero(title, subtitle, eyebrow = 'MANAJEMEN') {
    return `<section class="hero compact management-hero"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="hero-actions"><button id="mgmtRefresh" class="secondary-btn">↻ Segarkan</button></div></section>`;
  }
  function metric(label, value, note = '', tone = '') {
    return `<div class="kpi-card ${tone}"><span>${esc(label)}</span><strong>${esc(String(value))}</strong>${note ? `<small>${esc(note)}</small>` : ''}</div>`;
  }
  function empty(title, text = '') {
    return `<div class="empty-state mgmt-empty"><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}</div>`;
  }

  function filterBar() {
    const presets = [['today','Hari Ini'],['7d','7 Hari'],['month','Bulan Ini'],['quarter','Triwulan'],['semester','Semester'],['year','Tahun'],['custom','Kustom']];
    return `<div class="mgmt-filter-card">
      <div class="mgmt-presets">${presets.map(([key,label]) => `<button data-period="${key}" class="${state.preset === key ? 'active' : ''}">${label}</button>`).join('')}</div>
      <div class="mgmt-custom">
        <label>Awal<input id="mgmtStart" type="date" value="${esc(state.start)}"></label>
        <label>Akhir<input id="mgmtEnd" type="date" value="${esc(state.end)}"></label>
        <label>Hitung berdasarkan<select id="mgmtBasis"><option value="DAFTAR" ${state.basis === 'DAFTAR' ? 'selected' : ''}>Tanggal Pendaftaran</option><option value="SELESAI" ${state.basis === 'SELESAI' ? 'selected' : ''}>Tanggal Pengantaran Selesai</option></select></label>
        <button id="mgmtApply" class="primary-btn">Tampilkan</button>
      </div>
      <div class="mgmt-period-caption">Periode <strong>${esc(periodLabel())}</strong></div>
    </div>`;
  }

  function bindFilter(onReload) {
    document.querySelectorAll('[data-period]').forEach(button => {
      button.onclick = () => {
        const preset = button.dataset.period;
        if (preset === 'custom') state.preset = 'custom'; else applyPreset(preset);
        document.querySelectorAll('[data-period]').forEach(x => x.classList.toggle('active', x.dataset.period === state.preset));
        const start = document.getElementById('mgmtStart');
        const end = document.getElementById('mgmtEnd');
        if (start) start.value = state.start;
        if (end) end.value = state.end;
        if (preset !== 'custom') onReload();
      };
    });
    const apply = document.getElementById('mgmtApply');
    if (apply) apply.onclick = () => {
      state.preset = 'custom';
      state.start = document.getElementById('mgmtStart').value;
      state.end = document.getElementById('mgmtEnd').value;
      state.basis = document.getElementById('mgmtBasis').value;
      onReload();
    };
    const basis = document.getElementById('mgmtBasis');
    if (basis) basis.onchange = () => { state.basis = basis.value; };
  }

  async function ensureData(force = false) {
    const key = [state.start, state.end, state.basis].join('|');
    if (state.data && !force && state.lastLoadedKey === key) return state.data;
    if (state.loading && !force) return state.loading;
    state.loading = (async () => {
      const response = await api().managementData(token(), state.start, state.end, state.basis);
      state.data = response.data?.dashboard || {};
      state.lastLoadedKey = key;
      return state.data;
    })();
    try { return await state.loading; } finally { state.loading = null; }
  }

  async function refreshCurrent(draw) {
    const button = document.getElementById('mgmtRefresh');
    if (button) { button.disabled = true; button.textContent = 'Memuat…'; }
    try {
      await ensureData(true);
      draw();
      ctx.showToast('Data Manajemen diperbarui.', 'success');
    } catch (error) { ctx.showToast(error.message, 'error'); }
    finally { if (button) { button.disabled = false; button.textContent = '↻ Segarkan'; } }
  }

  function timeInsight(value, label, description = '') {
    const x = value || {};
    const sample = Number(x.sample || 0);
    if (!sample) return `<article class="time-insight"><span>${esc(label)}</span><strong>Belum ada data</strong>${description ? `<small>${esc(description)}</small>` : ''}</article>`;
    if (sample < MIN_STATS_SAMPLE) {
      return `<article class="time-insight"><span>${esc(label)}</span><div class="time-insight-grid stats-three"><div><small>Mean (rata-rata)</small><strong>${minutes(x.average)}</strong></div></div><small>${n(sample)} pengantaran dianalisis. Data belum cukup untuk analisis Median dan P90${description ? ` • ${esc(description)}` : ''}.</small></article>`;
    }
    return `<article class="time-insight"><span>${esc(label)}</span><div class="time-insight-grid stats-three"><div><small>Mean (rata-rata)</small><strong>${minutes(x.average)}</strong></div><div><small>Median (nilai tengah)</small><strong>${minutes(x.median)}</strong></div><div><small>P90 (90% selesai dalam)</small><strong>≤ ${minutes(x.p90)}</strong></div></div><small>${n(sample)} pengantaran dianalisis${description ? ` • ${esc(description)}` : ''}.</small></article>`;
  }

  function incidentTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return esc(String(value));
    return d.toLocaleString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace('.',':');
  }

  function activeIncidentPanel(rows = []) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return '';
    return `<div class="content-card active-incident-panel"><div class="mgmt-card-head"><div><h3>Kendala Aktif</h3><p>Informasi operasional untuk tindak lanjut PJ/Koordinator.</p></div></div><div class="active-incident-grid">${list.map(item => {
      const areas = Array.isArray(item.affectedAreas) && item.affectedAreas.length ? item.affectedAreas.join(', ') : '—';
      return `<article class="incident-detail-card"><div class="incident-detail-top"><strong>${esc(item.courier || 'Kurir')}</strong><span>${esc(item.delayEstimate || 'Perkiraan belum diisi')}</span></div><h4>${esc(item.type || 'Kendala operasional')}</h4>${item.detail ? `<p>${esc(item.detail)}</p>` : ''}<dl><div><dt>Mulai</dt><dd>${incidentTime(item.startedAt)}</dd></div><div><dt>Paket terdampak</dt><dd>${n(item.affectedCount || 0)}</dd></div><div><dt>Wilayah terdampak</dt><dd>${esc(areas)}</dd></div></dl></article>`;
    }).join('')}</div></div>`;
  }

  function lineChart(rows) {
    if (!rows?.length) return empty('Belum ada tren', 'Belum ada aktivitas pada periode yang dipilih.');
    const W = 760, H = 250, pad = 34;
    const max = Math.max(1, ...rows.flatMap(r => [Number(r.total||0), Number(r.delivered||0), Number(r.failed||0)]));
    const points = key => rows.map((r,i) => {
      const x = rows.length === 1 ? W/2 : pad + i * (W-pad*2)/(rows.length-1);
      const y = H-pad - (Number(r[key]||0)/max)*(H-pad*2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<div class="svg-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tren pengantaran"><line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" class="axis"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H-pad}" class="axis"/><polyline points="${points('total')}" class="line total"/><polyline points="${points('delivered')}" class="line delivered"/><polyline points="${points('failed')}" class="line failed"/></svg><div class="chart-legend"><span class="total">Pendaftaran</span><span class="delivered">Terkirim</span><span class="failed">Gagal Antar</span></div></div>`;
  }

  function barRanking(rows, limit = 10) {
    const list = (rows || []).slice(0, limit);
    if (!list.length) return empty('Belum ada data wilayah');
    const max = Math.max(1, ...list.map(x => Number(x.count || 0)));
    return `<div class="bar-ranking">${list.map(x => `<div><div class="bar-ranking-label"><span>${esc(x.name || 'Tidak diketahui')}</span><b>${n(x.count)}</b></div><div class="bar-track"><i style="width:${Math.max(2, Number(x.count||0)/max*100)}%"></i></div></div>`).join('')}</div>`;
  }

  function rankingTable(rows, label) {
    if (!rows?.length) return empty('Belum ada data');
    return `<div class="table-scroll"><table class="data-table compact-table"><thead><tr><th>${esc(label)}</th><th>Jumlah</th></tr></thead><tbody>${rows.slice(0,30).map(x => `<tr><td>${esc(x.name || 'Tidak diketahui')}</td><td><b>${n(x.count)}</b></td></tr>`).join('')}</tbody></table></div>`;
  }

  function verificationPanel(v = {}) {
    if (!Number(v.eligible || 0)) return empty('Belum ada penerimaan yang dapat dianalisis');
    return `<div class="verification-clean"><div><span>Penerimaan terverifikasi</span><strong>${pct(v.rate)}</strong><small>${n(v.verified)} dari ${n(v.eligible)} penerimaan</small></div><div class="verification-mini"><span>Kode <b>${n(v.code)}</b></span><span>Tanpa kode <b>${n(v.manual)}</b></span><span>Menunggu <b>${n(v.pending)}</b></span></div></div>`;
  }

  function deliverySummary(a = {}) {
    return `<div class="content-card mgmt-chart-card"><div class="mgmt-card-head"><div><h3>Pengantaran Ulang</h3><p>Aktivitas pengantaran tetap tercatat meskipun satu pasien memerlukan pengantaran ulang.</p></div></div><div class="report-summary-grid compact-summary"><div><span>Total Pengantaran</span><b>${n(a.total)}</b></div><div><span>Berhasil Diantar</span><b>${n(a.delivered)}</b></div><div><span>Gagal Diantar</span><b>${n(a.failed)}</b></div><div><span>Kasus Pengantaran Ulang</span><b>${n(a.retriedCases)}</b></div><div><span>Pengantaran Ulang Berhasil</span><b>${n(a.retryDelivered)}</b></div><div><span>Ambil Mandiri</span><b>${n(a.selfPickup)}</b></div></div></div>`;
  }

  async function renderHome() {
    page().innerHTML = `${hero('Ringkasan Manajemen','Gambaran layanan pengantaran obat pada periode yang dipilih.')}<section class="section">${filterBar()}<div id="mgmtHome" class="mgmt-loading">Memuat data…</div></section>`;
    bindFilter(() => loadHome(true));
    document.getElementById('mgmtRefresh').onclick = () => refreshCurrent(drawHome);
    await loadHome(false);
  }
  async function loadHome(force) {
    try { await ensureData(force); drawHome(); }
    catch (error) { document.getElementById('mgmtHome').innerHTML = `<div class="alert error">${esc(error.message)}</div>`; }
  }
  function drawHome() {
    const d = state.data || {}, k = d.kpi || {}, v = d.verification || {}, inc = d.incidentSummary || {};
    const root = document.getElementById('mgmtHome'); if (!root) return;
    root.innerHTML = `<div class="section-head mgmt-subhead"><div><h2>Key Performance Indicator (KPI)</h2><p>Indikator utama layanan pada periode ${esc(periodLabel())}.</p></div></div>
      <div class="kpi-grid mgmt-kpi-grid">${metric('Total Pendaftaran',n(k.total),'Kasus pada periode')}${metric('Terkirim',n(k.delivered),`${n(k.failed)} gagal antar`,'success-soft')}${metric('Tingkat Keberhasilan',pct(k.successRate),'Pengantaran berhasil dari pengantaran yang selesai')}${metric('Dalam Perjalanan',n(k.transit),`${n(k.ready)} siap diantar • ${n(k.waiting)} menunggu`)}${metric('Penerimaan Terverifikasi',pct(v.rate),`${n(v.verified)} dari ${n(v.eligible)} penerimaan`)}${metric('Kendala Aktif',n(inc.active),`${n(inc.total)} kendala tercatat`,'warning-soft')}</div>
      ${activeIncidentPanel(d.activeIncidents || [])}
      <div class="section-head mgmt-subhead"><div><h2>Waktu Layanan</h2><p>Durasi digunakan untuk membaca proses layanan, bukan sebagai satu-satunya ukuran kinerja petugas.</p></div></div>
      <div class="time-insight-grid">${timeInsight(d.timeStats?.total,'Total Waktu Layanan','Pendaftaran hingga obat diterima')}${timeInsight(d.timeStats?.pharmacy,'Pendaftaran hingga Siap Diantar')}${timeInsight(d.timeStats?.consolidation,'Menunggu Diambil Kurir')}${timeInsight(d.timeStats?.courier,'Durasi Penyelesaian Pengantaran')}</div>
      <div class="mgmt-dashboard-grid"><div class="content-card mgmt-chart-card"><div class="mgmt-card-head"><div><h3>Tren Harian</h3><p>Pendaftaran, terkirim, dan gagal antar.</p></div></div>${lineChart(d.daily||[])}</div><div class="content-card mgmt-chart-card"><div class="mgmt-card-head"><div><h3>Verifikasi Penerimaan</h3><p>Status verifikasi penerimaan obat.</p></div></div>${verificationPanel(v)}</div></div>
      <div class="mgmt-dashboard-grid">${deliverySummary(d.deliveryAnalytics||{})}<div class="content-card mgmt-chart-card"><div class="mgmt-card-head"><div><h3>Wilayah Pengantaran Terkirim</h3><p>Tujuan pengantaran terbanyak.</p></div></div>${barRanking(d.deliveredRegions||[],8)}</div></div>`;
  }

  async function renderPerformance() {
    page().innerHTML = `${hero('Kinerja Layanan & Petugas','Aktivitas Farmasi dan Kurir pada periode yang dipilih.','KINERJA')}<section class="section">${filterBar()}<div class="segmented-tabs performance-tabs"><button data-performance-tab="pharmacy" class="${state.performanceTab==='pharmacy'?'active':''}">Farmasi</button><button data-performance-tab="courier" class="${state.performanceTab==='courier'?'active':''}">Kurir</button></div><div id="mgmtPerformance" class="mgmt-loading">Memuat kinerja…</div></section>`;
    bindFilter(() => loadPerformance(true));
    document.querySelectorAll('[data-performance-tab]').forEach(button => button.onclick = () => { state.performanceTab = button.dataset.performanceTab; document.querySelectorAll('[data-performance-tab]').forEach(x => x.classList.toggle('active', x.dataset.performanceTab === state.performanceTab)); drawPerformance(); });
    document.getElementById('mgmtRefresh').onclick = () => refreshCurrent(drawPerformance);
    await loadPerformance(false);
  }
  async function loadPerformance(force) {
    try { await ensureData(force); drawPerformance(); }
    catch (error) { document.getElementById('mgmtPerformance').innerHTML = `<div class="alert error">${esc(error.message)}</div>`; }
  }
  function drawPerformance() {
    const root = document.getElementById('mgmtPerformance'); if (!root) return;
    const d = state.data || {};
    root.innerHTML = state.performanceTab === 'pharmacy' ? pharmacyPerformanceView(d) : courierPerformanceView(d);
  }
  function pharmacyPerformanceView(d) {
    const p = d.pharmacyPerformance || {staff:[],totals:{}};
    const rows = p.staff || [], t = p.totals || {};
    return `<div class="kpi-grid">${metric('Petugas Aktif di Periode',n(rows.length),'Memiliki aktivitas Farmasi')}${metric('Pendaftaran Ditangani',n(t.registrations))}${metric('Ditandai Siap Diantar',n(t.ready))}${metric('Verifikasi',n(t.verifications))}${metric('Tindak Lanjut',n(t.followUps))}${metric('Pengantaran Ulang Dibuat',n(t.redeliveries))}</div>
      <div class="content-card table-scroll mgmt-table-card"><div class="mgmt-card-head"><div><h3>Aktivitas Petugas Farmasi</h3><p>Aktivitas dihitung berdasarkan petugas yang benar-benar melakukan setiap tindakan.</p></div></div>${rows.length ? `<table class="data-table mgmt-table"><thead><tr><th>Petugas Farmasi</th><th>Pendaftaran</th><th>Siap Diantar</th><th>Verifikasi</th><th>Tindak Lanjut</th><th>Pengantaran Ulang</th></tr></thead><tbody>${rows.map(x => `<tr><td><strong>${esc(x.name)}</strong></td><td>${n(x.registrations)}</td><td>${n(x.ready)}</td><td>${n(x.verifications)}</td><td>${n(x.followUps)}</td><td>${n(x.redeliveries)}</td></tr>`).join('')}</tbody></table>` : empty('Belum ada aktivitas Farmasi pada periode ini.')}</div>
      <div class="section-head mgmt-subhead"><div><h2>Waktu Proses Farmasi</h2><p>Indikator proses keseluruhan, bukan peringkat kecepatan petugas.</p></div></div><div class="time-insight-grid single-row">${timeInsight(d.timeStats?.pharmacy,'Pendaftaran hingga Siap Diantar')}</div>`;
  }
  function courierPerformanceView(d) {
    const rows = d.couriers || [], inc = d.incidentSummary || {};
    return `<div class="kpi-grid">${metric('Kurir Aktif di Periode',n(rows.length),'Memiliki aktivitas pengantaran')}${metric('Pengantaran Selesai',n(Number(d.kpi?.delivered||0)+Number(d.kpi?.failed||0)),`${n(d.kpi?.delivered)} terkirim`)}${metric('Gagal Antar',n(d.kpi?.failed||0))}${metric('Kendala',n(inc.total),`${n(inc.active)} masih aktif`)}</div>
      <div class="content-card table-scroll mgmt-table-card"><div class="mgmt-card-head"><div><h3>Kinerja Kurir</h3><p>Durasi dipengaruhi rute, jarak, lalu lintas, konsolidasi paket, Pending, dan keberadaan penerima.</p></div></div>${rows.length ? `<table class="data-table mgmt-table"><thead><tr><th>Kurir</th><th>Tugas Selesai</th><th>Terkirim</th><th>Gagal Antar</th><th>Tingkat Keberhasilan</th><th>Pending</th><th>Kendala</th><th>Durasi Penyelesaian</th></tr></thead><tbody>${rows.map(x => `<tr><td><strong>${esc(x.name)}</strong><small class="table-subtext">${esc(x.topRegion||'')}</small></td><td>${n(Number(x.delivered||0)+Number(x.failed||0))}</td><td>${n(x.delivered)}</td><td>${n(x.failed)}</td><td><strong>${pct(x.successRate)}</strong></td><td>${n(x.pendingDeliveries||0)}</td><td>${n(x.incidents)}</td><td>${performanceDurationCell(x.timeStats)}</td></tr>`).join('')}</tbody></table>` : empty('Belum ada aktivitas Kurir pada periode ini.')}</div>`;
  }
  function performanceDurationCell(stats = {}) {
    const sample = Number(stats.sample || 0);
    if (!sample) return '—';
    if (sample < MIN_STATS_SAMPLE) return `<strong>Mean ${minutes(stats.average)}</strong><small class="table-subtext">${n(sample)} pengantaran • Median/P90 belum cukup data</small>`;
    return `<strong>Mean ${minutes(stats.average)}</strong><small class="table-subtext">Median ${minutes(stats.median)} • P90 ≤ ${minutes(stats.p90)}</small>`;
  }

  async function renderAreas() {
    page().innerHTML = `${hero('Wilayah Pengantaran','Sebaran pendaftaran, pengantaran terkirim, dan alasan gagal berdasarkan wilayah.','WILAYAH')}<section class="section">${filterBar()}<div id="mgmtAreas" class="mgmt-loading">Memuat wilayah…</div></section>`;
    bindFilter(() => loadAreas(true));
    document.getElementById('mgmtRefresh').onclick = () => refreshCurrent(drawAreas);
    await loadAreas(false);
  }
  async function loadAreas(force) { try { await ensureData(force); drawAreas(); } catch (error) { document.getElementById('mgmtAreas').innerHTML = `<div class="alert error">${esc(error.message)}</div>`; } }
  function drawAreas() {
    const d = state.data || {}, root = document.getElementById('mgmtAreas'); if (!root) return;
    root.innerHTML = `<div class="mgmt-dashboard-grid"><div class="content-card mgmt-chart-card"><div class="mgmt-card-head"><div><h3>Wilayah Pendaftaran</h3><p>Asal pendaftaran terbanyak.</p></div></div>${barRanking(d.registrationRegions||[],12)}</div><div class="content-card mgmt-chart-card"><div class="mgmt-card-head"><div><h3>Wilayah Terkirim</h3><p>Tujuan pengantaran yang selesai.</p></div></div>${barRanking(d.deliveredRegions||[],12)}</div></div><div class="mgmt-dashboard-grid"><div class="content-card mgmt-chart-card"><div class="mgmt-card-head"><div><h3>Kecamatan</h3></div></div>${rankingTable(d.districts||[],'Kecamatan')}</div><div class="content-card mgmt-chart-card"><div class="mgmt-card-head"><div><h3>Alasan Gagal Antar</h3></div></div>${rankingTable(d.deliveryAnalytics?.failureReasons?.length ? d.deliveryAnalytics.failureReasons : d.failureReasons||[],'Alasan')}</div></div>`;
  }

  async function renderReports() {
    page().innerHTML = `${hero('Laporan','Siapkan ringkasan periode untuk dicetak atau disimpan sebagai PDF.','LAPORAN')}<section class="section">${filterBar()}<div id="mgmtReports" class="mgmt-loading">Menyiapkan laporan…</div></section>`;
    bindFilter(() => loadReports(true));
    document.getElementById('mgmtRefresh').onclick = () => refreshCurrent(drawReports);
    await loadReports(false);
  }
  async function loadReports(force) { try { await ensureData(force); drawReports(); } catch (error) { document.getElementById('mgmtReports').innerHTML = `<div class="alert error">${esc(error.message)}</div>`; } }
  function drawReports() {
    const root = document.getElementById('mgmtReports'); if (!root) return;
    root.innerHTML = `<div class="report-actions"><button id="printManagementReport" class="primary-btn">Cetak / Simpan PDF</button></div>${reportPreview(state.data||{})}`;
    document.getElementById('printManagementReport').onclick = () => printReport(state.data || {});
  }

  function reportPreview(d) {
    const k = d.kpi || {}, v = d.verification || {}, inc = d.incidentSummary || {}, pharm = d.pharmacyPerformance || {staff:[]};
    return `<div class="content-card mgmt-report-preview"><div class="report-preview-head"><img src="./icons/logo-rsud.png" alt="Logo RSUD"><div><strong>RSUD Provinsi Nusa Tenggara Barat</strong><h2>Laporan Layanan Pengantaran Obat Gratis</h2><p>Periode ${fmtDate(d.meta?.start)}–${fmtDate(d.meta?.end)} • Hitung berdasarkan ${esc(d.meta?.basis === 'SELESAI' ? 'Tanggal Pengantaran Selesai' : 'Tanggal Pendaftaran')}</p></div></div>
      <div class="report-section"><h3>Key Performance Indicator (KPI)</h3><div class="report-summary-grid"><div><span>Total Pendaftaran</span><b>${n(k.total)}</b></div><div><span>Terkirim</span><b>${n(k.delivered)}</b></div><div><span>Gagal Antar</span><b>${n(k.failed)}</b></div><div><span>Tingkat Keberhasilan</span><b>${pct(k.successRate)}</b></div><div><span>Penerimaan Terverifikasi</span><b>${pct(v.rate)}</b></div><div><span>Kendala</span><b>${n(inc.total)}</b></div></div></div>
      <div class="report-section"><h3>Waktu Layanan</h3>${reportTimeStats(d.timeStats || {})}</div>
      ${d.activeIncidents?.length ? `<div class="report-section"><h3>Kendala Aktif</h3>${reportIncidentTable(d.activeIncidents)}</div>` : ''}
      <div class="report-section"><h3>Kinerja Farmasi</h3>${reportPharmacyTable(pharm.staff||[])}</div>
      <div class="report-section"><h3>Kinerja Kurir</h3>${reportCourierTable(d.couriers||[])}</div>
      <div class="report-section"><h3>Pengantaran Ulang</h3>${reportDeliverySummary(d.deliveryAnalytics||{})}</div>
      <div class="report-section"><h3>Wilayah dan Gagal Antar</h3><div class="grid grid-2">${rankingTable(d.deliveredRegions||[],'Kabupaten/Kota')}${rankingTable(d.deliveryAnalytics?.failureReasons||[],'Alasan Gagal Antar')}</div></div></div>`;
  }
  function reportTimeStats(stats = {}) {
    const entries = [
      ['Total Waktu Layanan',stats.total],['Pendaftaran hingga Siap Diantar',stats.pharmacy],['Menunggu Diambil Kurir',stats.consolidation],['Durasi Penyelesaian Pengantaran',stats.courier]
    ];
    return `<div class="report-time-grid">${entries.map(([label,x]) => { const sample=Number(x?.sample||0); if(!sample) return `<div><span>${esc(label)}</span><b>Belum ada data</b></div>`; if(sample<MIN_STATS_SAMPLE) return `<div><span>${esc(label)}</span><b>Mean ${minutes(x.average)}</b><small>${n(sample)} pengantaran; Median/P90 belum cukup data</small></div>`; return `<div><span>${esc(label)}</span><b>Mean ${minutes(x.average)}</b><small>Median ${minutes(x.median)} • P90 ≤ ${minutes(x.p90)}</small></div>`; }).join('')}</div>`;
  }
  function reportIncidentTable(rows = []) {
    if (!rows.length) return '<p>Tidak ada kendala aktif.</p>';
    return `<div class="table-scroll"><table class="data-table compact-table"><thead><tr><th>Kurir</th><th>Kendala</th><th>Perkiraan</th><th>Paket</th><th>Wilayah</th></tr></thead><tbody>${rows.map(x => `<tr><td>${esc(x.courier||'—')}</td><td>${esc(x.type||'—')}${x.detail?`<br><small>${esc(x.detail)}</small>`:''}</td><td>${esc(x.delayEstimate||'—')}</td><td>${n(x.affectedCount||0)}</td><td>${esc((x.affectedAreas||[]).join(', ')||'—')}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function reportPharmacyTable(rows) {
    if (!rows.length) return '<p>Belum ada aktivitas Farmasi pada periode ini.</p>';
    return `<div class="table-scroll"><table class="data-table compact-table"><thead><tr><th>Petugas</th><th>Pendaftaran</th><th>Siap</th><th>Verifikasi</th><th>Tindak Lanjut</th><th>Pengantaran Ulang</th></tr></thead><tbody>${rows.map(x => `<tr><td>${esc(x.name)}</td><td>${n(x.registrations)}</td><td>${n(x.ready)}</td><td>${n(x.verifications)}</td><td>${n(x.followUps)}</td><td>${n(x.redeliveries)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function reportCourierTable(rows) {
    if (!rows.length) return '<p>Belum ada aktivitas Kurir pada periode ini.</p>';
    return `<div class="table-scroll"><table class="data-table compact-table"><thead><tr><th>Kurir</th><th>Selesai</th><th>Terkirim</th><th>Gagal</th><th>Keberhasilan</th><th>Kendala</th></tr></thead><tbody>${rows.map(x => `<tr><td>${esc(x.name)}</td><td>${n(Number(x.delivered||0)+Number(x.failed||0))}</td><td>${n(x.delivered)}</td><td>${n(x.failed)}</td><td>${pct(x.successRate)}</td><td>${n(x.incidents)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function reportDeliverySummary(a = {}) {
    return `<div class="report-summary-grid"><div><span>Total Pengantaran</span><b>${n(a.total)}</b></div><div><span>Berhasil Diantar</span><b>${n(a.delivered)}</b></div><div><span>Gagal Diantar</span><b>${n(a.failed)}</b></div><div><span>Kasus Pengantaran Ulang</span><b>${n(a.retriedCases)}</b></div><div><span>Pengantaran Ulang Berhasil</span><b>${n(a.retryDelivered)}</b></div><div><span>Ambil Mandiri</span><b>${n(a.selfPickup)}</b></div></div>`;
  }
  function printReport(d) {
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) return ctx.showToast('Jendela cetak diblokir browser. Izinkan pop-up untuk aplikasi ini.', 'error');
    const title = `Laporan Pengantaran Obat ${d.meta?.start || ''} s.d. ${d.meta?.end || ''}`;
    const logoUrl = new URL('./icons/logo-rsud.png', window.location.href).href;
    const html = reportPreview(d).replaceAll('./icons/logo-rsud.png', logoUrl);
    win.document.open();
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      @page{size:A4 portrait;margin:14mm 12mm 14mm}
      *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#102a36;margin:0;font-size:9.5px;line-height:1.35}h2{margin:1px 0 4px;font-size:17px}h3{margin:12px 0 6px;font-size:11px;color:#173b46}.mgmt-report-preview{border:0!important;box-shadow:none!important;padding:0!important}.report-preview-head{display:flex;align-items:center;gap:12px;border-bottom:2px solid #0a6675;padding-bottom:9px;margin-bottom:10px}.report-preview-head img{display:block;width:48px;height:48px;object-fit:contain}.report-preview-head strong{font-size:10px}.report-preview-head p{margin:0;color:#536b74;font-size:8.5px}.report-section{break-inside:auto;margin-top:10px}.report-section>h3{break-after:avoid}.report-summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px}.report-summary-grid>div,.report-time-grid>div{border:1px solid #ccdadd;border-radius:6px;padding:7px;break-inside:avoid}.report-summary-grid span,.report-time-grid span{display:block;color:#64748b;font-size:7.5px;text-transform:uppercase;font-weight:700}.report-summary-grid b,.report-time-grid b{display:block;font-size:12px;margin-top:3px}.report-time-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}.report-time-grid small{display:block;color:#64748b;margin-top:3px;font-size:7.5px}.grid{display:grid;gap:7px}.grid-2{grid-template-columns:1fr 1fr}.table-scroll{overflow:visible}table{width:100%;border-collapse:collapse;page-break-inside:auto}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th,td{border:1px solid #d7e0e5;padding:5px;text-align:left;vertical-align:top}th{background:#eef6f7;font-size:7.5px}.content-card{border:0!important;box-shadow:none!important}.active-incident-panel{display:none}
    </style></head><body>${html}<script>setTimeout(()=>window.print(),450)<\/script></body></html>`);
    win.document.close(); win.focus();
  }

  function resetForLogout() {
    state.data = null; state.loading = null; state.lastLoadedKey = ''; state.basis = 'DAFTAR'; state.performanceTab = 'pharmacy'; applyPreset('month');
  }

  return { renderHome, renderPerformance, renderAreas, renderReports, resetForLogout };
}
