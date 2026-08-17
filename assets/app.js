import { APP_CONFIG } from './config.js?v=1.0.0-rc1';
import { AppsScriptTransport, PengantaranApi } from './api-client.js?v=1.0.0-rc1';
import { createFarmasiModule } from './farmasi.js?v=1.0.0-rc1';
import { createCourierModule } from './courier.js?v=1.0.0-rc1';
import { createAdminModule } from './admin.js?v=1.0.0-rc1';
import { createManagementModule } from './management.js?v=1.0.0-rc1';

const $ = id => document.getElementById(id);
const state = {
  api:null,
  transport:null,
  endpoint:'',
  session:null,
  view:'home',
  backendReady:false,
  backendInfo:null,
  activeRequests:0,
  lastSessionCheck:0,
  authResetting:false,
  updateRegistration:null,
  updateRequested:false
};

const NAV = {
  FARMASI: [
    ['home','⌂','Beranda'],['registration','＋','Pendaftaran'],['today','▤','Hari Ini'],['verification','✓','Verifikasi'],['followup','↺','Tindak Lanjut'],['labels','▣','Label'],['account','●','Akun']
  ],
  KURIR: [
    ['home','⌂','Beranda'],['ready','◎','Siap'],['tasks','➜','Tugas'],['history','↺','Riwayat'],['account','●','Akun']
  ],
  ADMIN: [
    ['home','⌂','Beranda'],['corrections','✎','Koreksi Data'],['archive','▣','Arsip'],['master','◆','Master'],['audit','≡','Audit'],['account','●','Akun']
  ],
  MANAJEMEN: [
    ['home','⌂','Ringkasan'],['performance','▥','Kinerja'],['areas','⌖','Wilayah'],['reports','▧','Laporan'],['account','●','Akun']
  ]
};

const PAGE_META = {
  home:['Beranda','Ringkasan kegiatan'],
  registration:['Pendaftaran','Daftarkan pengantaran obat'],
  today:['Hari Ini','Pantau pengantaran hari ini'],
  verification:['Verifikasi','Penerimaan tanpa kode'],
  followup:['Tindak Lanjut','Gagal antar dan pengantaran ulang'],
  labels:['Label','Cetak dan cetak ulang label'],
  ready:['Siap','Paket siap diambil'],
  tasks:['Tugas','Pengantaran aktif'],
  history:['Riwayat','Pengantaran selesai hari ini'],
  corrections:['Koreksi Data','Perbaikan data dengan jejak audit'],
  archive:['Arsip','Pemeliharaan data arsip'],
  master:['Master','Ringkasan konfigurasi sistem'],
  audit:['Audit','Jejak aktivitas sistem'],
  performance:['Kinerja','Kinerja layanan dan petugas'],
  areas:['Wilayah','Sebaran layanan'],
  reports:['Laporan','Laporan periode'],
  account:['Akun','Informasi akun']
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function displayRole(role) {
  return String(role || '').toUpperCase() === 'ADMIN' ? 'ADMIN DATA' : String(role || '').toUpperCase();
}

function initials(name) {
  return String(name || 'A').trim().split(/\s+/).slice(0,2).map(item => item[0] || '').join('').toUpperCase() || 'A';
}

function getClientId() {
  let id = localStorage.getItem(APP_CONFIG.clientIdStorageKey);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    localStorage.setItem(APP_CONFIG.clientIdStorageKey,id);
  }
  return id;
}

function getEndpoint() {
  const override = String(localStorage.getItem(APP_CONFIG.backendStorageKey) || '').trim();
  return override || String(APP_CONFIG.backendUrl || '').trim();
}

function saveEndpoint(url) {
  localStorage.setItem(APP_CONFIG.backendStorageKey,String(url || '').trim());
}

function clearEndpointOverride() {
  localStorage.removeItem(APP_CONFIG.backendStorageKey);
}

function showAlert(target,text,type='error') {
  if (!target) return;
  target.innerHTML = text ? `<div class="alert ${type}">${escapeHtml(text)}</div>` : '';
}

