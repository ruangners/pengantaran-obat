import { APP_CONFIG } from './config.js';
import { AppsScriptFormTransport, PengantaranApi } from './api-client.js';

const $ = id => document.getElementById(id);
const state = { api:null, transport:null, endpoint:'', session:null, view:'home', backendReady:false };

const NAV = {
  FARMASI: [
    ['home','⌂','Beranda'],['registration','＋','Pendaftaran'],['today','▤','Hari Ini'],['verification','✓','Verifikasi'],['labels','▣','Label']
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
  home:['Beranda','Ringkasan sesuai role pengguna'], registration:['Pendaftaran','Pendaftaran pengantaran obat'], today:['Pengantaran Hari Ini','Pemantauan alur hari ini'], verification:['Verifikasi','Verifikasi penerimaan manual'], labels:['Label','Antrean dan cetak label'], ready:['Siap Diambil','Paket siap diambil kurir'], tasks:['Tugas Saya','Pengantaran aktif'], history:['Riwayat','Riwayat tugas kurir'], account:['Akun','Informasi akun dan perangkat'], operations:['Operasional','Kontrol operasional Admin'], incidents:['Kendala','Kendala kurir dan tindak lanjut'], archive:['Arsip','Kesehatan arsip tahunan'], master:['Master Data','Wilayah dan konfigurasi'], audit:['Audit','Jejak aktivitas sistem'], performance:['Kinerja','Kinerja layanan dan kurir'], areas:['Wilayah','Distribusi layanan per wilayah'], reports:['Laporan','Laporan periode dan PDF']
};

function escapeHtml(v){return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function initials(name){return String(name||'A').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase() || 'A';}
function getClientId(){let id=localStorage.getItem(APP_CONFIG.clientIdStorageKey);if(!id){id=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;localStorage.setItem(APP_CONFIG.clientIdStorageKey,id);}return id;}
function getEndpoint(){return String(APP_CONFIG.backendUrl || localStorage.getItem(APP_CONFIG.backendStorageKey) || '').trim();}
function saveEndpoint(url){localStorage.setItem(APP_CONFIG.backendStorageKey,String(url||'').trim());}
function showAlert(target,text,type='error'){target.innerHTML=text?`<div class="alert ${type}">${escapeHtml(text)}</div>`:'';}
function setBackendState(ready,message){state.backendReady=ready;const el=$('backendState');if(!el)return;el.innerHTML=`<span class="dot ${ready?'ok':'bad'}"></span><span>${escapeHtml(message)}</span>`;}

function initTransport(endpoint){
  if(state.transport) state.transport.destroy();
  state.endpoint=endpoint;
  state.transport=new AppsScriptFormTransport({endpoint,onState:s=>setBackendState(Boolean(s.ready),s.message)});
  state.api=new PengantaranApi(state.transport);
}

async function connectBackend(endpoint=getEndpoint()){
  if(!endpoint){setBackendState(false,'Backend belum dikonfigurasi');return false;}
  initTransport(endpoint);
  try{await state.transport.connect();return true;}catch(e){setBackendState(false,e.message);return false;}
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
    state.session={token:result.data.token,user:result.data.user};
    sessionStorage.setItem(APP_CONFIG.sessionStorageKey,JSON.stringify(state.session));
    $('pin').value='';showApp();
  }catch(e){showAlert($('loginMessage'),e.message);}
  finally{$('loginButton').disabled=false;$('loginButton').textContent='Masuk';}
}

async function restoreSession(){
  const raw=sessionStorage.getItem(APP_CONFIG.sessionStorageKey);if(!raw)return false;
  try{const saved=JSON.parse(raw);if(!saved?.token)return false;const result=await state.api.session(saved.token);state.session={token:saved.token,user:result.data.user};sessionStorage.setItem(APP_CONFIG.sessionStorageKey,JSON.stringify(state.session));showApp();return true;}catch(_){sessionStorage.removeItem(APP_CONFIG.sessionStorageKey);return false;}
}

async function logout(){
  const token=state.session?.token;try{if(token&&state.api)await state.api.logout(token);}catch(_){}
  state.session=null;sessionStorage.removeItem(APP_CONFIG.sessionStorageKey);$('appView').classList.add('hidden');$('loginView').classList.remove('hidden');setTimeout(()=>$('pin').focus(),80);
}

function buildNav(){
  const role=state.session.user.role;const items=NAV[role]||NAV.FARMASI;
  $('sideNav').innerHTML=items.map(i=>`<button class="nav-item" data-view="${i[0]}"><span class="nav-icon">${i[1]}</span>${escapeHtml(i[2])}</button>`).join('');
  const mobileItems=items.slice(0,5);$('bottomNav').style.setProperty('--nav-count',mobileItems.length);$('bottomNav').innerHTML=mobileItems.map(i=>`<button data-view="${i[0]}"><span>${i[1]}</span>${escapeHtml(i[2])}</button>`).join('');
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>openView(b.dataset.view)));
}

function showApp(){
  const u=state.session.user;$('loginView').classList.add('hidden');$('appView').classList.remove('hidden');
  $('sideUserName').textContent=u.name;$('sideUserRole').textContent=u.role;$('roleChip').textContent=u.role;$('avatar').textContent=initials(u.name);
  buildNav();openView('home');
}

