import { APP_CONFIG } from './config.js';

export function createFarmasiModule(ctx) {
  const state = {
    master: { areas: [], manualVerificationMethods: [] },
    rows: [],
    pending: [],
    failedFollowUps: [],
    lastCreated: null,
    loaded: false,
    loading: null,
    search: ''
  };

  const esc = ctx.escapeHtml;
  const token = () => ctx.getToken();
  const api = () => ctx.getApi();
  const page = () => document.getElementById('pageContent');

  function statusClass(status) {
    const s = String(status || '').toUpperCase();
    if (s === 'MENUNGGU DIPROSES') return 'waiting';
    if (s === 'SIAP DIANTAR') return 'ready';
    if (s === 'DALAM PERJALANAN') return 'transit';
    if (s === 'TERKIRIM') return 'delivered';
    if (s === 'GAGAL ANTAR') return 'failed';
    return 'neutral';
  }

  function verificationClass(status) {
    const s = String(status || '').toUpperCase();
    if (!s) return 'neutral';
    if (s.includes('MENUNGGU')) return 'warning';
    if (s.includes('TERVERIFIKASI')) return 'success';
    if (s.includes('TIDAK')) return 'danger';
    return 'neutral';
  }

  function badge(text, kind = 'neutral') {
    if (!text) return '<span class="muted-text">Belum berlaku</span>';
    return `<span class="status-badge ${kind}">${esc(text)}</span>`;
  }

  function metric(label, value, note, icon = '') {
    return `<div class="card metric-card"><div class="metric-top"><span>${esc(label)}</span>${icon ? `<span class="metric-icon">${icon}</span>` : ''}</div><div class="metric-value">${esc(value)}</div><div class="metric-note">${esc(note)}</div></div>`;
  }

  function buttonBusy(button, busy, busyText = 'Memproses…') {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.disabled = true;
      button.textContent = busyText;
    } else {
      button.disabled = false;
      if (button.dataset.originalText) button.textContent = button.dataset.originalText;
    }
  }

  async function ensureData(force = false) {
    if (state.loaded && !force) return state;
    if (state.loading && !force) return state.loading;
    state.loading = (async () => {
      const res = await api().farmasiBootstrap(token());
      state.master = res.data?.master || state.master;
      state.rows = res.data?.rows || [];
      state.pending = res.data?.pending || [];
      state.failedFollowUps = res.data?.failedFollowUps || [];
      state.loaded = true;
      return state;
    })();
    try { return await state.loading; }
    finally { state.loading = null; }
  }

  async function loadRows(search = state.search) {
    state.search = String(search || '');
    const res = await api().farmasiRows(token(), state.search);
    state.rows = res.data?.rows || [];
    return state.rows;
  }

  async function loadPending() {
    const res = await api().pendingReceiptVerifications(token());
    state.pending = res.data?.rows || [];
    return state.pending;
  }

  async function loadFailedFollowUps() {
    const res = await api().failedDeliveryFollowUps(token());
    state.failedFollowUps = res.data?.rows || [];
    return state.failedFollowUps;
  }

  async function refreshMaster() {
    const res = await api().refreshFarmasiMaster(token());
    state.master = res.data?.master || state.master;
    return state.master;
  }

  function rowById(id) {
    return state.rows.find(r => String(r['ID Sistem']) === String(id)) ||
      state.pending.find(r => String(r['ID Sistem']) === String(id)) || null;
  }

  function areaFromRecord(record = {}) {
    const village = String(record['Kelurahan'] || '').trim();
    const district = String(record['Kecamatan'] || '').trim();
    const region = String(record['Kabupaten/Kota'] || '').trim();
    return (state.master.areas || []).find(a => a.village === village && a.district === district && (!region || a.region === region)) || null;
  }

  function areaLabel(area) {
    return area ? `${area.village} — ${area.district} — ${area.region}` : '';
  }

  function renderDeliveryFields(record = {}, prefix = 'reg') {
    const selected = areaFromRecord(record);
    return `<div class="form-section">
      <div class="form-section-head"><span class="section-number">01</span><div><h3>Informasi Pasien</h3><p>Identitas minimum untuk proses pengantaran.</p></div></div>
      <div class="form-grid two">
        <div class="field"><label for="${prefix}-rm">No. RM <b>*</b></label><input id="${prefix}-rm" autocomplete="off" value="${esc(record['No RM'] || '')}" placeholder="Nomor rekam medis"></div>
        <div class="field"><label for="${prefix}-name">Nama Pasien <b>*</b></label><input id="${prefix}-name" autocomplete="off" value="${esc(record['Nama Pasien'] || '')}" placeholder="Nama lengkap pasien"></div>
        <div class="field"><label for="${prefix}-phone">No. WhatsApp <b>*</b></label><input id="${prefix}-phone" inputmode="tel" autocomplete="off" value="${esc(record['No WhatsApp'] || '')}" placeholder="08xxxxxxxxxx"></div>
        <div class="field"><label for="${prefix}-recipient">Nama Penerima <span>opsional</span></label><input id="${prefix}-recipient" autocomplete="off" value="${esc(record['Nama Penerima'] || '')}" placeholder="Kosongkan bila pasien sendiri"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-head"><span class="section-number">02</span><div><h3>Alamat Pengantaran</h3><p>Pilih wilayah dari master agar kecamatan dan kabupaten/kota konsisten.</p></div></div>
      <div class="form-grid">
        <div class="field"><label for="${prefix}-address">Alamat Lengkap <b>*</b></label><textarea id="${prefix}-address" rows="3" placeholder="Nama jalan, nomor rumah, RT/RW bila ada">${esc(record['Alamat Lengkap'] || '')}</textarea></div>
        <div class="field area-field"><label for="${prefix}-area">Desa/Kelurahan <b>*</b></label><input id="${prefix}-area" autocomplete="off" value="${esc(areaLabel(selected))}" placeholder="Ketik desa, kecamatan, atau kabupaten…"><input id="${prefix}-areaKey" type="hidden" value="${esc(selected?.key || '')}"><div id="${prefix}-areaResults" class="area-results hidden"></div><div id="${prefix}-areaHint" class="field-hint"></div></div>
        <div class="field"><label for="${prefix}-landmark">Patokan Lokasi <b>*</b></label><textarea id="${prefix}-landmark" rows="2" placeholder="Contoh: rumah cat hijau di sebelah masjid">${esc(record['Patokan Lokasi'] || '')}</textarea></div>
      </div>
    </div>`;
  }

  function formPayload(prefix = 'reg') {
    return {
      rm: document.getElementById(`${prefix}-rm`)?.value.trim() || '',
      name: document.getElementById(`${prefix}-name`)?.value.trim() || '',
      phone: document.getElementById(`${prefix}-phone`)?.value.trim() || '',
      recipient: document.getElementById(`${prefix}-recipient`)?.value.trim() || '',
      address: document.getElementById(`${prefix}-address`)?.value.trim() || '',
      areaKey: document.getElementById(`${prefix}-areaKey`)?.value.trim() || '',
      landmark: document.getElementById(`${prefix}-landmark`)?.value.trim() || ''
    };
  }

  function validateForm(prefix = 'reg') {
    const required = [
      [`${prefix}-rm`, 'No. RM wajib diisi.'],
      [`${prefix}-name`, 'Nama pasien wajib diisi.'],
      [`${prefix}-phone`, 'Nomor WhatsApp wajib diisi.'],
      [`${prefix}-address`, 'Alamat lengkap wajib diisi.'],
      [`${prefix}-areaKey`, 'Pilih desa/kelurahan dari daftar pencarian.'],
      [`${prefix}-landmark`, 'Patokan lokasi wajib diisi.']
    ];
    for (const [id, message] of required) {
      const el = document.getElementById(id);
      if (!String(el?.value || '').trim()) {
        const focusId = id.endsWith('areaKey') ? `${prefix}-area` : id;
        document.getElementById(focusId)?.focus();
        ctx.showToast(message, 'error');
        return false;
      }
    }
    return true;
  }

  function updateAreaHint(prefix) {
    const key = document.getElementById(`${prefix}-areaKey`)?.value || '';
    const hint = document.getElementById(`${prefix}-areaHint`);
    if (!hint) return;
    const area = (state.master.areas || []).find(a => a.key === key);
    if (!area) {
      hint.className = 'field-hint';
      hint.textContent = 'Ketik lalu pilih wilayah dari daftar.';
      return;
    }
    const cls = String(area.status || '').toUpperCase() === 'AKTIF' ? 'active' : 'inactive';
    hint.className = `field-hint ${cls}`;
    hint.textContent = `${area.region} • Kecamatan ${area.district} • Cakupan ${area.status}${area.note ? ` • ${area.note}` : ''}`;
  }

  function filterAreas(prefix) {
    const input = document.getElementById(`${prefix}-area`);
    const hidden = document.getElementById(`${prefix}-areaKey`);
    const box = document.getElementById(`${prefix}-areaResults`);
    if (!input || !hidden || !box) return;

    const selected = (state.master.areas || []).find(a => a.key === hidden.value);
    if (selected && input.value !== areaLabel(selected)) hidden.value = '';

    const q = input.value.trim().toLowerCase();
    const all = state.master.areas || [];
    const score = a => {
      const v = a.village.toLowerCase(), d = a.district.toLowerCase(), r = a.region.toLowerCase();
      if (!q) return 6;
      if (v.startsWith(q)) return 0;
      if (d.startsWith(q)) return 1;
      if (r.startsWith(q)) return 2;
      if (v.includes(q)) return 3;
      if (d.includes(q)) return 4;
      if (r.includes(q)) return 5;
      return 99;
    };
    const results = all.filter(a => score(a) < 99).sort((a, b) => score(a) - score(b) || (a.status === 'AKTIF' ? -1 : 1) || a.village.localeCompare(b.village)).slice(0, 16);
    box.innerHTML = results.length ? results.map(a => `<button type="button" class="area-option" data-area-key="${esc(a.key)}"><strong>${esc(a.village)}</strong><span>Kecamatan ${esc(a.district)} • ${esc(a.region)}</span><em class="${String(a.status).toUpperCase() === 'AKTIF' ? 'ok' : 'off'}">${esc(a.status)}</em></button>`).join('') : '<div class="area-empty">Wilayah tidak ditemukan.</div>';
    box.classList.remove('hidden');
    box.querySelectorAll('[data-area-key]').forEach(btn => btn.addEventListener('mousedown', ev => {
      ev.preventDefault();
      const area = all.find(a => a.key === btn.dataset.areaKey);
      if (!area) return;
      input.value = areaLabel(area);
      hidden.value = area.key;
      box.classList.add('hidden');
      updateAreaHint(prefix);
      if (prefix === 'reg') saveDraft();
    }));
    updateAreaHint(prefix);
  }

  function bindAreaSearch(prefix) {
    const input = document.getElementById(`${prefix}-area`);
    const box = document.getElementById(`${prefix}-areaResults`);
    if (!input || !box) return;
    input.addEventListener('input', () => filterAreas(prefix));
    input.addEventListener('focus', () => filterAreas(prefix));
    input.addEventListener('keydown', e => { if (e.key === 'Escape') box.classList.add('hidden'); });
    input.addEventListener('blur', () => setTimeout(() => box.classList.add('hidden'), 120));
    updateAreaHint(prefix);
  }

  function saveDraft() {
    try { sessionStorage.setItem(APP_CONFIG.farmasiDraftKey, JSON.stringify(formPayload('reg'))); } catch (_) {}
  }

  function restoreDraft() {
    try {
      const raw = sessionStorage.getItem(APP_CONFIG.farmasiDraftKey);
      if (!raw) return;
      const d = JSON.parse(raw);
      ['rm','name','phone','recipient','address','landmark'].forEach(k => {
        const el = document.getElementById(`reg-${k}`); if (el && d[k] != null) el.value = d[k];
      });
      const area = (state.master.areas || []).find(a => a.key === d.areaKey);
      if (area) {
        document.getElementById('reg-areaKey').value = area.key;
        document.getElementById('reg-area').value = areaLabel(area);
      }
      updateAreaHint('reg');
    } catch (_) { sessionStorage.removeItem(APP_CONFIG.farmasiDraftKey); }
  }

  function bindDraft() {
    ['rm','name','phone','recipient','address','area','landmark'].forEach(k => {
      const el = document.getElementById(`reg-${k}`);
      if (!el) return;
      el.addEventListener('input', saveDraft);
      el.addEventListener('change', saveDraft);
    });
  }

  function clearRegistrationForm() {
    ['rm','name','phone','recipient','address','landmark','area','areaKey'].forEach(k => {
      const el = document.getElementById(`reg-${k}`); if (el) el.value = '';
    });
    sessionStorage.removeItem(APP_CONFIG.farmasiDraftKey);
    updateAreaHint('reg');
  }

  async function renderHome() {
    page().innerHTML = `<section class="hero compact"><div><div class="eyebrow">FARMASI</div><h1>Ruang Kerja Farmasi</h1><p>Pendaftaran, kesiapan obat, label, dan verifikasi penerimaan dalam satu alur kerja.</p></div><div class="hero-actions"><button id="homeRegister" class="primary-btn">＋ Daftarkan Pengantaran</button><button id="homeRefresh" class="secondary-btn">↻ Segarkan</button></div></section>
      <section class="section"><div id="farmasiHomeMetrics" class="grid grid-4">${metric('Memuat','—','Mengambil data hari ini')}</div></section>
      <section class="section"><div class="section-head"><div><h2>Perlu Tindakan</h2><p>Prioritas kerja yang membutuhkan perhatian petugas.</p></div></div><div id="farmasiAttention" class="grid grid-2"></div></section>`;
    document.getElementById('homeRegister')?.addEventListener('click', () => ctx.navigate('registration'));
    document.getElementById('homeRefresh')?.addEventListener('click', async e => {
      buttonBusy(e.currentTarget, true, 'Memuat…');
      try { await ensureData(true); renderHomeData(); ctx.showToast('Data Farmasi diperbarui.', 'success'); }
      catch (err) { ctx.showToast(err.message, 'error'); }
      finally { buttonBusy(e.currentTarget, false); }
    });
    try { await ensureData(); renderHomeData(); }
    catch (err) { document.getElementById('farmasiHomeMetrics').innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
  }

  function renderHomeData() {
    const counts = { waiting:0, ready:0, transit:0, delivered:0, failed:0 };
    state.rows.forEach(r => {
      const s = String(r['Status'] || '').toUpperCase();
      if (s === 'MENUNGGU DIPROSES') counts.waiting++;
      else if (s === 'SIAP DIANTAR') counts.ready++;
      else if (s === 'DALAM PERJALANAN') counts.transit++;
      else if (s === 'TERKIRIM') counts.delivered++;
      else if (s === 'GAGAL ANTAR') counts.failed++;
    });
    const metrics = document.getElementById('farmasiHomeMetrics');
    if (metrics) metrics.innerHTML = [
      metric('Menunggu Diproses', counts.waiting, 'Belum ditandai siap', '◷'),
      metric('Siap Diantar', counts.ready, 'Menunggu diambil kurir', '▣'),
      metric('Dalam Perjalanan', counts.transit, 'Sedang diantar', '➜'),
      metric('Selesai Hari Ini', counts.delivered + counts.failed, `${counts.delivered} terkirim • ${counts.failed} gagal`, '✓')
    ].join('');
    const attention = document.getElementById('farmasiAttention');
    if (attention) attention.innerHTML = `<button class="attention-card ${state.pending.length ? 'warn' : ''}" id="attentionVerification"><span class="attention-icon">✓</span><span><strong>${state.pending.length} menunggu verifikasi manual</strong><small>${state.pending.length ? 'Hubungi pasien/penerima dan selesaikan verifikasi.' : 'Tidak ada antrean verifikasi manual.'}</small></span><b>›</b></button>
      <button class="attention-card ${state.failedFollowUps.length ? 'danger-attention' : ''}" id="attentionFailed"><span class="attention-icon">↺</span><span><strong>${state.failedFollowUps.length} gagal antar perlu tindak lanjut</strong><small>${state.failedFollowUps.length ? 'Konfirmasi obat kembali lalu jadwalkan ulang atau tutup layanan.' : 'Tidak ada gagal antar yang menunggu Farmasi.'}</small></span><b>›</b></button>
      <button class="attention-card" id="attentionToday"><span class="attention-icon">▤</span><span><strong>${state.rows.length} pendaftaran hari ini</strong><small>Pantau status dan aksi lanjutan pengantaran.</small></span><b>›</b></button>`;
    document.getElementById('attentionVerification')?.addEventListener('click', () => ctx.navigate('verification'));
    document.getElementById('attentionFailed')?.addEventListener('click', openFailedFollowUps);
    document.getElementById('attentionToday')?.addEventListener('click', () => ctx.navigate('today'));
  }

  async function renderRegistration() {
    page().innerHTML = `<section class="hero compact"><div><div class="eyebrow">PENDAFTARAN</div><h1>Daftarkan Pengantaran</h1><p>Workflow Produksi V1 dipertahankan. Sistem tetap memeriksa duplikasi aktif dan wilayah cakupan.</p></div><div class="hero-actions"><button id="registrationMasterRefresh" class="secondary-btn">↻ Muat Ulang Wilayah</button></div></section>
      <section class="section"><div class="card form-card"><div id="registrationLoading" class="inline-loading">Memuat master wilayah…</div><form id="registrationForm" class="hidden">${renderDeliveryFields({}, 'reg')}<div class="form-actions"><label class="check-row"><input id="printAfterSave" type="checkbox" checked><span>Cetak label setelah simpan</span></label><div class="action-buttons"><button id="clearRegistration" class="secondary-btn" type="button">Bersihkan</button><button id="saveRegistration" class="primary-btn" type="submit">Simpan Pendaftaran</button></div></div></form></div></section>`;
    try {
      await ensureData();
      document.getElementById('registrationLoading')?.classList.add('hidden');
      document.getElementById('registrationForm')?.classList.remove('hidden');
      restoreDraft(); bindAreaSearch('reg'); bindDraft();
      document.getElementById('clearRegistration')?.addEventListener('click', clearRegistrationForm);
      document.getElementById('registrationMasterRefresh')?.addEventListener('click', async e => {
        buttonBusy(e.currentTarget, true, 'Memuat…');
        try { await refreshMaster(); ctx.showToast('Master wilayah diperbarui.', 'success'); filterAreas('reg'); }
        catch (err) { ctx.showToast(err.message, 'error'); }
        finally { buttonBusy(e.currentTarget, false); }
      });
      document.getElementById('registrationForm')?.addEventListener('submit', saveRegistration);
    } catch (err) {
      document.getElementById('registrationLoading').innerHTML = `<div class="alert error">${esc(err.message)}</div>`;
    }
  }

  async function saveRegistration(ev) {
    ev.preventDefault();
    if (!validateForm('reg')) return;
    const button = document.getElementById('saveRegistration');
    const shouldPrint = Boolean(document.getElementById('printAfterSave')?.checked);
    const printWindow = shouldPrint ? window.open('', '_blank', 'width=720,height=820') : null;
    buttonBusy(button, true, 'Menyimpan…');
    const payload = formPayload('reg');
    try {
      let res = await api().createDelivery(token(), payload);
      let data = res.data || {};
      if (data.requiresDuplicateConfirmation) {
        const d = data.duplicate || {};
        const proceed = await ctx.confirmAction({
          title: 'Pendaftaran dengan No. RM yang sama',
          message: `No. RM ${d.rm || payload.rm} sudah terdaftar hari ini dan prosesnya belum selesai.\n\nNama: ${d.name || '-'}\nWaktu daftar: ${d.registeredAt || '-'}\nStatus: ${d.status || '-'}\nWilayah: ${[d.village,d.district,d.region].filter(Boolean).join(', ') || '-'}\n\nTetap simpan sebagai pendaftaran baru?`,
          confirmLabel: 'Tetap Simpan',
          tone: 'warning'
        });
        if (!proceed) {
          if (printWindow) printWindow.close();
          ctx.showToast('Pendaftaran dibatalkan. Data sebelumnya tidak berubah.', 'info');
          return;
        }
        res = await api().createDelivery(token(), {...payload, confirmDuplicate:true});
        data = res.data || {};
      }
      if (!data.record) throw new Error('Respons penyimpanan tidak lengkap. Silakan coba kembali.');
      state.lastCreated = data.record;
      state.rows = [data.record, ...state.rows.filter(r => r['ID Sistem'] !== data.record['ID Sistem'])];
      clearRegistrationForm();
      if (shouldPrint) {
        if (printWindow) printLabelWindow(printWindow, data.record);
        else ctx.showToast('Jendela cetak diblokir browser. Gunakan menu Label.', 'error');
      }
      ctx.showToast(data.duplicateOverride ? 'Pendaftaran ulang berhasil disimpan setelah konfirmasi duplikasi.' : 'Pendaftaran berhasil disimpan.', data.duplicateOverride ? 'warning' : 'success');
      if (data.waAction) openWhatsAppModal(data.waAction, data.record, { title:data.duplicateOverride ? 'Pendaftaran ulang berhasil' : 'Pendaftaran berhasil', allowPrint:true });
      setTimeout(() => loadRows('').catch(() => {}), 300);
    } catch (err) {
      if (printWindow) printWindow.close();
      ctx.showToast(err.message, 'error');
    } finally { buttonBusy(button, false); }
  }

  async function renderToday() {
    page().innerHTML = `<section class="hero compact"><div><div class="eyebrow">HARI INI</div><h1>Pengantaran Hari Ini</h1><p>Pantau pendaftaran, kirim ulang kode penerimaan, cetak label, edit data yang masih menunggu, dan tandai obat siap.</p></div></section>
      <section class="section"><div class="toolbar-card"><div class="search-box"><span>⌕</span><input id="todaySearch" placeholder="Cari No. RM, nama, wilayah, atau status…" value="${esc(state.search)}"></div><button id="todayRefresh" class="secondary-btn">↻ Segarkan</button></div><div id="todayContent" class="content-card"><div class="inline-loading">Memuat data hari ini…</div></div></section>`;
    const search = document.getElementById('todaySearch');
    let timer;
    search?.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => refreshToday(search.value), 280); });
    document.getElementById('todayRefresh')?.addEventListener('click', async e => {
      buttonBusy(e.currentTarget, true, 'Memuat…');
      try { await refreshToday(search?.value || ''); ctx.showToast('Data hari ini diperbarui.', 'success'); }
      catch (err) { ctx.showToast(err.message, 'error'); }
      finally { buttonBusy(e.currentTarget, false); }
    });
    try { await ensureData(); if (state.search) await loadRows(state.search); renderTodayRows(); }
    catch (err) { document.getElementById('todayContent').innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
  }

  async function refreshToday(search = '') {
    await loadRows(search);
    renderTodayRows();
  }

  function renderTodayRows() {
    const box = document.getElementById('todayContent');
    if (!box) return;
    if (!state.rows.length) {
      box.innerHTML = `<div class="empty-state"><div>▤</div><h3>Belum ada data</h3><p>Tidak ada pendaftaran yang sesuai dengan pencarian hari ini.</p></div>`;
      return;
    }
    box.innerHTML = `<div class="table-wrap"><table class="responsive-table"><thead><tr><th>Jam</th><th>No. RM / Pasien</th><th>Wilayah</th><th>Status</th><th>Verifikasi</th><th>Aksi</th></tr></thead><tbody>${state.rows.map(r => `<tr>
      <td data-label="Jam">${esc(String(r['Jam Daftar'] || '').slice(-5))}</td>
      <td data-label="Pasien"><strong>${esc(r['Nama Pasien'])}</strong><span class="cell-sub">No. RM ${esc(r['No RM'])}</span></td>
      <td data-label="Wilayah"><strong>${esc(r['Kelurahan'] || '-')}</strong><span class="cell-sub">${esc(r['Kecamatan'] || '')}${r['Kabupaten/Kota'] ? ` • ${esc(r['Kabupaten/Kota'])}` : ''}</span></td>
      <td data-label="Status">${badge(r['Status'], statusClass(r['Status']))}${r['Status Kendala'] ? `<div class="cell-gap">${badge(r['Status Kendala'], 'warning')}</div>` : ''}</td>
      <td data-label="Verifikasi">${badge(r['Status Verifikasi Penerimaan'], verificationClass(r['Status Verifikasi Penerimaan']))}</td>
      <td data-label="Aksi"><div class="row-actions"><button class="mini-btn" data-action="print" data-id="${esc(r['ID Sistem'])}">Cetak Label</button>${['MENUNGGU DIPROSES','SIAP DIANTAR','DALAM PERJALANAN'].includes(r['Status']) ? `<button class="mini-btn success" data-action="wa" data-id="${esc(r['ID Sistem'])}">WA Kode</button>` : ''}${r['Status'] === 'MENUNGGU DIPROSES' ? `<button class="mini-btn primary" data-action="ready" data-id="${esc(r['ID Sistem'])}">Siap Diantar</button><button class="mini-btn" data-action="edit" data-id="${esc(r['ID Sistem'])}">Edit</button>` : ''}</div></td>
    </tr>`).join('')}</tbody></table></div>`;
    box.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', () => handleTodayAction(btn.dataset.action, btn.dataset.id, btn)));
  }

  async function handleTodayAction(action, id, button) {
    const record = rowById(id);
    if (action === 'print') return printRecord(record);
    if (action === 'edit') return openEdit(record);
    if (action === 'ready') return markReady(id, button);
    if (action === 'wa') return sendRegistrationWa(id, button);
  }

  async function sendRegistrationWa(id, button) {
    buttonBusy(button, true, 'Menyiapkan…');
    try {
      const res = await api().registrationWa(token(), id);
      openWhatsAppModal(res.data?.waAction, res.data?.record || rowById(id), {title:'Kirim kode penerimaan'});
    } catch (err) { ctx.showToast(err.message, 'error'); }
    finally { buttonBusy(button, false); }
  }

  async function markReady(id, button) {
    const record = rowById(id);
    const yes = await ctx.confirmAction({
      title:'Tandai obat siap diantar?',
      message:`Pastikan obat untuk ${record?.['Nama Pasien'] || 'pasien'} sudah selesai, benar, dan siap diserahkan kepada kurir.`,
      confirmLabel:'Ya, Siap Diantar'
    });
    if (!yes) return;
    buttonBusy(button, true, 'Menyimpan…');
    try {
      const res = await api().markReady(token(), id);
      const updated = res.data?.record;
      if (updated) state.rows = state.rows.map(r => r['ID Sistem'] === id ? updated : r);
      renderTodayRows();
      ctx.showToast('Obat ditandai SIAP DIANTAR.', 'success');
    } catch (err) { ctx.showToast(err.message, 'error'); }
    finally { buttonBusy(button, false); }
  }

  function openEdit(record) {
    if (!record) return ctx.showToast('Data tidak ditemukan. Segarkan halaman.', 'error');
    ctx.openModal(`<div class="modal-head"><div><div class="eyebrow">KOREKSI PENDAFTARAN</div><h3>Edit Data</h3><p>${esc(record['Nama Pasien'])} • No. RM ${esc(record['No RM'])}</p></div><button class="modal-x" data-modal-close>×</button></div><form id="editForm">${renderDeliveryFields(record, 'edit')}<div class="modal-actions"><button type="button" class="secondary-btn" data-modal-close>Batal</button><button id="saveEdit" type="submit" class="primary-btn">Simpan Perubahan</button></div></form>`, {wide:true});
    bindAreaSearch('edit');
    document.getElementById('editForm')?.addEventListener('submit', async e => {
      e.preventDefault(); if (!validateForm('edit')) return;
      const btn = document.getElementById('saveEdit'); buttonBusy(btn, true, 'Menyimpan…');
      try {
        const res = await api().updateFarmasiRecord(token(), record['ID Sistem'], formPayload('edit'));
        const updated = res.data?.record;
        if (updated) state.rows = state.rows.map(r => r['ID Sistem'] === record['ID Sistem'] ? updated : r);
        ctx.closeModal(); renderTodayRows(); ctx.showToast('Data pendaftaran diperbarui.', 'success');
      } catch (err) { ctx.showToast(err.message, 'error'); }
      finally { buttonBusy(btn, false); }
    });
  }

  async function renderVerification() {
    page().innerHTML = `<section class="hero compact"><div><div class="eyebrow">VERIFIKASI</div><h1>Verifikasi Penerimaan</h1><p>Penyerahan tanpa kode harus dikonfirmasi kembali sebelum dianggap terverifikasi manual.</p></div><div class="hero-actions"><button id="verificationRefresh" class="secondary-btn">↻ Segarkan</button></div></section><section class="section"><div id="verificationContent" class="content-card"><div class="inline-loading">Memuat antrean verifikasi…</div></div></section>`;
    document.getElementById('verificationRefresh')?.addEventListener('click', async e => {
      buttonBusy(e.currentTarget, true, 'Memuat…');
      try { await loadPending(); renderVerificationRows(); ctx.showToast('Antrean verifikasi diperbarui.', 'success'); }
      catch (err) { ctx.showToast(err.message, 'error'); }
      finally { buttonBusy(e.currentTarget, false); }
    });
    try { await ensureData(); await loadPending(); renderVerificationRows(); }
    catch (err) { document.getElementById('verificationContent').innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
  }

  function renderVerificationRows() {
    const box = document.getElementById('verificationContent'); if (!box) return;
    if (!state.pending.length) {
      box.innerHTML = `<div class="success-empty"><span>✓</span><div><strong>Tidak ada verifikasi tertunda</strong><p>Semua penyerahan tanpa kode yang masuk antrean sudah ditindaklanjuti.</p></div></div>`;
      return;
    }
    box.innerHTML = `<div class="table-wrap"><table class="responsive-table"><thead><tr><th>Waktu Terkirim</th><th>Pasien</th><th>Kurir</th><th>Penerima Aktual</th><th>Alasan Tanpa Kode</th><th>Aksi</th></tr></thead><tbody>${state.pending.map(r => `<tr>
      <td data-label="Waktu">${esc(r['Waktu Terkirim'] || '-')}</td>
      <td data-label="Pasien"><strong>${esc(r['Nama Pasien'])}</strong><span class="cell-sub">No. RM ${esc(r['No RM'])}</span></td>
      <td data-label="Kurir">${esc(r['Kurir'] || '-')}</td>
      <td data-label="Penerima">${esc(r['Nama Penerima Aktual'] || '-')}<span class="cell-sub">${esc(r['Hubungan Penerima'] || '')}</span></td>
      <td data-label="Alasan">${esc(r['Alasan Tanpa Kode'] || '-')}</td>
      <td data-label="Aksi"><div class="row-actions"><button class="mini-btn success" data-vaction="wa" data-id="${esc(r['ID Sistem'])}">💬 WA Konfirmasi</button>${r['Link Telepon'] ? `<a class="mini-btn" href="${esc(r['Link Telepon'])}">📞 Telepon</a>` : ''}<button class="mini-btn primary" data-vaction="verify" data-id="${esc(r['ID Sistem'])}">✓ Verifikasi</button></div></td>
    </tr>`).join('')}</tbody></table></div>`;
    box.querySelectorAll('[data-vaction]').forEach(btn => btn.addEventListener('click', () => {
      if (btn.dataset.vaction === 'wa') sendManualWa(btn.dataset.id, btn);
      else openManualVerification(btn.dataset.id);
    }));
  }

  async function sendManualWa(id, button) {
    buttonBusy(button, true, 'Menyiapkan…');
    try {
      const res = await api().manualReceiptWa(token(), id);
      openWhatsAppModal(res.data?.waAction, res.data?.record || rowById(id), {title:'Konfirmasi penerimaan obat', description:'Setelah pasien/penerima membalas SUDAH DITERIMA, lanjutkan dengan tombol Verifikasi.'});
    } catch (err) { ctx.showToast(err.message, 'error'); }
    finally { buttonBusy(button, false); }
  }

  function openManualVerification(id) {
    const r = rowById(id); if (!r) return ctx.showToast('Data tidak ditemukan. Segarkan halaman.', 'error');
    const methods = state.master.manualVerificationMethods?.length ? state.master.manualVerificationMethods : ['TELEPON','WHATSAPP','KONFIRMASI LANGSUNG','LAINNYA'];
    ctx.openModal(`<div class="modal-head"><div><div class="eyebrow">VERIFIKASI MANUAL</div><h3>Konfirmasi Penerimaan</h3><p>${esc(r['Nama Pasien'])} • No. RM ${esc(r['No RM'])}</p></div><button class="modal-x" data-modal-close>×</button></div>
      <div class="notice-box">Simpan hanya setelah pasien atau penerima menyatakan bahwa obat sudah diterima.</div>
      <button id="fillWaVerification" class="secondary-btn" style="margin-top:12px">💬 Isi: Sudah diterima via WA</button>
      <div class="form-grid" style="margin-top:16px"><div class="field"><label for="verifyMethod">Metode verifikasi <b>*</b></label><select id="verifyMethod"><option value="">Pilih metode</option>${methods.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}</select></div><div class="field"><label for="verifyNote">Catatan hasil verifikasi <b>*</b></label><textarea id="verifyNote" rows="3" placeholder="Contoh: Pasien mengonfirmasi melalui WhatsApp bahwa obat telah diterima."></textarea></div></div>
      <div class="modal-actions"><button class="secondary-btn" data-modal-close>Batal</button><button id="saveManualVerify" class="primary-btn">Simpan Verifikasi</button></div>`);
    document.getElementById('fillWaVerification')?.addEventListener('click', () => {
      const method = document.getElementById('verifyMethod'); const note = document.getElementById('verifyNote');
      if ([...method.options].some(o => String(o.value).toUpperCase() === 'WHATSAPP')) method.value = 'WHATSAPP';
      note.value = 'Pasien/penerima mengonfirmasi melalui WhatsApp bahwa obat telah diterima.';
      note.focus();
    });
    document.getElementById('saveManualVerify')?.addEventListener('click', async e => {
      const method = document.getElementById('verifyMethod').value;
      const note = document.getElementById('verifyNote').value.trim();
      if (!method) return ctx.showToast('Pilih metode verifikasi.', 'error');
      if (!note) return ctx.showToast('Catatan hasil verifikasi wajib diisi.', 'error');
      buttonBusy(e.currentTarget, true, 'Menyimpan…');
      try {
        await api().manualVerifyReceipt(token(), id, method, note);
        state.pending = state.pending.filter(x => x['ID Sistem'] !== id);
        ctx.closeModal(); renderVerificationRows(); ctx.showToast('Verifikasi manual penerimaan disimpan.', 'success');
      } catch (err) { ctx.showToast(err.message, 'error'); }
      finally { buttonBusy(e.currentTarget, false); }
    });
  }

  async function renderLabels() {
    page().innerHTML = `<section class="hero compact"><div><div class="eyebrow">LABEL A6</div><h1>Label Pengantaran</h1><p>Cetak atau cetak ulang label dari pendaftaran hari ini. Kode penerimaan tidak dicetak pada label.</p></div><div class="hero-actions"><button id="labelsRefresh" class="secondary-btn">↻ Segarkan</button></div></section><section class="section"><div id="labelsContent" class="label-grid"><div class="inline-loading">Memuat label hari ini…</div></div></section>`;
    document.getElementById('labelsRefresh')?.addEventListener('click', async e => {
      buttonBusy(e.currentTarget, true, 'Memuat…');
      try { await loadRows(''); renderLabelCards(); ctx.showToast('Daftar label diperbarui.', 'success'); }
      catch (err) { ctx.showToast(err.message, 'error'); }
      finally { buttonBusy(e.currentTarget, false); }
    });
    try { await ensureData(); if (state.search) await loadRows(''); renderLabelCards(); }
    catch (err) { document.getElementById('labelsContent').innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
  }

  function renderLabelCards() {
    const box = document.getElementById('labelsContent'); if (!box) return;
    if (!state.rows.length) return void (box.innerHTML = `<div class="empty-state"><div>▣</div><h3>Belum ada label</h3><p>Pendaftaran hari ini akan muncul di sini.</p></div>`);
    box.innerHTML = state.rows.map(r => `<article class="label-card"><div class="label-card-top"><span>${esc(String(r['Jam Daftar'] || '').slice(-5))}</span>${badge(r['Status'], statusClass(r['Status']))}</div><h3>${esc(r['Nama Pasien'])}</h3><p>No. RM ${esc(r['No RM'])}</p><div class="label-location"><strong>${esc(r['Kelurahan'] || '-')}</strong><span>${esc(r['Kecamatan'] || '')} • ${esc(r['Kabupaten/Kota'] || '')}</span></div><button class="secondary-btn wide" data-label-print="${esc(r['ID Sistem'])}">▣ Cetak Label A6</button></article>`).join('');
    box.querySelectorAll('[data-label-print]').forEach(btn => btn.addEventListener('click', () => printRecord(rowById(btn.dataset.labelPrint))));
  }

  function printRecord(record) {
    if (!record) return ctx.showToast('Data tidak ditemukan. Segarkan halaman.', 'error');
    printLabelWindow(window.open('', '_blank', 'width=720,height=820'), record);
  }

  function printLabelWindow(w, r) {
    if (!w) return ctx.showToast('Jendela cetak diblokir browser. Izinkan pop-up untuk aplikasi ini.', 'error');
    const phone = String(r['No WhatsApp'] || '');
    const phoneView = phone ? `+${phone}` : '';
    const time = String(r['Jam Daftar'] || '').slice(-5);
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Label ${esc(r['Nama Pasien'])}</title><style>@page{size:A6 portrait;margin:6mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#111}.label{border:2px solid #111;padding:6mm;min-height:132mm}.head{text-align:center;border-bottom:2px solid #111;padding-bottom:3mm;margin-bottom:4mm}.head h1{font-size:17px;margin:0}.head p{font-size:10px;margin:2mm 0 0}.name{font-size:22px;font-weight:800;margin:0 0 3mm}.row{display:grid;grid-template-columns:30mm 1fr;gap:2mm;font-size:12px;line-height:1.35;margin:1.5mm 0}.key{font-weight:700}.address{border:1px solid #333;padding:3mm;margin-top:3mm;font-size:12px;line-height:1.4}.foot{border-top:1px solid #333;margin-top:4mm;padding-top:3mm;font-size:9px}.no-print{margin:12px;text-align:center}.no-print button{padding:10px 16px;font-weight:700}@media print{.no-print{display:none}.label{border:2px solid #111}}</style></head><body><div class="label"><div class="head"><h1>LAYANAN PENGANTARAN OBAT</h1><p>RSUD PROVINSI NUSA TENGGARA BARAT</p></div><div class="name">${esc(r['Nama Pasien'])}</div><div class="row"><div class="key">No. RM</div><div>${esc(r['No RM'])}</div></div><div class="row"><div class="key">Penerima</div><div>${esc(r['Nama Penerima'] || r['Nama Pasien'])}</div></div><div class="row"><div class="key">No. WA</div><div>${esc(phoneView)}</div></div><div class="row"><div class="key">Wilayah</div><div>${esc(r['Kelurahan'])}, Kec. ${esc(r['Kecamatan'])}<br>${esc(r['Kabupaten/Kota'] || '')}</div></div><div class="address"><div class="key">ALAMAT</div><div>${esc(r['Alamat Lengkap'])}</div><div style="margin-top:2mm"><span class="key">Patokan:</span> ${esc(r['Patokan Lokasi'])}</div></div><div class="row"><div class="key">Daftar</div><div>${esc(r['Tanggal Daftar'])} ${esc(time)}</div></div><div class="row"><div class="key">ID Sistem</div><div>${esc(r['ID Sistem'])}</div></div><div class="foot">RAHASIA — hanya untuk proses pengantaran obat. Paket tidak boleh dibuka selama pengantaran.</div></div><div class="no-print"><button onclick="window.print()">Cetak</button></div><script>setTimeout(()=>window.print(),350)<\/script></body></html>`);
    w.document.close(); w.focus();
  }

  function openWhatsAppModal(waAction, record, options = {}) {
    if (!waAction) return ctx.showToast('Pesan WhatsApp tidak tersedia.', 'error');
    ctx.openModal(`<div class="modal-head"><div><div class="eyebrow">WHATSAPP</div><h3>${esc(options.title || 'Kirim pesan')}</h3><p>${esc(options.description || 'Periksa pesan sebelum membuka WhatsApp.')}</p></div><button class="modal-x" data-modal-close>×</button></div>
      <div class="wa-meta"><span>Tujuan</span><strong>${esc(waAction.phoneDisplay || waAction.phone || '-')}</strong><span>Pasien</span><strong>${esc(record?.['Nama Pasien'] || '-')}</strong></div>
      <div class="wa-preview">${esc(waAction.message || '')}</div>
      <div class="modal-actions">${options.allowPrint ? '<button id="waPrintLabel" class="secondary-btn">Cetak Label</button>' : ''}<button class="secondary-btn" data-modal-close>Tutup</button><button id="openWhatsApp" class="whatsapp-btn" ${waAction.url ? '' : 'disabled'}>💬 Buka WhatsApp</button></div>`);
    document.getElementById('openWhatsApp')?.addEventListener('click', () => { if (waAction.url) window.open(waAction.url, '_blank', 'noopener'); });
    document.getElementById('waPrintLabel')?.addEventListener('click', () => printRecord(record));
  }


  async function openFailedFollowUps() {
    try { await loadFailedFollowUps(); }
    catch (err) { return ctx.showToast(err.message,'error'); }
    renderFailedFollowUpsModal();
  }

  function renderFailedFollowUpsModal() {
    const rows = state.failedFollowUps || [];
    ctx.openModal(`<div class="modal-head"><div><div class="eyebrow">GAGAL ANTAR</div><h3>Tindak Lanjut Farmasi</h3><p>Satu pendaftaran tetap satu kasus. Pengantaran ulang dibuat sebagai attempt berikutnya.</p></div><button class="modal-x" data-modal-close>×</button></div>
      <div class="redelivery-summary"><strong>${rows.length}</strong><span>kasus menunggu keputusan Farmasi</span></div>
      <div class="redelivery-list">${rows.length ? rows.map(item=>failedFollowUpCard(item)).join('') : '<div class="empty-state"><h3>Tidak ada tindak lanjut</h3><p>Semua gagal antar sudah diselesaikan.</p></div>'}</div>
      <div class="modal-actions"><button class="secondary-btn" data-modal-close>Tutup</button><button id="failedRefresh" class="primary-btn">↻ Segarkan</button></div>`,{wide:true});
    document.getElementById('failedRefresh')?.addEventListener('click',async e=>{buttonBusy(e.currentTarget,true,'Memuat…');try{await loadFailedFollowUps();renderFailedFollowUpsModal();}catch(x){ctx.showToast(x.message,'error')}finally{buttonBusy(e.currentTarget,false)}});
    document.querySelectorAll('[data-return-id]').forEach(b=>b.addEventListener('click',()=>confirmReturned(b.dataset.returnId,b)));
    document.querySelectorAll('[data-reschedule-id]').forEach(b=>b.addEventListener('click',()=>openReschedule(b.dataset.rescheduleId)));
    document.querySelectorAll('[data-close-failed-id]').forEach(b=>b.addEventListener('click',()=>openCloseFailed(b.dataset.closeFailedId)));
  }

  function failedFollowUpCard(item) {
    const a=item.attempt||{}, r=item.record||{};
    const returned=String(a.returnStatus||'')==='SUDAH KEMBALI';
    return `<article class="redelivery-card"><div class="redelivery-head"><div><span class="status-badge failed">GAGAL ANTAR</span>${Number(a.attemptNo||1)>1?` <span class="status-badge warning">ATTEMPT ${Number(a.attemptNo)}</span>`:''}<h4>${esc(r['Nama Pasien']||'-')}</h4><p>No. RM ${esc(r['No RM']||'-')} • ${esc([r['Kelurahan'],r['Kecamatan']].filter(Boolean).join(' • '))}</p></div><div class="return-state ${returned?'ok':'wait'}">${returned?'✓ Obat sudah kembali':'Menunggu obat kembali'}</div></div><div class="redelivery-detail"><div><span>Kurir</span><b>${esc(a.courier||r['Kurir']||'-')}</b></div><div><span>Alasan</span><b>${esc(a.failureReason||r['Alasan Gagal']||'-')}</b></div><div><span>Tindak lanjut Kurir</span><b>${esc(a.failureFollowUp||r['Tindak Lanjut Gagal']||'-')}</b></div><div><span>Waktu gagal</span><b>${esc(a.completedAt||'-')}</b></div></div>${a.failureDetail?`<p class="redelivery-note">${esc(a.failureDetail)}</p>`:''}<div class="row-actions">${!returned?`<button class="primary-btn" data-return-id="${esc(r['ID Sistem']||a.parentId)}">Konfirmasi Obat Kembali</button>`:`<button class="primary-btn" data-reschedule-id="${esc(r['ID Sistem']||a.parentId)}">Jadwalkan Ulang</button><button class="danger-soft-btn" data-close-failed-id="${esc(r['ID Sistem']||a.parentId)}">Tutup Layanan</button>`}</div></article>`;
  }

  async function confirmReturned(id,button){
    const yes=await ctx.confirmAction({title:'Konfirmasi obat sudah kembali?',message:'Pastikan paket obat sudah diterima kembali secara fisik oleh Farmasi sebelum melanjutkan.',confirmLabel:'Ya, Obat Sudah Kembali'});if(!yes)return;
    buttonBusy(button,true,'Menyimpan…');try{await api().confirmReturnedToFarmasi(token(),id);await loadFailedFollowUps();ctx.showToast('Obat dikonfirmasi kembali ke Farmasi.','success');renderFailedFollowUpsModal();}catch(e){ctx.showToast(e.message,'error')}finally{buttonBusy(button,false)}
  }

  function openReschedule(id){
    const item=state.failedFollowUps.find(x=>String(x.record?.['ID Sistem']||x.attempt?.parentId)===String(id));if(!item)return ctx.showToast('Data tidak ditemukan. Segarkan daftar.','error');const r=item.record||{};
    ctx.openModal(`<div class="modal-head"><div><div class="eyebrow">PENGANTARAN ULANG</div><h3>Buat Attempt ${Number(item.attempt?.attemptNo||1)+1}</h3><p>Periksa kembali kontak, alamat, patokan, dan penerima sebelum paket masuk antrean Kurir.</p></div><button class="modal-x" data-modal-close>×</button></div><form id="retryForm">${renderDeliveryFields(r,'retry')}<div class="field" style="margin-top:12px"><label for="retry-note">Catatan penjadwalan ulang <span>opsional</span></label><textarea id="retry-note" rows="2" placeholder="Contoh: pasien meminta diantar besok pagi"></textarea></div><div class="notice-box">Kode penerimaan lama tidak berlaku. Sistem akan membuat kode baru untuk attempt ini.</div><div class="modal-actions"><button class="secondary-btn" type="button" data-modal-close>Batal</button><button id="retrySubmit" class="primary-btn" type="submit">Buat Pengantaran Ulang</button></div></form>`,{wide:true});
    const rm=document.getElementById('retry-rm'),nm=document.getElementById('retry-name');if(rm)rm.readOnly=true;if(nm)nm.readOnly=true;bindAreaSearch('retry');
    document.getElementById('retryForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!validateForm('retry'))return;const btn=document.getElementById('retrySubmit');buttonBusy(btn,true,'Membuat…');try{const payload=formPayload('retry');payload.note=document.getElementById('retry-note')?.value.trim()||'';const res=await api().rescheduleDelivery(token(),id,payload);ctx.closeModal();await Promise.all([loadFailedFollowUps(),loadRows('')]);ctx.showToast(res.message||'Pengantaran ulang dibuat.','success');if(res.data?.waAction)openWhatsAppModal(res.data.waAction,res.data?.record||r,{title:`Pengantaran ulang Attempt ${res.data?.attempt?.attemptNo||''}`});}catch(x){ctx.showToast(x.message,'error')}finally{buttonBusy(btn,false)}});
  }

  function openCloseFailed(id){
    ctx.openModal(`<div class="modal-head"><div><div class="eyebrow">TUTUP LAYANAN</div><h3>Tidak Dilakukan Pengantaran Ulang</h3><p>Status akhir kasus tetap GAGAL ANTAR dan riwayat attempt tetap tersimpan.</p></div><button class="modal-x" data-modal-close>×</button></div><div class="field"><label for="close-failed-note">Alasan / keputusan Farmasi *</label><textarea id="close-failed-note" rows="4" placeholder="Contoh: pasien memilih mengambil mandiri setelah dikonfirmasi"></textarea></div><div id="closeFailedMsg"></div><div class="modal-actions"><button class="secondary-btn" data-modal-close>Batal</button><button id="closeFailedSubmit" class="danger-btn">Tutup Layanan</button></div>`);
    document.getElementById('closeFailedSubmit')?.addEventListener('click',async e=>{const note=document.getElementById('close-failed-note')?.value.trim()||'';if(!note)return ctx.showToast('Catatan penutupan wajib diisi.','error');buttonBusy(e.currentTarget,true,'Menyimpan…');try{await api().closeFailedDelivery(token(),id,note);ctx.closeModal();await loadFailedFollowUps();ctx.showToast('Layanan ditutup. Riwayat gagal antar tetap tersimpan.','success')}catch(x){ctx.showToast(x.message,'error')}finally{buttonBusy(e.currentTarget,false)}});
  }

  function resetForLogout() {
    state.master = {areas:[],manualVerificationMethods:[]}; state.rows = []; state.pending = []; state.failedFollowUps = []; state.lastCreated = null; state.loaded = false; state.loading = null; state.search = '';
    try { sessionStorage.removeItem(APP_CONFIG.farmasiDraftKey); } catch (_) {}
  }

  return { renderHome, renderRegistration, renderToday, renderVerification, renderLabels, resetForLogout };
}