function setBackendState(ready,message) {
  state.backendReady = ready;
  const el = $('backendState');
  if (!el) return;
  el.innerHTML = `<span class="dot ${ready?'ok':'bad'}"></span><span>${escapeHtml(message)}</span>`;
}

function setRequestState({active=false}={}) {
  state.activeRequests = Math.max(0,state.activeRequests + (active ? 1 : -1));
  $('requestBar')?.classList.toggle('active',state.activeRequests > 0);
}

function updateConnectivity() {
  const offline = !navigator.onLine;
  $('networkBanner')?.classList.toggle('hidden',!offline);
  if (offline) setBackendState(false,'Perangkat offline');
}

function showToast(message,type='info',timeout=4200) {
  const box = $('toastContainer');
  if (!box || !message) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-dot"></span><span>${escapeHtml(message)}</span><button aria-label="Tutup">×</button>`;
  const close = () => { toast.classList.add('leaving'); setTimeout(() => toast.remove(),180); };
  toast.querySelector('button').addEventListener('click',close);
  box.appendChild(toast);
  setTimeout(close,timeout);
}

function openModal(html,{wide=false}={}) {
  $('modalContent').className = `modal ${wide?'wide':''}`;
  $('modalContent').innerHTML = html;
  $('appModal').classList.remove('hidden');
  document.body.classList.add('modal-open');
  $('modalContent').querySelectorAll('[data-modal-close]').forEach(button => button.addEventListener('click',closeModal));
}

function closeModal() {
  $('appModal').classList.add('hidden');
  $('modalContent').innerHTML = '';
  document.body.classList.remove('modal-open');
}

function confirmAction({title='Konfirmasi',message='',confirmLabel='Lanjutkan',tone='normal'}={}) {
  return new Promise(resolve => {
    openModal(`<div class="modal-head"><div><div class="eyebrow">KONFIRMASI</div><h3>${escapeHtml(title)}</h3></div><button class="modal-x" id="confirmClose">×</button></div><div class="confirm-message">${escapeHtml(message).replace(/\n/g,'<br>')}</div><div class="modal-actions"><button id="confirmCancel" class="secondary-btn">Batal</button><button id="confirmOk" class="${tone==='warning'?'warning-btn':tone==='danger'?'danger-btn':'primary-btn'}">${escapeHtml(confirmLabel)}</button></div>`);
    let done = false;
    const finish = value => { if (done) return; done = true; closeModal(); resolve(value); };
    $('confirmClose').addEventListener('click',() => finish(false));
    $('confirmCancel').addEventListener('click',() => finish(false));
    $('confirmOk').addEventListener('click',() => finish(true));
  });
}

function setNavBadge(view,count) {
  const value = Math.max(0,Number(count || 0));
  document.querySelectorAll(`[data-nav-badge="${view}"]`).forEach(el => {
    el.textContent = value > 99 ? '99+' : String(value);
    el.classList.toggle('hidden',!value);
  });
}

function initTransport(endpoint) {
  if (state.transport) state.transport.destroy();
  state.endpoint = endpoint;
  state.transport = new AppsScriptTransport({
    endpoint,
    timeoutMs:APP_CONFIG.transportTimeoutMs,
    expectedContract:APP_CONFIG.apiContract,
    onState:item => setBackendState(Boolean(item.ready),item.message),
    onAuthError:handleSessionExpired,
    onRequestState:setRequestState
  });
  state.api = new PengantaranApi(state.transport,{
    readRetryCount:APP_CONFIG.readRetryCount,
    readRetryDelayMs:APP_CONFIG.readRetryDelayMs,
    mutationReplayWindowMs:APP_CONFIG.mutationReplayWindowMs,
    mutationBusyRetryCount:APP_CONFIG.mutationBusyRetryCount,
    mutationBusyRetryDelayMs:APP_CONFIG.mutationBusyRetryDelayMs
  });
}