function openView(view){
  state.view=view;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const [title,sub]=PAGE_META[view]||['Menu','Pengantaran Obat Gratis'];$('pageTitle').textContent=title;$('pageSubtitle').textContent=sub;
  $('pageContent').innerHTML=view==='home'?renderHome():view==='account'?renderAccount():renderPlaceholder(view,title);
  window.scrollTo({top:0,behavior:'auto'});
}

function roleHomeCopy(role){
  if(role==='FARMASI')return ['Farmasi','Pendaftaran, kesiapan obat, verifikasi penerimaan, dan pencetakan label tetap mengikuti workflow Produksi V1.'];
  if(role==='KURIR')return ['Kurir','Antrean siap, tugas aktif, Maps, WhatsApp, kode penerimaan, dan kendala akan tetap berada pada alur yang sudah dikenal.'];
  if(role==='ADMIN')return ['Admin Sistem','Kontrol operasional, verifikasi, kendala, arsip, master data, dan audit dirangkum dalam satu pusat kendali.'];
  return ['Manajemen','Ringkasan KPI, kinerja, wilayah, dan laporan tetap menggunakan data agregat tanpa identitas pasien.'];
}

function renderHome(){
  const role=state.session.user.role;const [label,copy]=roleHomeCopy(role);const name=escapeHtml(state.session.user.name.split(' ')[0]||state.session.user.name);
  return `<section class="hero"><div class="eyebrow">${escapeHtml(label.toUpperCase())}</div><h1>Selamat datang, ${name}</h1><p>${escapeHtml(copy)}</p><div class="hero-actions"><button class="secondary-btn" disabled>Modul operasional masuk Tahap 2</button><span class="tag ready">Tahap 1 • Shell & Login aktif</span></div></section>
  <section class="section"><div class="section-head"><div><h2>Fondasi antarmuka</h2><p>Struktur menu sudah mengikuti role. Angka operasional sengaja belum dihubungkan pada tahap ini.</p></div></div><div class="grid grid-4">
  ${metric('Status Backend','TERHUBUNG','Apps Script API form-post')}${metric('Sesi','AKTIF','Token hanya di session browser')}${metric('Role',role,'Divalidasi oleh backend')}${metric('Frontend','PWA','GitHub Pages • responsif')}</div></section>
  <section class="section"><div class="section-head"><div><h2>Arah modul berikutnya</h2><p>Tampilan dipertahankan; fungsi akan dihubungkan satu per satu tanpa mengubah workflow.</p></div></div><div class="grid grid-2">${quickCards(role)}</div></section>`;
}
function metric(label,value,note){return `<div class="card"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(value)}</div><div class="metric-note">${escapeHtml(note)}</div></div>`;}
function quickCards(role){const items=(NAV[role]||[]).filter(x=>x[0]!=='home').slice(0,4);return items.map(i=>`<div class="card quick-card"><div class="quick-icon">${i[1]}</div><div><strong>${escapeHtml(i[2])}</strong><span>Struktur siap • fungsi operasional belum diaktifkan.</span></div><button data-quick-view="${i[0]}" disabled>Segera</button></div>`).join('');}
function renderPlaceholder(view,title){return `<section class="hero"><div class="eyebrow">STRUKTUR FROZEN</div><h1>${escapeHtml(title)}</h1><p>Menu ini sengaja sudah ditempatkan pada posisi final agar pengguna tidak perlu menyesuaikan navigasi lagi saat backend nanti naik kelas.</p></section><section class="section"><div class="placeholder"><div class="placeholder-icon">⌁</div><div><h3>Belum dihubungkan pada Tahap 1</h3><p>Fungsi ${escapeHtml(title)} akan dipindahkan dari Produksi V1 pada tahap migrasi modul berikutnya. Tidak ada data pasien yang dibaca oleh halaman ini sekarang.</p><div style="margin-top:10px"><span class="tag">UI CONTRACT</span></div></div></div></section>`;}
function renderAccount(){const u=state.session.user;return `<section class="hero"><div class="eyebrow">AKUN PETUGAS</div><h1>${escapeHtml(u.name)}</h1><p>Role dan identitas sesi berasal dari backend Apps Script. PIN tidak disimpan pada GitHub Pages.</p></section><section class="section"><div class="grid grid-2"><div class="card"><div class="metric-label">ROLE</div><div class="metric-value">${escapeHtml(u.role)}</div><div class="metric-note">Hak akses tetap diperiksa backend.</div></div><div class="card"><div class="metric-label">EMAIL</div><div style="font-size:18px;font-weight:850;margin-top:8px;word-break:break-word">${escapeHtml(u.email||'-')}</div><div class="metric-note">Sumber: sheet AKSES Produksi V1.</div></div></div></section>`;}

async function boot(){
  $('openBackendSetup').addEventListener('click',openBackendModal);$('backendButton').addEventListener('click',openBackendModal);$('closeBackendSetup').addEventListener('click',closeBackendModal);$('saveBackendSetup').addEventListener('click',saveBackend);$('backendModal').addEventListener('click',e=>{if(e.target===$('backendModal'))closeBackendModal();});
  $('loginForm').addEventListener('submit',login);$('logoutButton').addEventListener('click',logout);$('togglePin').addEventListener('click',()=>{const input=$('pin');input.type=input.type==='password'?'text':'password';});
  const endpoint=getEndpoint();if(endpoint)await connectBackend(endpoint);
  const restored=state.backendReady?await restoreSession():false;
  if(!restored)$('loginView').classList.remove('hidden');$('loading').classList.add('hidden');
  if(!endpoint)setTimeout(openBackendModal,250);
  if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{});}
}
boot();
