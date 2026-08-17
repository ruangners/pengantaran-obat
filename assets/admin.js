export function createAdminModule(ctx) {
  const state = {loaded:false,summary:{},archive:null,resilience:null,master:{},audit:[],metadata:null,rows:[],search:''};
  const esc = ctx.escapeHtml;
  const api = () => ctx.getApi();
  const token = () => ctx.getToken();
  const page = () => document.getElementById('pageContent');
  const statusOptions = ['MENUNGGU DIPROSES','SIAP DIANTAR','DALAM PERJALANAN','TERKIRIM','GAGAL ANTAR'];

  function resetForLogout() {
    Object.assign(state,{loaded:false,summary:{},archive:null,resilience:null,master:{},audit:[],metadata:null,rows:[],search:''});
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
  function backupKindLabel(kind) { return ({DAILY:'Harian',MONTHLY:'Bulanan',PRECHANGE:'Sebelum Perubahan',RECOVERY:'Recovery'})[kind] || kind || '-'; }

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
    try { await bootstrap(); drawHome(); }
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
    const safe = String(r.status || '') === 'AMAN';
    const last = r.lastDaily ? fmtDateTime(r.lastDaily.createdAt) : 'Belum tersedia';
    return `<div class="system-alert ${safe?'success':'warning'}"><strong>Backup Master: ${esc(r.status || 'Belum siap')}</strong><span>Backup harian terakhir: ${last}. ${safe?'Cadangan otomatis aktif.':'Periksa menu Arsip untuk detail.'}</span></div>`;
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
      <div class="field"><label for="adminCorrectionNote">Alasan koreksi <b>*</b></label><textarea id="adminCorrectionNote" rows="3" placeholder="Jelaskan mengapa data perlu dikoreksi"></textarea></div><div id="adminCorrectionMsg"></div><div class="modal-actions"><button class="secondary-btn" data-modal-close>Batal</button><button id="adminCorrectionSave" class="primary-btn">Simpan Koreksi</button></div>`);
    document.getElementById('adminCorrectionSave')?.addEventListener('click',async() => {
      const status = document.getElementById('adminNewStatus').value;
      const note = document.getElementById('adminCorrectionNote').value.trim();
      if (!note) { document.getElementById('adminCorrectionMsg').innerHTML = '<div class="alert error">Alasan koreksi wajib diisi.</div>'; return; }
      const ok = await ctx.confirmAction({title:'Simpan koreksi?',message:`Status ${record['Status']} akan diubah menjadi ${status}. Perubahan akan tercatat pada Audit.`,confirmLabel:'Simpan Koreksi',tone:'warning'});
      if (!ok) return;
      try {
        await api().adminUpdateStatus(token(),id,status,note);
        ctx.closeModal();
        ctx.showToast('Koreksi data berhasil disimpan.','success');
        await loadRows();
      } catch (error) { document.getElementById('adminCorrectionMsg').innerHTML = `<div class="alert error">${esc(error.message)}</div>`; }
    });
  }

  async function renderArchive() {
    page().innerHTML = `<section class="hero compact"><div><div class="eyebrow">ARSIP & BACKUP</div><h1>Ketahanan Data</h1><p>Pantau arsip, backup otomatis, dan siapkan salinan recovery tanpa mengubah Master aktif.</p></div><div class="hero-actions"><button id="archiveRefresh" class="secondary-btn">↻ Segarkan</button></div></section><section class="section" id="archiveBody"><div class="inline-loading">Memuat…</div></section>`;
    const load = async() => {
      try {
        const [archiveResponse,resilienceResponse] = await Promise.all([
          api().adminArchiveHealth(token()),
          api().adminResilienceHealth(token())
        ]);
        state.archive = archiveResponse.data?.health || null;
        state.resilience = resilienceResponse.data?.health || null;
        drawArchive();
      } catch (error) { document.getElementById('archiveBody').innerHTML = `<div class="alert error">${esc(error.message)}</div>`; }
    };
    document.getElementById('archiveRefresh')?.addEventListener('click',load);
    await load();
  }

  function drawArchive() {
    const root = document.getElementById('archiveBody');
    if (!root) return;
    const a = state.archive || {};
    const queue = a.queue || {};
    const config = a.config || {};
    const r = state.resilience || {};
    const counts = r.counts || {};
    const trigger = r.trigger || {};
    const lastDaily = r.lastDaily || null;
    const lastMonthly = r.lastMonthly || null;
    const backupStatus = String(r.status || 'BELUM SIAP');
    const recent = Array.isArray(r.recent) ? r.recent : [];
    const warnings = Array.isArray(r.warnings) ? r.warnings : [];
    const secondary = r.secondary || {};

    root.innerHTML = `
      <div class="admin-section-title"><div><span class="eyebrow">ARSIP TRANSAKSI</span><h2>Retensi & Arsip Tahunan</h2></div></div>
      <div class="grid grid-4">${metric('Retensi',`${Number(config.retentionDays||120)} hari`,'Data aktif')}${metric('Menunggu Arsip',Number(queue.waiting||0),'Antrean')}${metric('Gagal Arsip',Number(queue.failed||0),'Perlu perhatian')}${metric('Tahun Arsip',Number(a.registry?.length||a.years?.length||0),'Terdeteksi')}</div>
      <div class="content-card technical-panel"><h3>Informasi Arsip</h3><pre>${esc(JSON.stringify({config:a.config||{},queue:a.queue||{},lastRun:a.lastRun||a.lastArchiveRun||null},null,2))}</pre></div>

      <div class="admin-section-title resilience-heading"><div><span class="eyebrow">BACKUP MASTER</span><h2>Backup & Recovery</h2><p>Salinan utuh Spreadsheet dibuat otomatis. Recovery selalu dibuat sebagai salinan terpisah untuk diperiksa terlebih dahulu.</p></div><div class="admin-section-actions"><button id="backupNow" class="primary-btn">Backup Master Sekarang</button>${trigger.installed?'':`<button id="backupSchedule" class="secondary-btn">Aktifkan Backup Otomatis</button>`}</div></div>
      <div class="grid grid-4">
        ${metric('Status Backup',backupStatus,trigger.installed?'Otomatis aktif':'Trigger belum aktif')}
        ${metric('Backup Harian',Number(counts.daily||0),lastDaily?`Terakhir ${fmtDateTime(lastDaily.createdAt)}`:'Belum tersedia')}
        ${metric('Backup Bulanan',Number(counts.monthly||0),lastMonthly?`Terakhir ${fmtDateTime(lastMonthly.createdAt)}`:'Belum tersedia')}
        ${metric('Sebelum Perubahan',Number(counts.prechange||0),'Backup manual')}
      </div>
      ${warnings.length?`<div class="system-alert warning"><strong>Backup perlu perhatian</strong><span>${warnings.map(esc).join(' • ')}</span></div>`:`<div class="system-alert success"><strong>Backup Master aman</strong><span>Backup otomatis aktif dan cadangan terbaru tersedia.</span></div>`}
      <div class="content-card resilience-config-card">
        <div class="resilience-config-row"><div><span>Jadwal otomatis</span><strong>${esc(trigger.schedule || '-')}</strong></div><div><span>Retensi backup</span><strong>${Number(r.config?.dailyKeep||30)} harian • ${Number(r.config?.monthlyKeep||12)} bulanan</strong></div><div><span>Cadangan lokasi kedua</span><strong>${secondary.configured?(secondary.error?'Perlu perhatian':'Aktif'):'Belum dikonfigurasi'}</strong></div>${r.folders?.root?.url?`<button id="openBackupFolder" class="mini-btn">Buka Folder Backup</button>`:''}</div>
      </div>
      <div class="content-card">
        <div class="card-head-row"><div><h3>Backup Terbaru</h3><p>Pilih backup yang sehat untuk menyiapkan salinan recovery. Master aktif tidak pernah ditimpa otomatis.</p></div></div>
        ${recent.length?`<div class="table-scroll"><table class="data-table responsive-table"><thead><tr><th>Jenis</th><th>Nama File</th><th>Dibuat</th><th>Aksi</th></tr></thead><tbody>${recent.map(item=>`<tr><td data-label="Jenis"><strong>${esc(backupKindLabel(item.kind))}</strong></td><td data-label="Nama File"><span class="backup-file-name">${esc(item.name)}</span></td><td data-label="Dibuat">${fmtDateTime(item.createdAt)}</td><td data-label="Aksi"><div class="row-actions">${item.url?`<button class="mini-btn" data-open-backup="${esc(item.url)}">Buka</button>`:''}<button class="mini-btn primary-soft" data-recovery="${esc(item.id)}" data-recovery-name="${esc(item.name)}">Siapkan Recovery</button></div></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state"><h3>Belum ada backup</h3><p>Aktifkan backup otomatis atau buat backup manual.</p></div>'}
      </div>`;

    document.getElementById('backupNow')?.addEventListener('click',openBackupModal_);
    document.getElementById('backupSchedule')?.addEventListener('click',ensureBackupSchedule_);
    document.getElementById('openBackupFolder')?.addEventListener('click',() => window.open(r.folders.root.url,'_blank','noopener'));
    root.querySelectorAll('[data-open-backup]').forEach(button => button.addEventListener('click',() => window.open(button.dataset.openBackup,'_blank','noopener')));
    root.querySelectorAll('[data-recovery]').forEach(button => button.addEventListener('click',() => prepareRecovery_(button.dataset.recovery,button.dataset.recoveryName)));
  }

  function openBackupModal_() {
    ctx.openModal(`<div class="modal-head"><div><div class="eyebrow">BACKUP MASTER</div><h3>Buat Backup Sekarang</h3><p>Gunakan sebelum perubahan penting pada Master Spreadsheet.</p></div><button class="modal-x" data-modal-close>×</button></div><div class="field"><label for="backupNote">Catatan <span class="optional">opsional</span></label><textarea id="backupNote" rows="3" placeholder="Contoh: sebelum menambah pegawai atau mengganti PIN"></textarea></div><div id="backupModalMsg"></div><div class="modal-actions"><button class="secondary-btn" data-modal-close>Batal</button><button id="backupSave" class="primary-btn">Buat Backup</button></div>`);
    document.getElementById('backupSave')?.addEventListener('click',async() => {
      const button = document.getElementById('backupSave');
      button.disabled = true;
      try {
        const response = await api().adminBackupNow(token(),document.getElementById('backupNote')?.value || '');
        ctx.closeModal();
        ctx.showToast('Backup Master berhasil dibuat.','success');
        const health = await api().adminResilienceHealth(token());
        state.resilience = health.data?.health || null;
        drawArchive();
      } catch (error) { document.getElementById('backupModalMsg').innerHTML = `<div class="alert error">${esc(error.message)}</div>`; button.disabled = false; }
    });
  }

  async function ensureBackupSchedule_() {
    const ok = await ctx.confirmAction({title:'Aktifkan backup otomatis?',message:'Sistem akan memastikan trigger backup harian aktif. Tidak ada data transaksi yang diubah.',confirmLabel:'Aktifkan',tone:'info'});
    if (!ok) return;
    try {
      await api().adminEnsureBackupSchedule(token());
      const health = await api().adminResilienceHealth(token());
      state.resilience = health.data?.health || null;
      drawArchive();
      ctx.showToast('Backup otomatis aktif.','success');
    } catch (error) { ctx.showToast(error.message,'error'); }
  }

  async function prepareRecovery_(backupId,backupName) {
    const ok = await ctx.confirmAction({title:'Siapkan salinan recovery?',message:`Sistem akan menyalin ${backupName || 'backup terpilih'} ke folder RECOVERY. Master aktif tidak akan diubah.`,confirmLabel:'Siapkan Recovery',tone:'warning'});
    if (!ok) return;
    try {
      const response = await api().adminPrepareRecovery(token(),backupId);
      const recovery = response.data?.recovery || null;
      ctx.showToast('Salinan recovery berhasil dibuat.','success');
      if (recovery?.url) window.open(recovery.url,'_blank','noopener');
      const health = await api().adminResilienceHealth(token());
      state.resilience = health.data?.health || null;
      drawArchive();
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