async function connectBackend(endpoint=getEndpoint()) {
  if (!endpoint) {
    setBackendState(false,'Layanan belum dikonfigurasi');
    return false;
  }
  initTransport(endpoint);
  try {
    const result = await state.transport.connect();
    state.backendInfo = result?.data || null;
    return true;
  } catch (error) {
    state.backendInfo = null;
    setBackendState(false,error.message);
    if (error?.code === 'VERSION_MISMATCH') showToast(error.message,'warning',9000);
    return false;
  }
}

function openBackendModal() {
  if (state.session && state.session.user?.role !== 'ADMIN') return;
  $('backendUrl').value = getEndpoint();
  showAlert($('backendModalMessage'),'');
  $('backendModal').classList.remove('hidden');
  setTimeout(() => $('backendUrl')?.focus(),50);
}

function closeBackendModal() { $('backendModal').classList.add('hidden'); }

async function saveBackend() {
  const url = $('backendUrl').value.trim();
  if (!url.endsWith('/exec')) {
    showAlert($('backendModalMessage'),'Alamat backend harus berupa deployment Apps Script yang berakhir /exec.');
    return;
  }
  saveEndpoint(url);
  $('saveBackendSetup').disabled = true;
  showAlert($('backendModalMessage'),'Menguji koneksi…','info');
  const ok = await connectBackend(url);
  $('saveBackendSetup').disabled = false;
  if (ok) {
    showAlert($('backendModalMessage'),'Koneksi berhasil.','info');
    setTimeout(() => { closeBackendModal(); if (state.session?.user?.role === 'ADMIN' && state.view === 'account') renderAccountPage(); },500);
  } else showAlert($('backendModalMessage'),'Backend belum dapat dihubungi. Periksa deployment dan alamatnya.');
}

function clearLocalSession() {
  farmasi.resetForLogout();
  courier.resetForLogout();
  admin.resetForLogout();
  management.resetForLogout();
  state.session = null;
  state.lastSessionCheck = 0;
  sessionStorage.removeItem(APP_CONFIG.sessionStorageKey);
}

function showLogin(message='') {
  clearLocalSession();
  closeModal();
  $('appView').classList.add('hidden');
  $('loginView').classList.remove('hidden');
  if (message) showAlert($('loginMessage'),message,'error');
  setTimeout(() => $('pin')?.focus(),80);
}

function handleSessionExpired() {
  if (state.authResetting) return;
  state.authResetting = true;
  showLogin('Sesi Anda telah berakhir. Silakan masuk kembali.');
  showToast('Sesi berakhir. Silakan masuk kembali.','warning',6000);
  setTimeout(() => { state.authResetting = false; },300);
}

async function recheckSession(force=false) {
  if (!state.session?.token || !state.api || !navigator.onLine) return false;
  const now = Date.now();
  if (!force && now - state.lastSessionCheck < APP_CONFIG.sessionRecheckMs) return true;
  try {
    const result = await state.api.session(state.session.token);
    state.session.user = result.data.user;
    state.lastSessionCheck = now;
    sessionStorage.setItem(APP_CONFIG.sessionStorageKey,JSON.stringify(state.session));
    return true;
  } catch (error) {
    if (error.code === 'SESSION_EXPIRED') handleSessionExpired();
    return false;
  }
}

async function login(event) {
  event.preventDefault();
  showAlert($('loginMessage'),'');
  if (!state.backendReady) {
    const ok = await connectBackend();
    if (!ok) {
      showAlert($('loginMessage'),'Aplikasi belum dapat terhubung ke layanan. Hubungi Admin Data.');
      $('initialSetupLink')?.classList.remove('hidden');
      return;
    }
  }
  const pin = $('pin').value.trim();
  if (!pin) return;
  $('loginButton').disabled = true;
  $('loginButton').textContent = 'Memeriksa…';
  try {
    const result = await state.api.login(pin,{clientId:getClientId(),userAgent:navigator.userAgent,origin:location.origin});
    state.session = {token:result.data.token,user:result.data.user};
    state.lastSessionCheck = Date.now();
    sessionStorage.setItem(APP_CONFIG.sessionStorageKey,JSON.stringify(state.session));
    $('pin').value = '';
    showApp();
  } catch (error) {
    showAlert($('loginMessage'),error.message);
  } finally {
    $('loginButton').disabled = false;
    $('loginButton').textContent = 'Masuk';
  }
}

