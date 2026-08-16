import { APP_CONFIG } from './config.js?v=6.1.7-hf5a';
import { AppsScriptFormTransport, PengantaranApi } from './api-client.js?v=6.1.7-hf5a';
import { createFarmasiModule } from './farmasi.js?v=6.1.7-hf5a';
import { createCourierModule } from './courier.js?v=6.1.7-hf5a';
import { createAdminModule } from './admin.js?v=6.1.7-hf5a';
import { createManagementModule } from './management.js?v=6.1.7-hf5a';

const $ = id => document.getElementById(id);
const state = { api:null, transport:null, endpoint:'', session:null, view:'home', backendReady:false, backendInfo:null, activeRequests:0, lastSessionCheck:0, authResetting:false, updateRegistration:null, updateRequested:false };

const NAV = {
  FARMASI: [
    ['home','⌂','Beranda'],['registration','＋','Pendaftaran'],['today','▤','Hari Ini'],['verification','✓','Verifikasi'],['followup','↺','Tindak Lanjut'],['labels','▣','Label']
  ],
  KURIR: [
    ['home','⌂','Beranda'],['ready','◎','Siap'],['tasks','➜','Tugas'],['history','↺','Riwayat'],['account','●','Akun']
  ],
  ADMIN: [
    ['home','⌂','Beranda'],['operations','▤','Operasional'],['verification','✓','Verifikasi'],['incidents','⚠','Kendala'],['archive','▣','Arsip'],['master','◆','Master'],['audit','≡','Audit']
  ],
  MANAJEMEN: [
    ['home','⌂','Ringkasan'],['performance','▥','Kinerja'],['areas','⌖','Wilayah'],['reports','▧','Laporan'],['account','●','Akun']
  ]
};

const PAGE_META = {
  home:['Beranda','Ringkasan sesuai role pengguna'], registration:['Pendaftaran','Pendaftaran pengantaran obat'], today:['Pengantaran Hari Ini','Pemantauan alur hari ini'], verification:['Verifikasi','Verifikasi penerimaan manual'], followup:['Tindak Lanjut','Gagal antar, retry, dan ambil mandiri'], labels:['Label','Cetak dan cetak ulang label A6'], ready:['Siap Diambil','Paket siap diambil kurir'], tasks:['Tugas Saya','Pengantaran aktif'], history:['Riwayat','Riwayat tugas kurir'], account:['Akun','Informasi akun dan perangkat'], operations:['Operasional','Kontrol operasional Admin'], incidents:['Kendala','Kendala kurir dan tindak lanjut'], archive:['Arsip','Kesehatan arsip tahunan'], master:['Master Data','Wilayah dan konfigurasi'], audit:['Audit','Jejak aktivitas sistem'], performance:['Kinerja','Kinerja layanan dan kurir'], areas:['Wilayah','Distribusi layanan per wilayah'], reports:['Laporan','Laporan periode dan PDF']
};

