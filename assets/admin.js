export function createAdminModule(ctx) {
  const state = {loaded:false,summary:{},archive:null,resilience:null,master:{},audit:[],metadata:null,rows:[],search:''};
  let archiveFocusHandler = null;
  let archiveVisibilityHandler = null;
  let archiveRefreshBusy = false;
  let archiveLastAutoCheckAt = 0;
  const esc = ctx.escapeHtml;
  const api = () => ctx.getApi();
  const token = () => ctx.getToken();
  const page = () => document.getElementById('pageContent');
  const statusOptions = ['MENUNGGU DIPROSES','SIAP DIANTAR','DALAM PERJALANAN','TERKIRIM','GAGAL ANTAR'];

  function resetForLogout() {
    Object.assign(state,{loaded:false,summary:{},archive:null,resilience:null,master:{},audit:[],metadata:null,rows:[],search:''});
    detachArchiveAutoHealth_();
  }

  function fmt(value) { return esc(value || '-'); }
  function packageCode(record) { return record?.['Kode Paket'] || record?.__packageCode || record?.['ID Sistem'] || '-'; }
  function statusClass(status) {
    if (status === 'TERKIRIM') return 'delivered';
    if (status === 'GAGAL ANTAR') return 'failed';
    if (status === 'DALAM PERJALANAN') return 'transit';
    if (status === 'SIAP DIANTAR') return 'ready';
    if (status === 'MENUNGGU DIPROSES') return 'waiting';
    return 'neutral';
  }
  function badge(text,kind='neutral') { return `<span class="status-badge ${kind}">${esc(text || '-')}</span>`; }
  function metric(label,value,note='') { return `<div class="card metric-card"><div class="metric-top"><span>${esc(label)}</span></div><div class="metric-value">${esc(value)}</div>${note?`<div class="metric-note">${esc(note)}</div>`:''}</div>`; }
  function countArray(value) { return Array.isArray(value) ? value.length : 0; }
  function fmtDateTime(value) { if (!value) return '-'; const d = new Date(value); return Number.isNaN(d.getTime()) ? esc(value) : esc(new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(d)); }
  function backupKindLabel(kind) { return ({DAILY:'Harian',MONTHLY:'Bulanan',PRECHANGE:'Sebelum Perubahan',RECOVERY:'Pemulihan'})[kind] || kind || '-'; }

  function archiveMounted_() { return Boolean(document.getElementById('archiveBody')); }
  function restoreScroll_(x,y) { requestAnimationFrame(() => window.scrollTo(x,y)); }
  function detachArchiveAutoHealth_() {
    if (archiveFocusHandler) window.removeEventListener('focus',archiveFocusHandler);
    if (archiveVisibilityHandler) document.removeEventListener('visibilitychange',archiveVisibilityHandler);
    archiveFocusHandler = null;
    archiveVisibilityHandler = null;
  }
  function attachArchiveAutoHealth_() {
    detachArchiveAutoHealth_();
    const run = () => {
      if (!archiveMounted_() || document.hidden) return;
      const now = Date.now();
      if (now - archiveLastAutoCheckAt < 1500) return;
      archiveLastAutoCheckAt = now;
      refreshResilienceState_({silent:true,preserveScroll:true}).catch(() => {});
    };
    archiveFocusHandler = run;
    archiveVisibilityHandler = run;
    window.addEventListener('focus',archiveFocusHandler);
    document.addEventListener('visibilitychange',archiveVisibilityHandler);
  }


  function masterSheetLabel(name) {
    const map = {'MASTER_DATA':'Master Data','AKSES':'Akun & PIN','MASTER_WILAYAH':'Wilayah Layanan'};
    return map[name] || name || '-';
  }
  function systemSheetLabel(name) {
    const map = {'MASTER_DATA':'Master Data','AKSES':'Akun & PIN','MASTER_WILAYAH':'Wilayah Layanan','KENDALA':'Kendala Kurir','KENDALA_KURIR':'Kendala Kurir','LOG_AKTIVITAS':'Audit Aktivitas','DELIVERY_META':'Metadata Pengantaran','DATABASE':'Database Transaksi','DELIVERY_ATTEMPTS':'Riwayat Pengantaran'};
    return map[name] || name || '-';
  }

  function requestAdminPin_({title='Konfirmasi tindakan sensitif',message='Masukkan PIN Admin untuk memastikan tindakan ini memang Anda kehendaki.',confirmLabel='Ya, Lanjutkan'}={}) {
    return new Promise(resolve => {
      ctx.openModal(`<div class="modal-head"><div><div class="eyebrow">KONFIRMASI ADMIN</div><h3>${esc(title)}</h3><p>${esc(message)}</p></div><button class="modal-x" id="sensitivePinClose">×</button></div>
        <div class="system-alert warning compact-alert"><strong>Data sensitif</strong><span>Gunakan PIN Admin yang sama dengan saat login. PIN hanya diminta ulang sebagai pengingat sebelum tindakan penting.</span></div>
        <div class="field"><label for="sensitiveAdminPin">PIN Admin <b>*</b></label><input id="sensitiveAdminPin" type="password" inputmode="numeric" autocomplete="off" placeholder="Masukkan PIN Admin"></div>
        <div id="sensitivePinMsg"></div><div class="modal-actions"><button id="sensitivePinCancel" class="secondary-btn">Batal</button><button id="sensitivePinOk" class="warning-btn">${esc(confirmLabel)}</button></div>`);
      let done = false;
      const finish = value => { if (done) return; done = true; ctx.closeModal(); resolve(value); };
      document.getElementById('sensitivePinClose')?.addEventListener('click',() => finish(null));
      document.getElementById('sensitivePinCancel')?.addEventListener('click',() => finish(null));
      const submit = () => {
        const pin = String(document.getElementById('sensitiveAdminPin')?.value || '').trim();
        if (!pin) { document.getElementById('sensitivePinMsg').innerHTML = '<div class="alert error">PIN Admin wajib diisi.</div>'; return; }
        finish(pin);
      };
      document.getElementById('sensitivePinOk')?.addEventListener('click',submit);
      document.getElementById('sensitiveAdminPin')?.addEventListener('keydown',event => { if (event.key === 'Enter') submit(); });
      setTimeout(() => document.getElementById('sensitiveAdminPin')?.focus(),30);
    });
  }

  async function bootstrap(force=false) {
    if (state.loaded && !force) return state;
    const response = await api().adminBootstrap(token());
    const data = response.data || {};
    state.summary = data.summary || {};
    state.archive = data.archive || null;
    state.resilience = data.resilience || null;
    state.master = data.master || {};
    state.audit = data.audit || [];
    state.metadata = data.metadata || null;
    state.loaded = true;
    return state;
  }

  async function renderHome() {
    page().innerHTML = `<section class="hero compact"><div><div class="eyebrow">ADMIN DATA</div><h1>Pusat Pemeliharaan Data</h1><p>Koreksi data, arsip, master, dan audit dalam satu tempat.</p></div><div class="hero-actions"><button id="adminHomeRefresh" class="secondary-btn">↻ Segarkan</button></div></section><section class="section" id="adminHomeBody"><div class="inline-loading">Memuat…</div></section>`;
    document.getElementById('adminHomeRefresh')?.addEventListener('click',async event => {
      event.currentTarget.disabled = true;
      try { await bootstrap(true); drawHome(); ctx.showToast('Data Admin diperbarui.','success'); }
      catch (error) { ctx.showToast(error.message,'error'); }
      finally { event.currentTarget.disabled = false; }
    });
    try { await bootstrap(true); drawHome(); }
    catch (error) { document.getElementById('adminHomeBody').innerHTML = `<div class="alert error">${esc(error.message)}</div>`; }
  }

  function drawHome() {
    const root = document.getElementById('adminHomeBody');
    if (!root) return;
    const s = state.summary || {};
    const missing = Number(s.missingMetadata || 0);
    root.innerHTML = `<div class="grid grid-4">${metric('Data Aktif',Number(s.activeRecords||0),'Masih dalam proses')}${metric('Metadata',Number(s.metadataRecords||0),missing?`${missing} perlu perhatian`:'Sinkron')}${metric('Riwayat Pengantaran',Number(s.deliveryHistoryRecords||0),'Catatan perjalanan pengiriman')}${metric('Audit',Number(s.auditRecords||0),'Aktivitas tercatat')}</div>
      ${missing?`<div class="system-alert warning"><strong>Metadata perlu perhatian</strong><span>${missing} data belum lengkap. Jalankan pemeriksaan metadata sebelum melakukan perubahan besar.</span></div>`:''}
      ${drawBackupHomeAlert_()}
      <div class="admin-action-grid clean-admin-actions">
        <button data-go="corrections" class="admin-action-card"><b>✎ Koreksi Data</b><span>Cari data dan perbaiki status bila terjadi salah input.</span></button>
        <button data-go="archive" class="admin-action-card"><b>▣ Arsip</b><span>Periksa kesehatan arsip dan antrean pemeliharaan.</span></button>
        <button data-go="master" class="admin-action-card"><b>◆ Master</b><span>Lihat ringkasan konfigurasi aktif.</span></button>
        <button data-go="audit" class="admin-action-card"><b>≡ Audit</b><span>Telusuri jejak perubahan dan aktivitas.</span></button>
      </div>`;
    root.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click',() => ctx.navigate(button.dataset.go)));
  }

  function drawBackupHomeAlert_() {
    const r = state.resilience || {};
    if (!r || !Object.keys(r).length) return `<div class="system-alert warning"><strong>Backup Master belum dikonfigurasi</strong><span>Buka menu Arsip untuk mengaktifkan backup otomatis.</span></div>`;
    const missing = Array.isArray(r.structure?.missing) ? r.structure.missing.length : 0;
    const dataIssues = Array.isArray(r.dataHealth?.issues) ? r.dataHealth.issues.length : 0;
    const safe = String(r.status || '') === 'AMAN' && missing === 0 && dataIssues === 0;
    const last = r.lastDaily ? fmtDateTime(r.lastDaily.createdAt) : 'Belum tersedia';
    if (!safe) {
      const parts = [];
      if (missing) parts.push(`${missing} sheet sistem perlu dipulihkan`);
      if (dataIssues) parts.push(`${dataIssues} data perlu diperiksa`);
      if (!parts.length) parts.push('backup atau proteksi perlu perhatian');
      return `<div class="system-alert warning"><strong>Ketahanan Data perlu perhatian</strong><span>${esc(parts.join(' • '))}. Buka menu Arsip untuk langkah pemulihan. Backup harian terakhir: ${last}.</span></div>`;
    }
    return `<div class="system-alert success"><strong>Ketahanan Data: AMAN</strong><span>Struktur, data, dan backup otomatis dalam kondisi baik. Backup harian terakhir: ${last}.</span></div>`;
  }

  async function renderCorrections() {
    page().innerHTML = `<section class="hero compact"><div><div class="eyebrow">KOREKSI DATA</div><h1>Temukan Data yang Perlu Diperbaiki</h1><p>Gunakan Kode Paket, No. RM, nama pasien, ID Sistem, status, atau nama Kurir.</p></div></section>
      <section class="section"><div class="toolbar-card"><div class="search-box"><span>⌕</span><input id="adminSearch" placeholder="Contoh: A00025, No. RM, nama pasien…" value="${esc(state.search)}"></div><button id="adminSearchBtn" class="secondary-btn">Cari</button></div><div id="adminRowsBox" class="content-card"><div class="inline-loading">Memuat data…</div></div></section>`;
    document.getElementById('adminSearchBtn')?.addEventListener('click',loadRows);
    document.getElementById('adminSearch')?.addEventListener('keydown',event => { if (event.key === 'Enter') loadRows(); });
    await loadRows();
  }

  async function loadRows() {
    state.search = document.getElementById('adminSearch')?.value || state.search || '';
    const box = document.getElementById('adminRowsBox');
    if (box) box.innerHTML = '<div class="inline-loading">Memuat data…</div>';
    try {
      const response = await api().adminRows(token(),state.search);
      state.rows = response.data?.rows || [];
      drawRows();
    } catch (error) {
      if (box) box.innerHTML = `<div class="alert error">${esc(error.message)}</div>`;
    }
  }

  function drawRows() {
    const box = document.getElementById('adminRowsBox');
    if (!box) return;
    if (!state.rows.length) {
      box.innerHTML = '<div class="empty-state"><h3>Data tidak ditemukan</h3><p>Periksa kata pencarian lalu coba kembali.</p></div>';
      return;
    }
    box.innerHTML = `<div class="table-scroll"><table class="data-table responsive-table admin-correction-table"><thead><tr><th>Kode Paket</th><th>Pasien</th><th>Status</th><th>Kurir</th><th>Aksi</th></tr></thead><tbody>${state.rows.map(record => `<tr><td data-label="Kode Paket"><strong class="package-code">${esc(packageCode(record))}</strong><span class="cell-sub">${fmt(record['ID Sistem'])}</span></td><td data-label="Pasien"><strong>${fmt(record['Nama Pasien'])}</strong><span class="cell-sub">RM ${fmt(record['No RM'])} • ${fmt(record['Kelurahan'])}</span></td><td data-label="Status">${badge(record['Status'],statusClass(record['Status']))}</td><td data-label="Kurir">${fmt(record['Kurir'])}</td><td data-label="Aksi"><div class="row-actions"><button class="mini-btn" data-history="${esc(record['ID Sistem'])}">Riwayat</button><button class="mini-btn primary-soft" data-correct="${esc(record['ID Sistem'])}">Koreksi</button></div></td></tr>`).join('')}</tbody></table></div>`;
    box.querySelectorAll('[data-history]').forEach(button => button.addEventListener('click',() => openHistory(button.dataset.history)));
    box.querySelectorAll('[data-correct]').forEach(button => button.addEventListener('click',() => openCorrection(button.dataset.correct)));
  }

  async function openHistory(id) {
    try {
      const response = await api().deliveryHistory(token(),id);
      const rows = response.data?.rows || [];
      ctx.openModal(`<div class="modal-head"><div><div class="eyebrow">RIWAYAT PENGANTARAN</div><h3>${esc(state.rows.find(item => item['ID Sistem'] === id)?.['Nama Pasien'] || packageCode(state.rows.find(item => item['ID Sistem'] === id)))}</h3></div><button class="modal-x" data-modal-close>×</button></div><div class="attempt-timeline">${rows.length?rows.map(item => `<article><span class="attempt-no">${Number(item.attemptNo||1)}</span><div><div>${badge(item.result || item.status || '-',item.result==='TERKIRIM'?'delivered':item.result==='GAGAL ANTAR'?'failed':'neutral')}</div><h4>Pengantaran ke-${Number(item.attemptNo||1)}${item.courier?` • ${esc(item.courier)}`:''}</h4><p>${esc(item.claimedAt || item.readyAt || '-')} → ${esc(item.completedAt || 'Belum selesai')}</p>${item.failureReason?`<small>Alasan gagal: ${esc(item.failureReason)}</small>`:''}${item.returnStatus?`<small>Pengembalian obat: ${esc(item.returnStatus)}</small>`:''}</div></article>`).join(''):'<div class="empty-state"><p>Belum ada riwayat pengantaran.</p></div>'}</div><div class="modal-actions"><button class="primary-btn" data-modal-close>Tutup</button></div>`,{wide:true});
    } catch (error) { ctx.showToast(error.message,'error'); }
  }

  function openCorrection(id) {
    const record = state.rows.find(item => item['ID Sistem'] === id);
    if (!record) return;
    ctx.openModal(`<div class="modal-head"><div><div class="eyebrow">KOREKSI DATA</div><h3>${fmt(record['Nama Pasien'])}</h3><p>${esc(packageCode(record))}</p></div><button class="modal-x" data-modal-close>×</button></div>
      <div class="correction-compare"><div><span>Status Saat Ini</span><strong>${esc(record['Status'] || '-')}</strong></div><div class="correction-arrow">→</div><div><span>Status Baru</span><select id="adminNewStatus">${statusOptions.map(status => `<option value="${status}" ${status===record['Status']?'selected':''}>${status}</option>`).join('')}</select></div></div>
      <div class="field"><label for="adminCorrectionNote">Alasan koreksi <b>*</b></label><textarea id="adminCorrectionNote" rows="3" placeholder="Jelaskan mengapa data perlu dikoreksi"></textarea></div>
      <div class="system-alert warning compact-alert"><strong>Konfirmasi tindakan sensitif</strong><span>Koreksi akan mengubah data pelayanan dan tercatat permanen pada Audit. Masukkan PIN Admin yang sama dengan saat login.</span></div>
      <div class="field"><label for="adminCorrectionPin">PIN Admin <b>*</b></label><input id="adminCorrectionPin" type="password" inputmode="numeric" autocomplete="off" placeholder="Masukkan PIN Admin"></div>
      <div id="adminCorrectionMsg"></div><div class="modal-actions"><button class="secondary-btn" data-modal-close>Batal</button><button id="adminCorrectionSave" class="warning-btn">Simpan Koreksi</button></div>`);
    document.getElementById('adminCorrectionSave')?.addEventListener('click',async() => {
      const button = document.getElementById('adminCorrectionSave');
      const status = document.getElementById('adminNewStatus').value;
      const note = document.getElementById('adminCorrectionNote').value.trim();
      const pin = document.getElementById('adminCorrectionPin').value.trim();
      if (!note) { document.getElementById('adminCorrectionMsg').innerHTML = '<div class="alert error">Alasan koreksi wajib diisi.</div>'; return; }
      if (!pin) { document.getElementById('adminCorrectionMsg').innerHTML = '<div class="alert error">Masukkan PIN Admin untuk melanjutkan.</div>'; return; }
      button.disabled = true;
      try {
        await api().adminUpdateStatus(token(),id,status,note,pin);
        ctx.closeModal();
        ctx.showToast('Koreksi data berhasil disimpan dan dicatat pada Audit.','success');
        await loadRows();
      } catch (error) {
        document.getElementById('adminCorrectionMsg').innerHTML = `<div class="alert error">${esc(error.message)}</div>`;
        button.disabled = false;
      }
    });
  }

  async function renderArchive() {
    page().innerHTML = `<section class="hero compact"><div><div class="eyebrow">ARSIP & BACKUP</div><h1>Ketahanan Data</h1><p>Pantau arsip, backup otomatis, dan siapkan salinan pemulihan tanpa mengubah Master aktif.</p></div><div class="hero-actions"><button id="archiveRefresh" class="secondary-btn">↻ Segarkan</button></div></section><section class="section" id="archiveBody"><div class="inline-loading">Memuat…</div></section>`;
    const load = async() => {
      try {
        const resilienceResponse = await api().adminResilienceHealth(token());
        state.resilience = resilienceResponse.data?.health || null;
        state.archive = {unavailable:true,error:'Informasi arsip sedang dimuat. Bagian Backup & Pemulihan sudah dapat digunakan.'};
        drawArchive();
        try {
          const archiveResponse = await api().adminArchiveHealth(token());
          state.archive = archiveResponse.data?.health || null;
        } catch (archiveError) {
          state.archive = {unavailable:true,error:String(archiveError?.message || 'Informasi arsip sementara tidak tersedia.')};
        }
        drawArchive();
      } catch (error) { document.getElementById('archiveBody').innerHTML = `<div class="alert error">${esc(error.message)}</div>`; }
    };
    document.getElementById('archiveRefresh')?.addEventListener('click',load);
    await load();
    attachArchiveAutoHealth_();
  }

  function drawArchive() {
    const root = document.getElementById('archiveBody');
    if (!root) return;
    const a = state.archive || {};
    const queue = a.queue || {};
    const config = a.config || {};
    const archiveUnavailable = a.unavailable === true;
    const r = state.resilience || {};
    const counts = r.counts || {};
    const trigger = r.trigger || {};
    const checkpoint = r.checkpoint || {};
    const lastDaily = r.lastDaily || null;
    const lastMonthly = r.lastMonthly || null;
    const backupStatus = String(r.status || 'BELUM SIAP');
    const recent = Array.isArray(r.recent) ? r.recent : [];
    const recoveryRecent = Array.isArray(r.recoveryRecent) ? r.recoveryRecent : [];
    const warnings = Array.isArray(r.warnings) ? r.warnings : [];
    const secondary = r.secondary || {};
    const protection = r.protection || {};
    const structure = r.structure || {};
    const missingSheets = Array.isArray(structure.missing) ? structure.missing : [];
    const dataHealth = r.dataHealth || {};
    const dataIssues = Array.isArray(dataHealth.issues) ? dataHealth.issues : [];
    const lastRecovery = r.lastRecovery || null;
    const lastRestore = r.lastMasterRestore || null;
    const lastSystemRestore = r.lastSystemRestore || null;
    const lastCellRestore = r.lastCellRestore || null;
    const lastContentRestore = r.lastContentRestore || null;
    const recoverableSheets = Array.isArray(r.recoverableMasterSheets) ? r.recoverableMasterSheets : [];
    const masterFile = structure.file || {};

    const recoverySummary = lastRecovery ? `<div class="content-card recovery-status-card"><div class="card-head-row"><div><span class="eyebrow">SALINAN PEMULIHAN TERAKHIR</span><h3>✓ Siap diperiksa</h3><p>Salinan ini tidak mengubah Master aktif.</p></div>${lastRecovery.recoveryUrl?`<button class="mini-btn" id="openLastRecovery">Buka Salinan</button>`:''}</div><div class="recovery-facts"><div><span>Sumber</span><strong>${esc(lastRecovery.sourceName || '-')}</strong></div><div><span>Dibuat</span><strong>${fmtDateTime(lastRecovery.at)}</strong></div><div><span>Oleh</span><strong>${esc(lastRecovery.actor || '-')}</strong></div><div><span>Nama salinan</span><strong class="backup-file-name">${esc(lastRecovery.recoveryName || '-')}</strong></div></div></div>` : '';
    const restoreSummary = [
      lastRestore ? `<div class="system-alert success"><strong>Pemulihan Master terakhir berhasil</strong><span>${fmtDateTime(lastRestore.at)} • ${esc((lastRestore.sheets || []).map(masterSheetLabel).join(', ') || '-')}</span></div>` : '',
      lastSystemRestore ? `<div class="system-alert success"><strong>Pemulihan sheet sistem terakhir berhasil</strong><span>${fmtDateTime(lastSystemRestore.at)} • ${esc((lastSystemRestore.sheet || (lastSystemRestore.sheets||[]).join(', ')) || '-')}</span></div>` : '',
      lastCellRestore ? `<div class="system-alert success"><strong>Pemulihan cell terakhir berhasil</strong><span>${fmtDateTime(lastCellRestore.at)} • ${esc(lastCellRestore.sheet || '-')} • ${esc((lastCellRestore.cells||[]).join(', '))}</span></div>` : '',
      lastContentRestore ? `<div class="system-alert success"><strong>Pemulihan isi sheet terakhir berhasil</strong><span>${fmtDateTime(lastContentRestore.at)} • ${esc(systemSheetLabel(lastContentRestore.sheet || '-'))} • ${Number(lastContentRestore.restoredRows||0)} data dikembalikan</span></div>` : ''
    ].join('');

    const fileStateBlock = masterFile.trashed ? `<div class="content-card structure-health-card warning-card"><div class="card-head-row"><div><span class="eyebrow">FILE MASTER</span><h3>⚠ File Master berada di Sampah Drive</h3><p>Pulihkan file asli terlebih dahulu. Ini lebih aman daripada membuat Master baru dari backup.</p></div><button id="restoreProductionTrash" class="warning-btn">Pulihkan File Asli</button></div></div>` : '';
    const structureCard = `<div class="content-card structure-health-card ${missingSheets.length?'warning-card':''}"><div class="card-head-row"><div><span class="eyebrow">KESEHATAN STRUKTUR</span><h3>${missingSheets.length?`⚠ ${missingSheets.length} sheet sistem perlu dipulihkan`:'✓ Struktur sistem lengkap'}</h3><p>${missingSheets.length?'Sheet wajib yang hilang harus dipulihkan sebelum fungsi terkait digunakan.':'Semua sheet sistem kritis tersedia.'}</p></div><button id="refreshStructureHealth" class="mini-btn">Periksa Ulang</button></div><div class="protection-summary"><div><span>Status</span><strong>${missingSheets.length?'PERLU PEMULIHAN':'AMAN'}</strong></div><div><span>Sheet wajib</span><strong>${Number(structure.found||0)} / ${Number(structure.total||0)}</strong></div><div><span>Sheet hilang</span><strong>${missingSheets.length}</strong></div></div>${missingSheets.length?`<div class="structure-issue-list">${missingSheets.map(item=>{
      const source=item.recommendedSource||null;
      const critical=String(item.severity||'')==='CRITICAL';
      const action=source ? (critical ? `<button class="mini-btn danger-soft" data-emergency-restore="${esc(source.id)}" data-missing-sheet="${esc(item.name)}">Buka Pemulihan Darurat</button>` : `<button class="mini-btn warning-soft" data-restore-missing="${esc(item.name)}" data-source-id="${esc(source.id)}">Pulihkan Sheet Sistem</button>`) : '<span class="status-badge failed">Backup sehat tidak ditemukan</span>';
      return `<div class="structure-issue"><div><strong>${esc(systemSheetLabel(item.name))}</strong><span>${esc(item.name)} • ${critical?'data transaksi kritis':'sheet sistem'}${source?` • sumber: ${esc(source.name)}`:''}</span></div>${action}</div>`;
    }).join('')}</div>`:''}</div>`;

    const dataHealthCard = `<div class="content-card data-health-card ${dataIssues.length?'warning-card':''}"><div class="card-head-row"><div><span class="eyebrow">KESEHATAN DATA</span><h3>${dataIssues.length?`⚠ ${dataIssues.length} data perlu diperiksa`:'✓ Data tidak menunjukkan kehilangan yang terdeteksi'}</h3><p>${dataIssues.length?'Sistem membandingkan kondisi aktif dengan cadangan sebelumnya untuk mendeteksi kehilangan data yang tidak wajar.':'Tidak ada penurunan data tidak wajar yang terdeteksi dari pemeriksaan otomatis.'}</p></div><button id="refreshDataHealth" class="mini-btn">Periksa Ulang</button></div>${dataIssues.length?`<div class="structure-issue-list">${dataIssues.map(item=>{
      const source=item.recommendedSource||null;
      const critical=String(item.severity||'')==='CRITICAL';
      const action=source ? (critical ? `<button class="mini-btn danger-soft" data-emergency-restore="${esc(source.id)}" data-data-issue="${esc(item.name)}">Pemulihan Darurat</button>` : `<button class="mini-btn warning-soft" data-restore-content="${esc(item.name)}" data-source-id="${esc(source.id)}">Pulihkan Isi</button>`) : '<span class="status-badge failed">Backup Sehat Terakhir tidak ditemukan</span>';
      return `<div class="structure-issue"><div><strong>${esc(systemSheetLabel(item.name))}</strong><span>Data sekarang: ${Number(item.currentRows||0)} • Backup Sehat Terakhir: ${Number(item.backupRows||0)}${source?` • ${esc(source.name)}`:''}</span><small>${esc(item.message||'Data perlu diperiksa.')}</small></div>${action}</div>`;
    }).join('')}</div>`:''}</div>`;

    const criticalStructureIssues = missingSheets.filter(item=>String(item.severity||'')==='CRITICAL');
    const criticalDataIssues = dataIssues.filter(item=>String(item.severity||'')==='CRITICAL');
    const emergencyNeeded = criticalStructureIssues.length || criticalDataIssues.length;
    const emergencyCard = `<div class="content-card emergency-recovery-card ${emergencyNeeded?'danger-card':''}"><div class="card-head-row"><div><span class="eyebrow">PEMULIHAN DARURAT</span><h3>${emergencyNeeded?'🚨 Data transaksi kritis perlu pemulihan':'✓ Tidak ada kondisi darurat'}</h3><p>${emergencyNeeded?'Gunakan hanya untuk DATABASE atau komponen transaksi kritis. Pemulihan dilakukan sebagai satu bundle agar relasi data tetap konsisten.':'DATABASE dan komponen transaksi kritis terdeteksi dalam kondisi tersedia.'}</p></div></div>${emergencyNeeded?`<div class="system-alert warning compact-alert"><strong>Jangan lanjutkan perubahan transaksi bila memungkinkan.</strong><span>Gunakan sumber yang direkomendasikan sistem dan periksa hasil consistency check setelah pemulihan.</span></div>`:''}</div>`;

    const sourceOptions = recent.map(item=>`<option value="${esc(item.id)}">${esc(backupKindLabel(item.kind))} • ${esc(item.name)}</option>`).join('');

    root.innerHTML = `
      <div class="admin-section-title"><div><span class="eyebrow">ARSIP TRANSAKSI</span><h2>Retensi & Arsip Tahunan</h2></div></div>
      ${archiveUnavailable?`<div class="system-alert warning"><strong>Informasi arsip sementara tidak tersedia</strong><span>${esc(a.error || 'Pemulihan data mungkin sedang diperlukan. Bagian Backup & Pemulihan di bawah tetap dapat digunakan.')}</span></div>`:''}
      <div class="grid grid-4">${metric('Retensi',`${Number(config.retentionDays||120)} hari`,'Data aktif')}${metric('Menunggu Arsip',Number(queue.waiting||0),'Antrean')}${metric('Gagal Arsip',Number(queue.failed||0),'Perlu perhatian')}${metric('Tahun Arsip',Number(a.registry?.length||a.years?.length||0),'Terdeteksi')}</div>
      <div class="content-card technical-panel"><h3>Informasi Arsip</h3><pre>${esc(JSON.stringify({config:a.config||{},queue:a.queue||{},lastRun:a.lastRun||a.lastArchiveRun||null},null,2))}</pre></div>

      <div class="admin-section-title resilience-heading"><div><span class="eyebrow">BACKUP & PEMULIHAN</span><h2>Ketahanan Data</h2><p>30 backup harian, 12 backup bulanan, dan checkpoint transaksi setiap ${Number(r.config?.checkpointEveryHours||2)} jam dengan ${Number(r.config?.checkpointKeep||12)} salinan terbaru.</p></div><div class="admin-section-actions"><button id="backupNow" class="primary-btn">Backup Master Sekarang</button>${trigger.installed&&checkpoint.trigger?.installed?'':`<button id="backupSchedule" class="secondary-btn">Aktifkan Jadwal Otomatis</button>`}</div></div>
      <div class="grid grid-4">
        ${metric('Status Backup',backupStatus,trigger.installed?'Otomatis aktif':'Trigger belum aktif')}
        ${metric('Backup Harian',Number(counts.daily||0),lastDaily?`Terakhir ${fmtDateTime(lastDaily.createdAt)}`:'Belum tersedia')}
        ${metric('Backup Bulanan',Number(counts.monthly||0),lastMonthly?`Terakhir ${fmtDateTime(lastMonthly.createdAt)}`:'Belum tersedia')}
        ${metric('Checkpoint Transaksi',Number(counts.checkpoint||0),checkpoint.last?`Terakhir ${fmtDateTime(checkpoint.last.createdAt)}`:'Belum tersedia')}
      </div>
      ${warnings.length?`<div class="system-alert warning"><strong>Ketahanan data perlu perhatian</strong><span>${warnings.map(esc).join(' • ')}</span></div>`:`<div class="system-alert success"><strong>Backup dan checkpoint aman</strong><span>Cadangan otomatis tersedia dan struktur sistem lengkap.</span></div>`}
      <div class="content-card resilience-config-card"><div class="resilience-config-row"><div><span>Backup penuh</span><strong>${esc(trigger.schedule || '-')}</strong></div><div><span>Checkpoint transaksi</span><strong>${esc(checkpoint.trigger?.schedule || '-')}</strong></div><div><span>Retensi</span><strong>${Number(r.config?.dailyKeep||30)} harian • ${Number(r.config?.monthlyKeep||12)} bulanan • ${Number(r.config?.checkpointKeep||12)} checkpoint</strong></div><div><span>Cadangan lokasi kedua</span><strong>${secondary.configured?(secondary.error?'Perlu perhatian':'Aktif'):'Belum dikonfigurasi'}</strong></div>${r.folders?.root?.url?`<button id="openBackupFolder" class="mini-btn">Buka Folder Backup</button>`:''}</div></div>

      <div class="content-card protection-card"><div class="card-head-row"><div><span class="eyebrow">KEAMANAN MASTER</span><h3>Proteksi Edit Manual</h3><p>Proteksi membatasi perubahan langsung pada sheet sistem. Backup dan pemulihan tetap menjadi perlindungan utama bila terjadi salah hapus.</p></div><button id="applyMasterProtection" class="secondary-btn">${String(protection.status||'')==='AMAN'?'Periksa / Terapkan Ulang':'Perbaiki Proteksi'}</button></div><div class="protection-summary"><div><span>Status</span><strong>${esc(protection.status || 'BELUM DIPERIKSA')}</strong></div><div><span>Sheet terlindungi</span><strong>${Number(protection.protected||0)} / ${Number(protection.total||0)}</strong></div><div><span>Perlu perhatian</span><strong>${Number((protection.unprotected||[]).length + (protection.missing||[]).length)}</strong></div></div>${(protection.unprotected||[]).length?`<div class="alert warning">Belum terlindungi: ${esc(protection.unprotected.join(', '))}</div>`:''}</div>

      ${fileStateBlock}
      ${structureCard}
      ${dataHealthCard}
      ${emergencyCard}
      ${recoverySummary}
      ${restoreSummary}

      <div class="content-card cell-recovery-card"><div class="card-head-row"><div><span class="eyebrow">PEMULIHAN CELL / FIELD</span><h3>Bandingkan Master dengan Backup</h3><p>Gunakan bila satu nilai di Master tidak sengaja terhapus. Sistem hanya menawarkan cell yang sekarang kosong tetapi pada backup berisi data.</p></div></div>${recent.length?`<div class="cell-recovery-controls"><select id="cellRecoverySource">${sourceOptions}</select><select id="cellRecoverySheet">${recoverableSheets.map(name=>`<option value="${esc(name)}">${esc(masterSheetLabel(name))}</option>`).join('')}</select><button id="compareMasterCells" class="secondary-btn">Bandingkan</button></div>`:`<div class="empty-state"><p>Belum ada backup untuk dibandingkan.</p></div>`}</div>

      <div class="content-card"><div class="card-head-row"><div><h3>Backup Terbaru</h3><p>Maksimal 12 backup terbaru ditampilkan.</p></div></div>${recent.length?`<div class="table-scroll"><table class="data-table responsive-table"><thead><tr><th>Jenis</th><th>Nama File</th><th>Dibuat</th><th>Aksi</th></tr></thead><tbody>${recent.map(item=>`<tr><td data-label="Jenis"><strong>${esc(backupKindLabel(item.kind))}</strong></td><td data-label="Nama File"><span class="backup-file-name">${esc(item.name)}</span></td><td data-label="Dibuat">${fmtDateTime(item.createdAt)}</td><td data-label="Aksi"><div class="row-actions">${item.url?`<button class="mini-btn" data-open-backup="${esc(item.url)}">Buka</button>`:''}<button class="mini-btn primary-soft" data-recovery="${esc(item.id)}" data-recovery-name="${esc(item.name)}">Siapkan Salinan</button><button class="mini-btn warning-soft" data-restore-master="${esc(item.id)}" data-restore-name="${esc(item.name)}">Pulihkan Master</button></div></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state"><h3>Belum ada backup</h3></div>'}</div>

      ${recoveryRecent.length?`<div class="content-card"><div class="card-head-row"><div><h3>Salinan Pemulihan Terbaru</h3><p>Salinan pemeriksaan terpisah dari Master aktif.</p></div></div><div class="recovery-list">${recoveryRecent.map(item=>`<div class="recovery-list-item"><div><strong class="backup-file-name">${esc(item.name)}</strong><span>${fmtDateTime(item.createdAt)}</span></div>${item.url?`<button class="mini-btn" data-open-recovery="${esc(item.url)}">Buka</button>`:''}</div>`).join('')}</div></div>`:''}


      <div class="content-card recovery-guide-card"><div class="card-head-row"><div><span class="eyebrow">PANDUAN PEMULIHAN CEPAT</span><h3>Apa masalah yang terjadi?</h3><p>Pilih situasi yang paling sesuai. Dashboard ini menjadi panduan utama Admin Data saat terjadi masalah.</p></div></div><div class="recovery-guide-grid">
        <details open><summary>Satu cell/field Master terhapus</summary><ol><li>Jangan melakukan perubahan lain pada cell tersebut.</li><li>Buka <b>Bandingkan Master dengan Backup</b>.</li><li>Pilih backup sebelum kesalahan.</li><li>Klik <b>Bandingkan</b> dan centang hanya cell yang ingin dikembalikan.</li><li>Masukkan PIN Admin. Sistem membuat backup pengaman sebelum pemulihan.</li><li>Ulangi <b>Bandingkan Master dengan Backup</b> untuk memastikan cell yang dipulihkan tidak lagi ditawarkan.</li></ol></details>
        <details><summary>Satu sheet sistem seperti KENDALA_KURIR terhapus</summary><ol><li>Jangan membuat sheet pengganti manual.</li><li>Lihat bagian <b>Kesehatan Struktur</b>.</li><li>Klik <b>Pulihkan Sheet Sistem</b> pada sheet yang hilang.</li><li>Masukkan PIN Admin.</li><li>Setelah selesai, periksa kembali <b>Kesehatan Struktur</b> dan <b>Proteksi Edit Manual</b>.</li></ol></details>
        <details><summary>Sheet ada tetapi isi datanya hilang/kosong</summary><ol><li>Lihat bagian <b>Kesehatan Data</b>.</li><li>Periksa jumlah data sekarang dan <b>Backup Sehat Terakhir</b>.</li><li>Klik <b>Pulihkan Isi</b>.</li><li>Masukkan PIN Admin.</li><li>Sistem menggabungkan data lama berdasarkan ID tanpa menghapus data baru.</li><li>Periksa kembali <b>Kesehatan Data</b>.</li></ol></details>
        <details><summary>DATABASE / riwayat transaksi terhapus</summary><ol><li>Hentikan perubahan transaksi bila memungkinkan.</li><li>Buka bagian <b>Pemulihan Darurat</b>.</li><li>Periksa <b>Checkpoint Transaksi</b> dan sumber yang direkomendasikan.</li><li>Jalankan <b>Pemulihan Darurat</b>.</li><li>Periksa hasil consistency check dan gap waktu terhadap checkpoint.</li></ol></details>
        <details><summary>File Master masuk Sampah Drive</summary><ol><li>Buka bagian <b>Kesehatan Struktur</b> dan pastikan status file terdeteksi.</li><li>Jika tombol <b>Pulihkan File Asli</b> tersedia, gunakan tombol tersebut dan masukkan PIN Admin.</li><li>Jika file belum dapat diakses dari Dashboard, buka Google Drive → Sampah dan pulihkan file asli.</li><li>Kembali ke Dashboard lalu periksa <b>Kesehatan Struktur</b> dan <b>Kesehatan Data</b>.</li></ol></details>
        <details><summary>File Master hilang permanen</summary><ol><li>Gunakan backup sehat untuk membuat salinan pemulihan.</li><li>Periksa seluruh sheet dan konsistensi data.</li><li>Siapkan file pengganti dari backup sehat.</li><li>Relink backend hanya dilakukan pengelola sistem/IT. Jangan mengubah koneksi produksi tanpa pemeriksaan.</li></ol></details>
      </div><div class="system-alert info"><strong>Prinsip aman</strong><span>Pulihkan sekecil mungkin: cell untuk salah hapus cell, satu sheet untuk sheet sistem, dan bundle transaksi hanya untuk keadaan darurat.</span></div></div>`;

    document.getElementById('backupNow')?.addEventListener('click',openBackupModal_);
    document.getElementById('backupSchedule')?.addEventListener('click',ensureBackupSchedule_);
    document.getElementById('openBackupFolder')?.addEventListener('click',() => window.open(r.folders.root.url,'_blank','noopener'));
    document.getElementById('openLastRecovery')?.addEventListener('click',() => { if (lastRecovery?.recoveryUrl) window.open(lastRecovery.recoveryUrl,'_blank','noopener'); });
    document.getElementById('applyMasterProtection')?.addEventListener('click',applyMasterProtections_);
    document.getElementById('refreshStructureHealth')?.addEventListener('click',() => refreshResilienceState_({silent:false,preserveScroll:true}));
    document.getElementById('refreshDataHealth')?.addEventListener('click',() => refreshResilienceState_({silent:false,preserveScroll:true}));
    document.getElementById('restoreProductionTrash')?.addEventListener('click',restoreProductionFromTrash_);
    document.getElementById('compareMasterCells')?.addEventListener('click',() => openCellComparison_(document.getElementById('cellRecoverySource')?.value,document.getElementById('cellRecoverySheet')?.value));
    root.querySelectorAll('[data-open-backup]').forEach(button => button.addEventListener('click',() => window.open(button.dataset.openBackup,'_blank','noopener')));
    root.querySelectorAll('[data-open-recovery]').forEach(button => button.addEventListener('click',() => window.open(button.dataset.openRecovery,'_blank','noopener')));
    root.querySelectorAll('[data-recovery]').forEach(button => button.addEventListener('click',() => prepareRecovery_(button.dataset.recovery,button.dataset.recoveryName)));
    root.querySelectorAll('[data-restore-master]').forEach(button => button.addEventListener('click',() => openRestoreMaster_(button.dataset.restoreMaster,button.dataset.restoreName,recoverableSheets)));
    root.querySelectorAll('[data-restore-missing]').forEach(button=>button.addEventListener('click',()=>restoreMissingProductionSheet_(button.dataset.restoreMissing,button.dataset.sourceId)));
    root.querySelectorAll('[data-restore-content]').forEach(button=>button.addEventListener('click',()=>restoreProductionSheetContent_(button.dataset.restoreContent,button.dataset.sourceId)));
    root.querySelectorAll('[data-emergency-restore]').forEach(button=>button.addEventListener('click',()=>emergencyRestoreProduction_(button.dataset.emergencyRestore)));
  }

  async function refreshResilienceState_({silent=false,preserveScroll=true}={}) {
    if (archiveRefreshBusy) {
      for (let i=0;i<20 && archiveRefreshBusy;i++) await new Promise(resolve => setTimeout(resolve,100));
      if (archiveRefreshBusy) return false;
    }
    archiveRefreshBusy = true;
    const x = window.scrollX;
    const y = window.scrollY;
    try {
      const [archiveResult,resilienceResult] = await Promise.allSettled([
        api().adminArchiveHealth(token()),
        api().adminResilienceHealth(token())
      ]);
      if (resilienceResult.status !== 'fulfilled') throw resilienceResult.reason;
      state.resilience = resilienceResult.value.data?.health || null;
      state.archive = archiveResult.status === 'fulfilled'
        ? (archiveResult.value.data?.health || null)
        : {unavailable:true,error:String(archiveResult.reason?.message || 'Informasi arsip sementara tidak tersedia.')};
      if (archiveMounted_()) drawArchive();
      if (preserveScroll) restoreScroll_(x,y);
      if (!silent) ctx.showToast('Kesehatan data diperbarui.','success');
      return true;
    } catch (error) {
      if (!silent) ctx.showToast(error.message,'error',7000);
      throw error;
    } finally {
      archiveRefreshBusy = false;
    }
  }

  async function restoreMissingProductionSheet_(sheetName,sourceId) {
    const pin = await requestAdminPin_({title:`Pulihkan ${systemSheetLabel(sheetName)}?`,message:`Sheet ${sheetName} akan dibuat kembali dari backup sehat yang dipilih sistem. Data lain tidak disentuh.`,confirmLabel:'Ya, Pulihkan Sheet'});
    if (!pin) return;
    try {
      await api().adminRestoreMissingSheet(token(),sourceId,sheetName,pin);
      ctx.showToast(`${systemSheetLabel(sheetName)} berhasil dipulihkan.`,'success',6000);
      await refreshResilienceState_({silent:true,preserveScroll:true});
    } catch (error) { ctx.showToast(error.message,'error',7000); }
  }

  async function restoreProductionSheetContent_(sheetName,sourceId) {
    const issue = (state.resilience?.dataHealth?.issues || []).find(item=>String(item.name||'')===String(sheetName||''));
    const pin = await requestAdminPin_({title:`Pulihkan isi ${systemSheetLabel(sheetName)}?`,message:`Data yang hilang akan dikembalikan dari Backup Sehat Terakhir${issue?.recommendedSource?.name?` (${issue.recommendedSource.name})`:''}. Data baru yang sudah ada tidak akan dihapus.`,confirmLabel:'Ya, Pulihkan Isi'});
    if (!pin) return;
    try {
      const response = await api().adminRestoreSheetContent(token(),sourceId,sheetName,pin);
      const restore = response.data?.restore || {};
      ctx.showToast(`${Number(restore.restoredRows||0)} data ${systemSheetLabel(sheetName)} berhasil dipulihkan tanpa menghapus data baru.`,'success',8000);
      await refreshResilienceState_({silent:true,preserveScroll:true});
    } catch (error) { ctx.showToast(error.message,'error',8000); }
  }

  async function emergencyRestoreProduction_(sourceId) {
    const pin = await requestAdminPin_({title:'Pemulihan darurat data transaksi?',message:'DATABASE dan sheet transaksi terkait akan dikembalikan bersama-sama dari satu checkpoint/backup agar konsisten. Data setelah waktu sumber pemulihan mungkin perlu diverifikasi.',confirmLabel:'Saya Paham, Pulihkan'});
    if (!pin) return;
    try {
      const response = await api().adminEmergencyRestore(token(),sourceId,pin,true);
      const consistency = response.data?.restore?.consistency || {};
      ctx.showToast(`Pemulihan darurat selesai. Konsistensi: ${consistency.ok?'AMAN':'PERLU PEMERIKSAAN'}.`,consistency.ok?'success':'warning',8000);
      await refreshResilienceState_({silent:true,preserveScroll:true});
    } catch (error) { ctx.showToast(error.message,'error',8000); }
  }

  async function openCellComparison_(sourceId,sheetName) {
    if (!sheetName) return;
    try {
      const response = await api().adminCompareMasterCells(token(),sourceId,sheetName);
      const comparison = response.data?.comparison || {};
      const rows = Array.isArray(comparison.candidates) ? comparison.candidates : [];
      if (!rows.length) { ctx.showToast('Tidak ditemukan cell kosong yang berbeda dari backup.','success'); return; }
      ctx.openModal(`<div class="modal-head"><div><div class="eyebrow">PEMULIHAN CELL</div><h3>${esc(masterSheetLabel(sheetName))}</h3><p>Sumber: ${esc(comparison.sourceName||'-')}</p></div><button class="modal-x" data-modal-close>×</button></div>
        <div class="system-alert info"><strong>Pilih hanya cell yang memang tidak sengaja terhapus.</strong><span>Cell yang sengaja dikosongkan tidak perlu dipulihkan.</span></div>
        <div class="cell-diff-list">${rows.map(item=>`<label class="cell-diff-row"><input type="checkbox" value="${esc(item.a1)}" data-cell-restore><span><strong>${esc(item.a1)}</strong><small>Backup: ${esc(item.backupValue||'-')}</small></span></label>`).join('')}</div>
        <div class="field"><label for="cellRestorePin">PIN Admin <b>*</b></label><input id="cellRestorePin" type="password" inputmode="numeric" autocomplete="off" placeholder="Masukkan PIN Admin"></div><div id="cellRestoreMsg"></div>
        <div class="modal-actions"><button class="secondary-btn" data-modal-close>Batal</button><button id="cellRestoreSave" class="warning-btn">Pulihkan Cell Terpilih</button></div>`,{wide:true});
      document.getElementById('cellRestoreSave')?.addEventListener('click',async()=>{
        const cells=[...document.querySelectorAll('[data-cell-restore]:checked')].map(el=>el.value);
        const pin=String(document.getElementById('cellRestorePin')?.value||'').trim();
        const msg=document.getElementById('cellRestoreMsg');
        if(!cells.length){msg.innerHTML='<div class="alert error">Pilih minimal satu cell.</div>';return;}
        if(!pin){msg.innerHTML='<div class="alert error">PIN Admin wajib diisi.</div>';return;}
        const button=document.getElementById('cellRestoreSave');button.disabled=true;
        try{
          const response = await api().adminRestoreMasterCells(token(),sourceId,sheetName,cells,pin);
          const verification = response.data?.restore?.verification || {};
          if (verification.ok !== true) throw new Error('Pemulihan cell belum lolos verifikasi backend.');
          ctx.closeModal();ctx.showToast(`${cells.length} cell berhasil dipulihkan.`,'success',6000);await refreshResilienceState_({silent:true,preserveScroll:true});
        }catch(error){msg.innerHTML=`<div class="alert error">${esc(error.message)}</div>`;button.disabled=false;}
      });
    } catch (error) { ctx.showToast(error.message,'error',7000); }
  }

  async function restoreProductionFromTrash_() {
    const pin=await requestAdminPin_({title:'Pulihkan file Master dari Sampah?',message:'Sistem akan mengembalikan file Master produksi yang sama dari Sampah Google Drive. ID file tidak berubah.',confirmLabel:'Pulihkan File Asli'});
    if(!pin)return;
    try{await api().adminRestoreActiveFromTrash(token(),pin);ctx.showToast('File Master produksi kembali aktif.','success',6000);await refreshResilienceState_({silent:true,preserveScroll:true});}catch(error){ctx.showToast(error.message,'error',7000);}
  }

  function openBackupModal_() {
    ctx.openModal(`<div class="modal-head"><div><div class="eyebrow">BACKUP MASTER</div><h3>Buat Backup Sekarang</h3><p>Gunakan sebelum perubahan penting pada Master Spreadsheet.</p></div><button class="modal-x" data-modal-close>×</button></div><div class="field"><label for="backupNote">Catatan <span class="optional">opsional</span></label><textarea id="backupNote" rows="3" placeholder="Contoh: sebelum menambah pegawai atau mengganti PIN"></textarea></div><div id="backupModalMsg"></div><div class="modal-actions"><button class="secondary-btn" data-modal-close>Batal</button><button id="backupSave" class="primary-btn">Buat Backup</button></div>`);
    document.getElementById('backupSave')?.addEventListener('click',async() => {
      const button = document.getElementById('backupSave');
      button.disabled = true;
      try {
        await api().adminBackupNow(token(),document.getElementById('backupNote')?.value || '');
        ctx.closeModal();
        ctx.showToast('Backup Master berhasil dibuat. Daftar backup diperbarui.','success');
        await refreshResilienceState_({silent:true,preserveScroll:true});
      } catch (error) { document.getElementById('backupModalMsg').innerHTML = `<div class="alert error">${esc(error.message)}</div>`; button.disabled = false; }
    });
  }

  async function ensureBackupSchedule_() {
    const pin = await requestAdminPin_({title:'Aktifkan backup otomatis?',message:'Sistem akan memastikan jadwal backup otomatis aktif. Tidak ada data transaksi yang diubah.',confirmLabel:'Aktifkan'});
    if (!pin) return;
    try {
      await api().adminEnsureBackupSchedule(token(),pin);
      await refreshResilienceState_({silent:true,preserveScroll:true});
      ctx.showToast('Backup otomatis aktif.','success');
    } catch (error) { ctx.showToast(error.message,'error'); }
  }

  async function prepareRecovery_(backupId,backupName) {
    const pin = await requestAdminPin_({title:'Siapkan salinan pemulihan?',message:`Sistem akan menyalin ${backupName || 'backup terpilih'} ke folder RECOVERY. Master aktif tidak akan diubah.`,confirmLabel:'Siapkan Salinan'});
    if (!pin) return;
    try {
      const response = await api().adminPrepareRecovery(token(),backupId,pin);
      const recovery = response.data?.recovery || null;
      ctx.showToast('Salinan pemulihan berhasil dibuat.','success');
      if (recovery?.url) window.open(recovery.url,'_blank','noopener');
      await refreshResilienceState_({silent:true,preserveScroll:true});
    } catch (error) { ctx.showToast(error.message,'error'); }
  }

  function openRestoreMaster_(backupId,backupName,availableSheets) {
    const sheets = Array.isArray(availableSheets) && availableSheets.length ? availableSheets : ['MASTER_DATA','AKSES','MASTER_WILAYAH'];
    ctx.openModal(`<div class="modal-head"><div><div class="eyebrow">PEMULIHAN MASTER</div><h3>Pulihkan dari Backup</h3><p>${esc(backupName || 'Backup terpilih')}</p></div><button class="modal-x" data-modal-close>×</button></div>
      <div class="system-alert warning"><strong>Hanya bagian Master yang dipilih akan dipulihkan.</strong><span>DATABASE transaksi pasien tidak dikembalikan ke masa lalu. Sistem otomatis membuat backup pengaman sebelum pemulihan.</span></div>
      <div class="field"><label>Pilih bagian yang akan dipulihkan <b>*</b></label><div class="master-restore-options">${sheets.map(name=>`<label class="check-row"><input type="checkbox" value="${esc(name)}" data-master-sheet><span><strong>${esc(masterSheetLabel(name))}</strong><small>${esc(name)}</small></span></label>`).join('')}</div></div>
      <div class="field"><label for="restoreAdminPin">PIN Admin <b>*</b></label><input id="restoreAdminPin" type="password" inputmode="numeric" autocomplete="off" placeholder="Masukkan PIN Admin"></div>
      <div id="restoreMasterMsg"></div><div class="modal-actions"><button class="secondary-btn" data-modal-close>Batal</button><button id="restoreMasterSave" class="danger-btn">Ya, Pulihkan Master</button></div>` ,{wide:true});
    document.getElementById('restoreMasterSave')?.addEventListener('click',async() => {
      const button = document.getElementById('restoreMasterSave');
      const selected = [...document.querySelectorAll('[data-master-sheet]:checked')].map(input => input.value);
      const pin = String(document.getElementById('restoreAdminPin')?.value || '').trim();
      const msg = document.getElementById('restoreMasterMsg');
      if (!selected.length) { msg.innerHTML = '<div class="alert error">Pilih minimal satu bagian Master.</div>'; return; }
      if (!pin) { msg.innerHTML = '<div class="alert error">PIN Admin wajib diisi.</div>'; return; }
      button.disabled = true;
      try {
        const response = await api().adminRestoreMaster(token(),backupId,selected,pin);
        const restore = response.data?.restore || {};
        ctx.closeModal();
        ctx.showToast(`Pemulihan Master selesai: ${(restore.sheets||[]).map(masterSheetLabel).join(', ')}.`,'success',6000);
        await refreshResilienceState_({silent:true,preserveScroll:true});
      } catch (error) { msg.innerHTML = `<div class="alert error">${esc(error.message)}</div>`; button.disabled = false; }
    });
  }

  async function applyMasterProtections_() {
    const pin = await requestAdminPin_({title:'Perbaiki proteksi Master?',message:'Sistem akan menerapkan ulang proteksi edit manual pada sheet kritis. Operasional aplikasi tetap dapat berjalan melalui backend.',confirmLabel:'Terapkan Proteksi'});
    if (!pin) return;
    try {
      await api().adminApplyProtections(token(),pin);
      await refreshResilienceState_({silent:true,preserveScroll:true});
      ctx.showToast('Proteksi Master diperbarui.','success');
    } catch (error) { ctx.showToast(error.message,'error'); }
  }

  async function renderMaster() {
    page().innerHTML = `<section class="hero compact"><div><div class="eyebrow">MASTER</div><h1>Ringkasan Master Data</h1><p>Operasional Admin dilakukan dari dashboard. Perubahan pegawai, role, PIN, dan aktif/nonaktif dilakukan pada Master Spreadsheet.</p></div><div class="hero-actions"><button id="masterRefresh" class="secondary-btn">↻ Segarkan</button></div></section><section class="section" id="masterBody"><div class="inline-loading">Memuat…</div></section>`;
    const load = async() => {
      try { const response = await api().adminRefreshMaster(token()); state.master = response.data?.master || {}; drawMaster(); }
      catch (error) { document.getElementById('masterBody').innerHTML = `<div class="alert error">${esc(error.message)}</div>`; }
    };
    document.getElementById('masterRefresh')?.addEventListener('click',load);
    await load();
  }

  function drawMaster() {
    const m = state.master || {};
    const items = [
      ['Wilayah',countArray(m.areas)],
      ['Alasan Gagal/Pending',countArray(m.failureReasons)],
      ['Jenis Kendala',countArray(m.incidentTypes)],
      ['Estimasi Keterlambatan',countArray(m.delayEstimates)],
      ['Metode Verifikasi',countArray(m.manualVerificationMethods)],
      ['Hubungan Penerima',countArray(m.receiptRelationships)]
    ];
    document.getElementById('masterBody').innerHTML = `<div class="grid grid-3">${items.map(([label,value]) => metric(label,value,'Item aktif')).join('')}</div><div class="system-alert info"><strong>Master Spreadsheet adalah sumber konfigurasi inti.</strong><span>Gunakan hanya saat menambah pegawai, mengubah role/PIN, aktif-nonaktif akun, atau perubahan master yang memang diperlukan.</span></div>`;
  }

  async function renderAudit() {
    page().innerHTML = `<section class="hero compact"><div><div class="eyebrow">AUDIT</div><h1>Jejak Aktivitas</h1><p>Perubahan data dan aktivitas penting tercatat untuk penelusuran.</p></div><div class="hero-actions"><button id="auditRefresh" class="secondary-btn">↻ Segarkan</button></div></section><section class="section"><div class="toolbar-card audit-toolbar"><div class="search-box"><span>⌕</span><input id="auditSearch" placeholder="Cari Kode/ID, petugas, role, atau aksi…"></div><select id="auditRole"><option value="">Semua Role</option><option>FARMASI</option><option>KURIR</option><option>ADMIN</option><option>MANAJEMEN</option></select></div><div id="auditBody" class="content-card"><div class="inline-loading">Memuat…</div></div></section>`;
    document.getElementById('auditSearch')?.addEventListener('input',drawAudit);
    document.getElementById('auditRole')?.addEventListener('change',drawAudit);
    document.getElementById('auditRefresh')?.addEventListener('click',async() => { await loadAudit(); ctx.showToast('Audit diperbarui.','success'); });
    await loadAudit();
  }

  async function loadAudit() {
    try { const response = await api().adminAuditRows(token(),200); state.audit = response.data?.rows || []; drawAudit(); }
    catch (error) { document.getElementById('auditBody').innerHTML = `<div class="alert error">${esc(error.message)}</div>`; }
  }

  function drawAudit() {
    const root = document.getElementById('auditBody');
    if (!root) return;
    const query = String(document.getElementById('auditSearch')?.value || '').toLowerCase();
    const role = String(document.getElementById('auditRole')?.value || '').toUpperCase();
    const rows = state.audit.filter(item => {
      if (role && String(item.role||'').toUpperCase() !== role) return false;
      if (!query) return true;
      return [item.id,item.name,item.role,item.action,item.oldStatus,item.newStatus,item.note].some(value => String(value||'').toLowerCase().includes(query));
    });
    if (!rows.length) { root.innerHTML = '<div class="empty-state"><h3>Tidak ada audit sesuai filter</h3></div>'; return; }
    root.innerHTML = `<div class="table-scroll"><table class="data-table responsive-table"><thead><tr><th>Waktu</th><th>Petugas</th><th>Aksi</th><th>Perubahan</th><th>Catatan</th></tr></thead><tbody>${rows.map(item => `<tr><td data-label="Waktu">${fmt(item.time)}</td><td data-label="Petugas"><strong>${fmt(item.name)}</strong><span class="cell-sub">${fmt(item.role)}</span></td><td data-label="Aksi">${fmt(item.action)}<span class="cell-sub">${fmt(item.id)}</span></td><td data-label="Perubahan">${item.oldStatus||item.newStatus?`${badge(item.oldStatus||'-','neutral')} <span class="audit-arrow">→</span> ${badge(item.newStatus||'-',statusClass(item.newStatus))}`:'-'}</td><td data-label="Catatan">${fmt(item.note)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  return {renderHome,renderCorrections,renderArchive,renderMaster,renderAudit,resetForLogout};
}