async function restoreSession() {
  const raw = sessionStorage.getItem(APP_CONFIG.sessionStorageKey);
  if (!raw) return false;
  try {
    const saved = JSON.parse(raw);
    if (!saved?.token) return false;
    const result = await state.api.session(saved.token);
    state.session = {token:saved.token,user:result.data.user};
    state.lastSessionCheck = Date.now();
    sessionStorage.setItem(APP_CONFIG.sessionStorageKey,JSON.stringify(state.session));
    showApp();
    return true;
  } catch (error) {
    sessionStorage.removeItem(APP_CONFIG.sessionStorageKey);
    if (error?.code === 'SESSION_EXPIRED') showAlert($('loginMessage'),'Sesi sebelumnya telah berakhir. Silakan masuk kembali.','info');
    return false;
  }
}

async function logout() {
  const ok = await confirmAction({title:'Keluar dari aplikasi?',message:'Sesi akun ini akan ditutup.',confirmLabel:'Keluar',tone:'danger'});
  if (!ok) return;
  const token = state.session?.token;
  try { if (token && state.api && navigator.onLine) await state.api.logout(token); } catch (_) {}
  showLogin('');
}

function buildNav() {
  const role = state.session.user.role;
  const items = NAV[role] || NAV.FARMASI;
  $('sideNav').innerHTML = items.map(item => `<button class="nav-item" data-view="${item[0]}"><span class="nav-icon">${item[1]}</span>${escapeHtml(item[2])}<span class="nav-count-badge hidden" data-nav-badge="${item[0]}"></span></button>`).join('');

  let mobileItems;
  if (role === 'FARMASI') mobileItems = items.filter(item => item[0] !== 'account');
  else if (role === 'ADMIN') mobileItems = items.filter(item => item[0] !== 'account').slice(0,5);
  else mobileItems = items.slice(0,5);
  $('bottomNav').style.setProperty('--nav-count',mobileItems.length);
  $('bottomNav').innerHTML = mobileItems.map(item => `<button data-view="${item[0]}"><span>${item[1]}</span>${escapeHtml(item[2])}<span class="nav-count-badge hidden" data-nav-badge="${item[0]}"></span></button>`).join('');
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click',() => openView(button.dataset.view)));
}