export function escapeHtml(v){return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function initials(name){return String(name||'A').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase() || 'A';}
function getClientId(){let id=localStorage.getItem(APP_CONFIG.clientIdStorageKey);if(!id){id=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;localStorage.setItem(APP_CONFIG.clientIdStorageKey,id);}return id;}
function getEndpoint(){return String(APP_CONFIG.backendUrl || localStorage.getItem(APP_CONFIG.backendStorageKey) || '').trim();}
function saveEndpoint(url){localStorage.setItem(APP_CONFIG.backendStorageKey,String(url||'').trim());}
function showAlert(target,text,type='error'){target.innerHTML=text?`<div class="alert ${type}">${escapeHtml(text)}</div>`:'';}
function setBackendState(ready,message){state.backendReady=ready;const el=$('backendState');if(!el)return;el.innerHTML=`<span class="dot ${ready?'ok':'bad'}"></span><span>${escapeHtml(message)}</span>`;}

function setRequestState({active=false}={}){
  state.activeRequests=Math.max(0,state.activeRequests+(active?1:-1));
  const bar=$('requestBar'); if(!bar)return;
  bar.classList.toggle('active',state.activeRequests>0);
}

function updateConnectivity(){
  const offline=!navigator.onLine; const banner=$('networkBanner');
  if(banner) banner.classList.toggle('hidden',!offline);
  if(offline) setBackendState(false,'Perangkat offline');
}

function clearLocalSession(){
  farmasi.resetForLogout(); courier.resetForLogout(); admin.resetForLogout(); management.resetForLogout();
  state.session=null; state.lastSessionCheck=0; sessionStorage.removeItem(APP_CONFIG.sessionStorageKey);
}

function showLogin(message=''){
  clearLocalSession(); closeModal();
  $('appView').classList.add('hidden'); $('loginView').classList.remove('hidden');
  if(message) showAlert($('loginMessage'),message,'error');
  setTimeout(()=>$('pin')?.focus(),80);
}

function handleSessionExpired(err){
  if(state.authResetting)return; state.authResetting=true;
  showLogin('Sesi Anda telah berakhir. Silakan masuk kembali. Data yang belum mendapat konfirmasi berhasil dari server tidak dianggap tersimpan.');
  showToast('Sesi berakhir. Silakan masuk kembali.','warning',6000);
  setTimeout(()=>{state.authResetting=false;},300);
}

async function recheckSession(force=false){
  if(!state.session?.token||!state.api||!navigator.onLine)return false;
  const now=Date.now(); if(!force&&now-state.lastSessionCheck<APP_CONFIG.sessionRecheckMs)return true;
  try{
    const result=await state.api.session(state.session.token);
    state.session.user=result.data.user; state.lastSessionCheck=now;
    sessionStorage.setItem(APP_CONFIG.sessionStorageKey,JSON.stringify(state.session));
    return true;
  }catch(e){
    if(e.code==='SESSION_EXPIRED') handleSessionExpired(e);
    return false;
  }
}

function showToast(message, type='info', timeout=4200){
  const box=$('toastContainer'); if(!box || !message)return;
  const toast=document.createElement('div'); toast.className=`toast ${type}`; toast.innerHTML=`<span class="toast-dot"></span><span>${escapeHtml(message)}</span><button aria-label="Tutup">×</button>`;
  const close=()=>{toast.classList.add('leaving');setTimeout(()=>toast.remove(),180);};
  toast.querySelector('button').addEventListener('click',close); box.appendChild(toast); setTimeout(close,timeout);
}

function openModal(html,{wide=false}={}){
  $('modalContent').className=`modal ${wide?'wide':''}`; $('modalContent').innerHTML=html; $('appModal').classList.remove('hidden'); document.body.classList.add('modal-open');
  $('modalContent').querySelectorAll('[data-modal-close]').forEach(b=>b.addEventListener('click',closeModal));
}
function closeModal(){ $('appModal').classList.add('hidden'); $('modalContent').innerHTML=''; document.body.classList.remove('modal-open'); }

function confirmAction({title='Konfirmasi',message='',confirmLabel='Lanjutkan',tone='normal'}={}){
  return new Promise(resolve=>{
    openModal(`<div class="modal-head"><div><div class="eyebrow">KONFIRMASI</div><h3>${escapeHtml(title)}</h3></div><button class="modal-x" id="confirmClose">×</button></div><div class="confirm-message">${escapeHtml(message).replace(/\n/g,'<br>')}</div><div class="modal-actions"><button id="confirmCancel" class="secondary-btn">Batal</button><button id="confirmOk" class="${tone==='warning'?'warning-btn':'primary-btn'}">${escapeHtml(confirmLabel)}</button></div>`);
    let done=false; const finish=value=>{if(done)return;done=true;closeModal();resolve(value);};
    $('confirmClose').addEventListener('click',()=>finish(false)); $('confirmCancel').addEventListener('click',()=>finish(false)); $('confirmOk').addEventListener('click',()=>finish(true));
  });
}

function setNavBadge(view,count){
  const n=Math.max(0,Number(count||0));
  document.querySelectorAll(`[data-nav-badge="${view}"]`).forEach(el=>{
    el.textContent=n>99?'99+':String(n);
    el.classList.toggle('hidden',!n);
  });
}

const farmasi = createFarmasiModule({
  escapeHtml,
  getApi:()=>state.api,
  getToken:()=>state.session?.token||'',
  getUser:()=>state.session?.user||null,
  navigate:openView,
  openModal,
  closeModal,
  confirmAction,
  showToast,
  setNavBadge
});

const courier = createCourierModule({
  escapeHtml,
  getApi:()=>state.api,
  getToken:()=>state.session?.token||'',
  getUser:()=>state.session?.user||null,
  getView:()=>state.view,
  navigate:openView,
  openModal,
  closeModal,
  confirmAction,
  showToast
});

const admin = createAdminModule({
  escapeHtml,
  getApi:()=>state.api,
  getToken:()=>state.session?.token||'',
  getUser:()=>state.session?.user||null,
  getView:()=>state.view,
  navigate:openView,
  openModal,
  closeModal,
  confirmAction,
  showToast
});

const management = createManagementModule({
  escapeHtml,
  getApi:()=>state.api,
  getToken:()=>state.session?.token||'',
  getUser:()=>state.session?.user||null,
  getView:()=>state.view,
  navigate:openView,
  openModal,
  closeModal,
  confirmAction,
  showToast
});

function initTransport(endpoint){
  if(state.transport) state.transport.destroy();
  state.endpoint=endpoint;
  state.transport=new AppsScriptFormTransport({endpoint,timeoutMs:APP_CONFIG.transportTimeoutMs,expectedContract:APP_CONFIG.apiContract,onState:s=>setBackendState(Boolean(s.ready),s.message),onAuthError:handleSessionExpired,onRequestState:setRequestState});
  state.api=new PengantaranApi(state.transport,{readRetryCount:APP_CONFIG.readRetryCount,readRetryDelayMs:APP_CONFIG.readRetryDelayMs,mutationReplayWindowMs:APP_CONFIG.mutationReplayWindowMs,mutationBusyRetryCount:APP_CONFIG.mutationBusyRetryCount,mutationBusyRetryDelayMs:APP_CONFIG.mutationBusyRetryDelayMs});
}

async function connectBackend(endpoint=getEndpoint()){
  if(!endpoint){setBackendState(false,'Backend belum dikonfigurasi');return false;}
  initTransport(endpoint);
  try{const result=await state.transport.connect();state.backendInfo=result?.data||null;return true;}catch(e){state.backendInfo=null;setBackendState(false,e.message);if(e?.code==='VERSION_MISMATCH')showToast(e.message,'warning',9000);return false;}
}

function openBackendModal(){ $('backendUrl').value=getEndpoint();showAlert($('backendModalMessage'),'');$('backendModal').classList.remove('hidden');setTimeout(()=>$('backendUrl').focus(),50); }
function closeBackendModal(){ $('backendModal').classList.add('hidden'); }

async function saveBackend(){
  const url=$('backendUrl').value.trim();
  if(!url.endsWith('/exec')){showAlert($('backendModalMessage'),'URL harus berupa deployment Apps Script yang berakhir /exec.');return;}
  saveEndpoint(url);$('saveBackendSetup').disabled=true;showAlert($('backendModalMessage'),'Menguji koneksi…','info');
  const ok=await connectBackend(url);
  $('saveBackendSetup').disabled=false;
  if(ok){showAlert($('backendModalMessage'),'Backend berhasil terhubung.','info');setTimeout(closeBackendModal,500);}else showAlert($('backendModalMessage'),'Backend belum dapat dihubungi. Periksa deployment dan URL.');
}

async function login(ev){
  ev.preventDefault();showAlert($('loginMessage'),'');
  if(!state.backendReady){const ok=await connectBackend();if(!ok){openBackendModal();return;}}
  const pin=$('pin').value.trim();if(!pin)return;
  $('loginButton').disabled=true;$('loginButton').textContent='Memeriksa…';
  try{
    const result=await state.api.login(pin,{clientId:getClientId(),userAgent:navigator.userAgent,origin:location.origin});
    state.session={token:result.data.token,user:result.data.user}; state.lastSessionCheck=Date.now();
    sessionStorage.setItem(APP_CONFIG.sessionStorageKey,JSON.stringify(state.session));
    $('pin').value='';showApp();
  }catch(e){showAlert($('loginMessage'),e.message);}
  finally{$('loginButton').disabled=false;$('loginButton').textContent='Masuk';}
}

async function restoreSession(){
  const raw=sessionStorage.getItem(APP_CONFIG.sessionStorageKey);if(!raw)return false;
  try{const saved=JSON.parse(raw);if(!saved?.token)return false;const result=await state.api.session(saved.token);state.session={token:saved.token,user:result.data.user};state.lastSessionCheck=Date.now();sessionStorage.setItem(APP_CONFIG.sessionStorageKey,JSON.stringify(state.session));showApp();return true;}catch(e){sessionStorage.removeItem(APP_CONFIG.sessionStorageKey);if(e?.code==='SESSION_EXPIRED')showAlert($('loginMessage'),'Sesi sebelumnya telah berakhir. Silakan masuk kembali.','info');return false;}
}

async function logout(){
  const token=state.session?.token; const btn=$('logoutButton'); if(btn){btn.disabled=true;btn.textContent='Keluar…';}
  try{if(token&&state.api&&navigator.onLine)await state.api.logout(token);}catch(_){}
  showLogin('');
  if(btn){btn.disabled=false;btn.textContent='Keluar';}
}

function buildNav(){
  const role=state.session.user.role;const items=NAV[role]||NAV.FARMASI;
  $('sideNav').innerHTML=items.map(i=>`<button class="nav-item" data-view="${i[0]}"><span class="nav-icon">${i[1]}</span>${escapeHtml(i[2])}<span class="nav-count-badge hidden" data-nav-badge="${i[0]}"></span></button>`).join('');
  const mobileItems=role==='FARMASI'?items:items.slice(0,5);$('bottomNav').style.setProperty('--nav-count',mobileItems.length);$('bottomNav').innerHTML=mobileItems.map(i=>`<button data-view="${i[0]}"><span>${i[1]}</span>${escapeHtml(i[2])}<span class="nav-count-badge hidden" data-nav-badge="${i[0]}"></span></button>`).join('');
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>openView(b.dataset.view)));
}

function showApp(){
  const u=state.session.user;
  u.role=String(u.role||'').trim().toUpperCase();$('loginView').classList.add('hidden');$('appView').classList.remove('hidden');
  $('sideUserName').textContent=u.name;$('sideUserRole').textContent=u.role;$('roleChip').textContent=u.role;$('avatar').textContent=initials(u.name);
  buildNav();openView('home');
}

function openView(view){
  state.view=view;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const role=String(state.session?.user?.role||'').trim().toUpperCase();
  const [title,sub]=(role==='MANAJEMEN'&&view==='home')?['Ringkasan','KPI layanan dan mutu pengantaran obat']:(PAGE_META[view]||['Menu','Pengantaran Obat Gratis']);$('pageTitle').textContent=title;$('pageSubtitle').textContent=sub;
  $('pageContent').innerHTML=''; window.scrollTo({top:0,behavior:'auto'});

  if(role==='FARMASI'){
    if(view==='home') return farmasi.renderHome();
    if(view==='registration') return farmasi.renderRegistration();
    if(view==='today') return farmasi.renderToday();
    if(view==='verification') return farmasi.renderVerification();
    if(view==='followup') return farmasi.renderFollowUp();
    if(view==='labels') return farmasi.renderLabels();
  }
  if(role==='KURIR'){
    if(view==='home') return courier.renderHome();
    if(view==='ready') return courier.renderReady();
    if(view==='tasks') return courier.renderTasks();
    if(view==='history') return courier.renderHistory();
  }
  if(role==='ADMIN'){
    if(view==='home') return admin.renderHome();
    if(view==='operations') return admin.renderOperations();
    if(view==='verification') return admin.renderVerification();
    if(view==='incidents') return admin.renderIncidents();
    if(view==='archive') return admin.renderArchive();
    if(view==='master') return admin.renderMaster();
    if(view==='audit') return admin.renderAudit();
  }
  if(role==='MANAJEMEN'){
    if(view==='home') return management.renderHome();
    if(view==='performance') return management.renderPerformance();
    if(view==='areas') return management.renderAreas();
    if(view==='reports') return management.renderReports();
  }
  if(view==='account') return void ($('pageContent').innerHTML=renderAccount());
  if(view==='home') return void ($('pageContent').innerHTML=renderRoleHome());
  $('pageContent').innerHTML=renderPlaceholder(view,title);
}