function showApp() {
  const user = state.session.user;
  user.role = String(user.role || '').trim().toUpperCase();
  $('loginView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  $('sideUserName').textContent = user.name;
  $('sideUserRole').textContent = displayRole(user.role);
  $('roleChip').textContent = displayRole(user.role);
  $('avatar').textContent = initials(user.name);
  $('sidebarBackendButton')?.classList.toggle('hidden',user.role !== 'ADMIN');
  buildNav();
  openView('home');
}

function openView(view) {
  state.view = view;
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active',button.dataset.view === view));
  const role = String(state.session?.user?.role || '').toUpperCase();
  const meta = PAGE_META[view] || ['Menu','Pengantaran Obat Gratis'];
  $('pageTitle').textContent = role === 'MANAJEMEN' && view === 'home' ? 'Ringkasan' : meta[0];
  $('pageSubtitle').textContent = role === 'MANAJEMEN' && view === 'home' ? 'Key Performance Indicator (KPI) layanan' : meta[1];
  $('pageContent').innerHTML = '';
  window.scrollTo({top:0,behavior:'auto'});

  if (role === 'FARMASI') {
    if (view === 'home') return farmasi.renderHome();
    if (view === 'registration') return farmasi.renderRegistration();
    if (view === 'today') return farmasi.renderToday();
    if (view === 'verification') return farmasi.renderVerification();
    if (view === 'followup') return farmasi.renderFollowUp();
    if (view === 'labels') return farmasi.renderLabels();
  }
  if (role === 'KURIR') {
    if (view === 'home') return courier.renderHome();
    if (view === 'ready') return courier.renderReady();
    if (view === 'tasks') return courier.renderTasks();
    if (view === 'history') return courier.renderHistory();
  }
  if (role === 'ADMIN') {
    if (view === 'home') return admin.renderHome();
    if (view === 'corrections') return admin.renderCorrections();
    if (view === 'archive') return admin.renderArchive();
    if (view === 'master') return admin.renderMaster();
    if (view === 'audit') return admin.renderAudit();
  }
  if (role === 'MANAJEMEN') {
    if (view === 'home') return management.renderHome();
    if (view === 'performance') return management.renderPerformance();
    if (view === 'areas') return management.renderAreas();
    if (view === 'reports') return management.renderReports();
  }
  if (view === 'account') return renderAccountPage();
}

function renderAccountPage() {
  const user = state.session.user;
  const adminTechnical = user.role === 'ADMIN' ? `<div class="account-section"><div class="section-heading"><div><h2>Koneksi Sistem</h2><p>Informasi teknis hanya tersedia untuk Admin Data.</p></div></div><div class="grid grid-2"><div class="card account-card"><span>Frontend</span><strong>${escapeHtml(APP_CONFIG.version)}</strong><small>PWA</small></div><div class="card account-card"><span>Backend</span><strong>${escapeHtml(state.backendInfo?.version || '-')}</strong><small>${escapeHtml(state.backendInfo?.apiContract || APP_CONFIG.apiContract)}</small></div><div class="card account-card"><span>Status</span><strong>${state.backendReady?'Terhubung':'Tidak terhubung'}</strong><small>${navigator.onLine?'Perangkat online':'Perangkat offline'}</small></div><div class="card account-card"><span>Backend aktif</span><strong class="technical-url">${escapeHtml(getEndpoint() || '-')}</strong><small>${APP_CONFIG.backendUrl?'Konfigurasi produksi':'Konfigurasi browser'}</small></div></div><div class="account-actions"><button id="accountBackendSettings" class="secondary-btn">Pengaturan Koneksi</button>${localStorage.getItem(APP_CONFIG.backendStorageKey) && APP_CONFIG.backendUrl ? '<button id="accountResetBackend" class="secondary-btn">Kembali ke Backend Produksi</button>' : ''}</div></div>` : '';

  $('pageContent').innerHTML = `<section class="account-hero"><div class="account-avatar">${escapeHtml(initials(user.name))}</div><div><div class="eyebrow">AKUN</div><h1>${escapeHtml(user.name)}</h1><p>${escapeHtml(displayRole(user.role))}${user.email?` • ${escapeHtml(user.email)}`:''}</p></div></section><section class="section account-layout"><div class="card account-main"><div class="account-detail"><span>Nama</span><strong>${escapeHtml(user.name)}</strong></div><div class="account-detail"><span>Role</span><strong>${escapeHtml(displayRole(user.role))}</strong></div>${user.email?`<div class="account-detail"><span>Email</span><strong>${escapeHtml(user.email)}</strong></div>`:''}</div>${adminTechnical}<button id="accountLogout" class="danger-outline-btn account-logout">Keluar dari Aplikasi</button></section>`;
  $('accountLogout')?.addEventListener('click',logout);
  $('accountBackendSettings')?.addEventListener('click',openBackendModal);
  $('accountResetBackend')?.addEventListener('click',async() => {
    clearEndpointOverride();
    const ok = await connectBackend(APP_CONFIG.backendUrl);
    showToast(ok?'Kembali menggunakan backend produksi.':'Backend produksi belum dapat dihubungi.',ok?'success':'error');
    renderAccountPage();
  });
}

const farmasi = createFarmasiModule({
  escapeHtml,
  getApi:() => state.api,
  getToken:() => state.session?.token || '',
  getUser:() => state.session?.user || null,
  navigate:openView,
  openModal,
  closeModal,
  confirmAction,
  showToast,
  setNavBadge
});

const courier = createCourierModule({
  escapeHtml,
  getApi:() => state.api,
  getToken:() => state.session?.token || '',
  getUser:() => state.session?.user || null,
  getView:() => state.view,
  navigate:openView,
  openModal,
  closeModal,
  confirmAction,
  showToast
});

const admin = createAdminModule({
  escapeHtml,
  getApi:() => state.api,
  getToken:() => state.session?.token || '',
  getUser:() => state.session?.user || null,
  getView:() => state.view,
  navigate:openView,
  openModal,
  closeModal,
  confirmAction,
  showToast
});

const management = createManagementModule({
  escapeHtml,
  getApi:() => state.api,
  getToken:() => state.session?.token || '',
  getUser:() => state.session?.user || null,
  getView:() => state.view,
  navigate:openView,
  openModal,
  closeModal,
  confirmAction,
  showToast,
  minimumStatsSample:APP_CONFIG.statsMinimumSample
});

function showUpdateAvailable(registration) {
  state.updateRegistration = registration || state.updateRegistration;
  $('updateBanner')?.classList.remove('hidden');
}

function hideUpdateAvailable() { $('updateBanner')?.classList.add('hidden'); }

async function applyAppUpdate() {
  const registration = state.updateRegistration || await navigator.serviceWorker.getRegistration();
  if (!registration?.waiting) { hideUpdateAvailable(); location.reload(); return; }
  state.updateRequested = true;
  $('applyUpdateButton').disabled = true;
  $('applyUpdateButton').textContent = 'Memperbarui…';
  registration.waiting.postMessage({type:'SKIP_WAITING'});
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.register('./sw.js?v=1.0.0-rc1',{updateViaCache:'none'});
  state.updateRegistration = registration;
  if (registration.waiting && navigator.serviceWorker.controller) showUpdateAvailable(registration);
  registration.addEventListener('updatefound',() => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener('statechange',() => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateAvailable(registration);
    });
  });
  navigator.serviceWorker.addEventListener('controllerchange',() => { if (state.updateRequested) location.reload(); });
  try { await registration.update(); } catch (_) {}
}