function roleHomeCopy(role){
  if(role==='KURIR')return ['Kurir','Antrean siap, tugas aktif, Maps, WhatsApp, kode penerimaan, dan kendala.'];
  if(role==='ADMIN')return ['Admin Sistem','Kontrol operasional, verifikasi, kendala, arsip, master data, dan audit dirangkum dalam satu pusat kendali.'];
  return ['Manajemen','Ringkasan KPI, kinerja, wilayah, dan laporan tetap menggunakan data agregat tanpa identitas pasien.'];
}

function renderRoleHome(){
  const role=state.session.user.role;const [label,copy]=roleHomeCopy(role);const name=escapeHtml(state.session.user.name.split(' ')[0]||state.session.user.name);
  return `<section class="hero compact"><div><div class="eyebrow">${escapeHtml(label.toUpperCase())}</div><h1>Selamat datang, ${name}</h1><p>${escapeHtml(copy)}</p></div></section>
  <section class="section"><div class="grid grid-4">${metric('Status Backend','TERHUBUNG','Apps Script API')}${metric('Sesi','AKTIF','Token session browser')}${metric('Role',role,'Divalidasi backend')}${metric('Frontend','PWA','GitHub Pages')}</div></section>
  <section class="section"><div class="placeholder"><div class="placeholder-icon">⌁</div><div><h3>Modul ${escapeHtml(label)} masuk tahap berikutnya</h3><p>Struktur navigasi sudah final. Fungsi operasional akan dihubungkan tanpa mengubah cara pengguna berpindah menu.</p></div></div></section>`;
}
function metric(label,value,note){return `<div class="card metric-card"><div class="metric-top"><span>${escapeHtml(label)}</span></div><div class="metric-value">${escapeHtml(value)}</div><div class="metric-note">${escapeHtml(note)}</div></div>`;}
function renderPlaceholder(view,title){return `<section class="hero compact"><div><div class="eyebrow">STRUKTUR TETAP</div><h1>${escapeHtml(title)}</h1><p>Posisi menu dipertahankan agar pengguna tidak perlu menyesuaikan navigasi saat modul ini diaktifkan.</p></div></section><section class="section"><div class="placeholder"><div class="placeholder-icon">⌁</div><div><h3>Fungsi belum diaktifkan</h3><p>Modul ${escapeHtml(title)} akan dihubungkan pada tahap berikutnya. Tahap 2 memfokuskan migrasi penuh pada Farmasi.</p></div></div></section>`;}
function renderAccount(){const u=state.session.user;return `<section class="hero compact"><div><div class="eyebrow">AKUN PETUGAS</div><h1>${escapeHtml(u.name)}</h1><p>Role dan identitas sesi berasal dari backend Apps Script. PIN tidak disimpan pada GitHub Pages.</p></div></section><section class="section"><div class="grid grid-2"><div class="card"><div class="metric-top"><span>ROLE</span></div><div class="metric-value">${escapeHtml(u.role)}</div><div class="metric-note">Hak akses tetap diperiksa backend.</div></div><div class="card"><div class="metric-top"><span>EMAIL</span></div><div class="account-email">${escapeHtml(u.email||'-')}</div><div class="metric-note">Sumber: sheet AKSES Produksi V1.</div></div><div class="card"><div class="metric-top"><span>VERSI FRONTEND</span></div><div class="account-email">${escapeHtml(APP_CONFIG.version)}</div><div class="metric-note">GitHub Pages • update aman tanpa reload mendadak.</div></div><div class="card"><div class="metric-top"><span>VERSI BACKEND</span></div><div class="account-email">${escapeHtml(state.backendInfo?.version||'-')}</div><div class="metric-note">Kontrak ${escapeHtml(state.backendInfo?.apiContract||'-')} • ${navigator.onLine?'ONLINE':'OFFLINE'}.</div></div></div></section>`;}


function showUpdateAvailable(registration){
  state.updateRegistration=registration||state.updateRegistration;
  const banner=$('updateBanner'); if(!banner)return;
  banner.classList.remove('hidden');
}

function hideUpdateAvailable(){ $('updateBanner')?.classList.add('hidden'); }

async function applyAppUpdate(){
  const reg=state.updateRegistration || await navigator.serviceWorker.getRegistration();
  if(!reg?.waiting){hideUpdateAvailable();location.reload();return;}
  state.updateRequested=true;
  $('applyUpdateButton').disabled=true;$('applyUpdateButton').textContent='Memperbarui…';
  reg.waiting.postMessage({type:'SKIP_WAITING'});
}

async function registerServiceWorker(){
  if(!('serviceWorker' in navigator))return;
  const reg=await navigator.serviceWorker.register('./sw.js?v=6.1.7-hf5a',{updateViaCache:'none'});
  state.updateRegistration=reg;
  if(reg.waiting && navigator.serviceWorker.controller) showUpdateAvailable(reg);
  reg.addEventListener('updatefound',()=>{
    const worker=reg.installing;if(!worker)return;
    worker.addEventListener('statechange',()=>{
      if(worker.state==='installed' && navigator.serviceWorker.controller) showUpdateAvailable(reg);
    });
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(state.updateRequested) location.reload();
  });
  try{await reg.update();}catch(_){}
}