async function boot() {
  $('initialSetupLink')?.addEventListener('click',openBackendModal);
  $('sidebarBackendButton')?.addEventListener('click',openBackendModal);
  $('closeBackendSetup')?.addEventListener('click',closeBackendModal);
  $('saveBackendSetup')?.addEventListener('click',saveBackend);
  $('backendModal')?.addEventListener('click',event => { if (event.target === $('backendModal')) closeBackendModal(); });
  $('appModal')?.addEventListener('click',event => { if (event.target === $('appModal')) closeModal(); });
  $('loginForm')?.addEventListener('submit',login);
  $('logoutButton')?.addEventListener('click',logout);
  $('avatarButton')?.addEventListener('click',() => { if (state.session) openView('account'); });
  $('togglePin')?.addEventListener('click',() => { const input = $('pin'); input.type = input.type === 'password' ? 'text' : 'password'; });
  $('applyUpdateButton')?.addEventListener('click',applyAppUpdate);

  window.addEventListener('offline',() => {
    updateConnectivity();
    showToast('Koneksi internet terputus. Aksi baru belum dapat dikirim.','warning',7000);
  });
  window.addEventListener('online',async() => {
    updateConnectivity();
    showToast('Koneksi internet kembali.','info');
    if (getEndpoint()) await connectBackend(getEndpoint());
    if (state.session) await recheckSession(true);
  });
  document.addEventListener('visibilitychange',() => { if (document.visibilityState === 'visible' && state.session) recheckSession(false); });

  updateConnectivity();
  const endpoint = getEndpoint();
  if (endpoint && navigator.onLine) await connectBackend(endpoint);
  const restored = state.backendReady ? await restoreSession() : false;
  if (!restored) $('loginView').classList.remove('hidden');
  $('loading').classList.add('hidden');
  if (!endpoint) $('initialSetupLink')?.classList.remove('hidden');
  registerServiceWorker().catch(() => {});
}

window.addEventListener('unhandledrejection',event => {
  const error = event.reason;
  if (error?.code === 'SESSION_EXPIRED') return;
  console.error('[Pengantaran Obat]',error?.code || 'ERROR',error?.message || String(error));
});

boot();