async function boot(){
  $('openBackendSetup').addEventListener('click',openBackendModal);$('backendButton').addEventListener('click',openBackendModal);$('closeBackendSetup').addEventListener('click',closeBackendModal);$('saveBackendSetup').addEventListener('click',saveBackend);$('backendModal').addEventListener('click',e=>{if(e.target===$('backendModal'))closeBackendModal();});
  $('appModal').addEventListener('click',e=>{if(e.target===$('appModal'))closeModal();});
  $('loginForm').addEventListener('submit',login);$('logoutButton').addEventListener('click',logout);$('togglePin').addEventListener('click',()=>{const input=$('pin');input.type=input.type==='password'?'text':'password';});$('applyUpdateButton')?.addEventListener('click',applyAppUpdate);
  window.addEventListener('offline',()=>{updateConnectivity();showToast('Koneksi internet terputus. Aksi baru tidak akan dikirim sampai perangkat online.','warning',7000);});
  window.addEventListener('online',async()=>{updateConnectivity();showToast('Koneksi internet kembali. Memeriksa server…','info');if(getEndpoint())await connectBackend(getEndpoint());if(state.session)await recheckSession(true);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.session)recheckSession(false);});
  updateConnectivity();
  const endpoint=getEndpoint();if(endpoint&&navigator.onLine)await connectBackend(endpoint);
  const restored=state.backendReady?await restoreSession():false;
  if(!restored)$('loginView').classList.remove('hidden');$('loading').classList.add('hidden');
  if(!endpoint)setTimeout(openBackendModal,250);
  registerServiceWorker().catch(()=>{});
}
console.info('[Pengantaran Obat] Frontend build 6.1.7-stage6b1-hf5a-notefix');
window.addEventListener('unhandledrejection',event=>{const e=event.reason;if(e?.code==='SESSION_EXPIRED')return;console.error('[Pengantaran Obat] Unhandled promise rejection:',e?.code||'ERROR',e?.message||String(e));});
boot();
