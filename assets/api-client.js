function trustedAppsScriptMessageOrigin(origin) {
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:') return false;
    return u.hostname === 'script.google.com' ||
      u.hostname === 'script.googleusercontent.com' ||
      u.hostname.endsWith('.googleusercontent.com');
  } catch (_) { return false; }
}

function makeError(message, code = 'APPS_SCRIPT_ERROR') {
  const err = new Error(String(message || 'Terjadi kesalahan pada backend.'));
  err.code = String(code || 'APPS_SCRIPT_ERROR');
  return err;
}

function stableKey(method, args) {
  let raw = '';
  try { raw = JSON.stringify(args); } catch (_) { raw = String(args); }
  return `${method}:${raw}`;
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export class AppsScriptFormTransport {
  constructor({ endpoint, timeoutMs = 25000, expectedContract = '', onState = () => {}, onAuthError = () => {}, onRequestState = () => {} }) {
    this.endpoint = String(endpoint || '').trim();
    this.timeoutMs = timeoutMs;
    this.expectedContract = String(expectedContract || '');
    this.onState = onState;
    this.onAuthError = onAuthError;
    this.onRequestState = onRequestState;
    this.pending = new Map();
    this.nonce = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    this.boundMessage = this.handleMessage.bind(this);
    window.addEventListener('message', this.boundMessage);
  }

  destroy() {
    window.removeEventListener('message', this.boundMessage);
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.cleanup();
      pending.reject(makeError('Transport dihentikan.', 'TRANSPORT_STOPPED'));
      this.onRequestState({ active: false, method: pending.method });
    }
    this.pending.clear();
  }

  async connect() {
    this.onState({ ready: false, message: 'Menguji koneksi backend…' });
    const result = await this.call('stage2Ping');
    const version = String(result?.data?.version || '');
    const contract = String(result?.data?.apiContract || '');
    if (this.expectedContract && contract !== this.expectedContract) {
      throw makeError(`Versi backend belum kompatibel dengan aplikasi ini. Backend: ${version || 'tidak diketahui'}. Perbarui WebApiStage6B.gs lalu deploy versi baru.`, 'VERSION_MISMATCH');
    }
    this.onState({ ready: true, message: `Backend siap • ${version}` });
    return result;
  }

  handleMessage(event) {
    const msg = event.data || {};
    if (msg.type !== 'ANTAROBAT_RPC_RESPONSE' || msg.nonce !== this.nonce || !msg.id) return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;

    if (!trustedAppsScriptMessageOrigin(event.origin)) {
      clearTimeout(pending.timer); this.pending.delete(msg.id); pending.cleanup();
      this.onRequestState({ active: false, method: pending.method });
      pending.reject(makeError(`Origin respons tidak dipercaya: ${event.origin || '(kosong)'}`, 'UNTRUSTED_RESPONSE_ORIGIN'));
      return;
    }

    clearTimeout(pending.timer); this.pending.delete(msg.id); pending.cleanup();
    this.onRequestState({ active: false, method: pending.method });
    if (msg.ok) return pending.resolve(msg.result);

    const err = makeError(msg.error?.message, msg.error?.code);
    if (err.code === 'SESSION_EXPIRED') {
      try { this.onAuthError(err); } catch (_) {}
    }
    pending.reject(err);
  }

  call(method, ...args) { return this._call(method, args, ''); }
  callMutation(method, mutationId, ...args) { return this._call(method, args, String(mutationId || '')); }

  _call(method, args, mutationId) {
    if (!navigator.onLine) return Promise.reject(makeError('Perangkat sedang offline. Periksa koneksi internet lalu coba kembali.', 'OFFLINE'));
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(this.endpoint)) {
      return Promise.reject(makeError('URL backend harus berupa deployment Apps Script yang berakhir /exec.', 'INVALID_BACKEND_URL'));
    }

    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const frameName = `antarobat_rpc_${id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    this.onRequestState({ active: true, method });

    return new Promise((resolve, reject) => {
      const frame = document.createElement('iframe');
      frame.name = frameName; frame.title = 'Apps Script RPC'; frame.style.display = 'none'; frame.setAttribute('aria-hidden', 'true');
      document.body.appendChild(frame);

      const form = document.createElement('form');
      form.method = 'POST'; form.action = this.endpoint; form.target = frameName; form.acceptCharset = 'UTF-8'; form.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = 'rpc';
      input.value = JSON.stringify({ type:'ANTAROBAT_RPC_REQUEST', id, nonce:this.nonce, method, args, mutationId, origin:location.origin });
      form.appendChild(input); document.body.appendChild(form);

      const cleanup = () => { try { form.remove(); } catch (_) {} try { frame.remove(); } catch (_) {} };
      const timer = setTimeout(() => {
        this.pending.delete(id); cleanup(); this.onRequestState({ active:false, method });
        reject(makeError(`Server belum merespons setelah ${this.timeoutMs / 1000} detik. Data belum dianggap tersimpan. Jangan klik berulang; gunakan tombol yang sama setelah koneksi stabil.`, 'REQUEST_TIMEOUT'));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer, cleanup, method });
      try {
        form.submit();
        setTimeout(() => { try { form.remove(); } catch (_) {} }, 0);
      } catch (e) {
        clearTimeout(timer); this.pending.delete(id); cleanup(); this.onRequestState({ active:false, method });
        reject(makeError(e?.message || 'Gagal mengirim permintaan ke server.', 'REQUEST_SUBMIT_FAILED'));
      }
    });
  }
}

export class PengantaranApi {
  constructor(transport, options = {}) {
    this.transport = transport;
    this.mutations = new Map();
    this.recentMutationIds = new Map();
    this.readRetryCount = Number(options.readRetryCount || 0);
    this.readRetryDelayMs = Number(options.readRetryDelayMs || 700);
    this.mutationReplayWindowMs = Number(options.mutationReplayWindowMs || 120000);
    this.mutationBusyRetryCount = Number(options.mutationBusyRetryCount || 2);
    this.mutationBusyRetryDelayMs = Number(options.mutationBusyRetryDelayMs || 700);
  }

  async _read(method, ...args) {
    let attempt = 0;
    while (true) {
      try { return await this.transport.call(method, ...args); }
      catch (err) {
        const retryable = ['REQUEST_TIMEOUT','REQUEST_SUBMIT_FAILED'].includes(String(err?.code || ''));
        if (!retryable || attempt >= this.readRetryCount || !navigator.onLine) throw err;
        attempt += 1;
        await wait(this.readRetryDelayMs * attempt);
      }
    }
  }

  _mutationIdFor(key) {
    const now = Date.now();
    const old = this.recentMutationIds.get(key);
    if (old && old.expiresAt > now) return old.id;
    const id = crypto.randomUUID ? crypto.randomUUID() : `${now}-${Math.random()}`;
    this.recentMutationIds.set(key, { id, expiresAt: now + this.mutationReplayWindowMs });
    for (const [k,v] of this.recentMutationIds) if (v.expiresAt <= now) this.recentMutationIds.delete(k);
    return id;
  }

  _mutate(method, ...args) {
    const key = stableKey(method, args);
    if (this.mutations.has(key)) return this.mutations.get(key);
    const mutationId = this._mutationIdFor(key);
    const run = async () => {
      let busyAttempts = 0;
      while (true) {
        try { return await this.transport.callMutation(method, mutationId, ...args); }
        catch (err) {
          if (String(err?.code || '') !== 'REQUEST_IN_PROGRESS' || busyAttempts >= this.mutationBusyRetryCount) throw err;
          busyAttempts += 1;
          await wait(this.mutationBusyRetryDelayMs * busyAttempts);
        }
      }
    };
    const p = run().finally(() => this.mutations.delete(key));
    this.mutations.set(key, p);
    return p;
  }

  ping() { return this._read('stage2Ping'); }
  login(pin, clientInfo) { return this._mutate('stage1Login', String(pin || ''), clientInfo || {}); }
  session(token) { return this._read('stage1Session', String(token || '')); }
  logout(token) { return this._mutate('stage1Logout', String(token || '')); }

  farmasiBootstrap(token) { return this._read('stage2FarmasiBootstrap', String(token || '')); }
  farmasiRows(token, searchText = '') { return this._read('stage2FarmasiRows', String(token || ''), String(searchText || '')); }
  pendingReceiptVerifications(token) { return this._read('stage2PendingReceiptVerifications', String(token || '')); }
  failedDeliveryFollowUps(token) { return this._read('stage6B1FailedFollowUps', String(token || '')); }
  confirmReturnedToFarmasi(token, id) { return this._mutate('stage6B1ConfirmReturn', String(token || ''), String(id || '')); }
  rescheduleDelivery(token, id, payload) { return this._mutate('stage6B1Reschedule', String(token || ''), String(id || ''), payload || {}); }
  closeFailedDelivery(token, id, note) { return this._mutate('stage6B1CloseService', String(token || ''), String(id || ''), String(note || '')); }
  attemptHistory(token, id) { return this._read('stage6B1AttemptHistory', String(token || ''), String(id || '')); }
  refreshFarmasiMaster(token) { return this._read('stage2RefreshFarmasiMaster', String(token || '')); }
  createDelivery(token, payload) { return this._mutate('stage2CreateDelivery', String(token || ''), payload || {}); }
  updateFarmasiRecord(token, id, payload) { return this._mutate('stage2UpdateFarmasiRecord', String(token || ''), String(id || ''), payload || {}); }
  markReady(token, id) { return this._mutate('stage2MarkReady', String(token || ''), String(id || '')); }
  registrationWa(token, id) { return this._read('stage2RegistrationWa', String(token || ''), String(id || '')); }
  manualReceiptWa(token, id) { return this._read('stage2ManualReceiptWa', String(token || ''), String(id || '')); }
  manualVerifyReceipt(token, id, method, note) { return this._mutate('stage2ManualVerifyReceipt', String(token || ''), String(id || ''), String(method || ''), String(note || '')); }

  courierBootstrap(token) { return this._read('stage3CourierBootstrap', String(token || '')); }
  courierRows(token) { return this._read('stage3CourierRows', String(token || '')); }
  courierHistory(token, limit = 50) { return this._read('stage3CourierHistory', String(token || ''), Number(limit || 50)); }
  claimTask(token, id) { return this._mutate('stage3ClaimTask', String(token || ''), String(id || '')); }
  completeVerified(token, id, payload) { return this._mutate('stage3CompleteVerified', String(token || ''), String(id || ''), payload || {}); }
  failTask(token, id, payload) { return this._mutate('stage3FailTask', String(token || ''), String(id || ''), payload || {}); }
  reportIncident(token, payload) { return this._mutate('stage3ReportIncident', String(token || ''), payload || {}); }
  resolveIncident(token, incidentId, note) { return this._mutate('stage3ResolveIncident', String(token || ''), String(incidentId || ''), String(note || '')); }

  adminBootstrap(token) { return this._read('stage4AdminBootstrap', String(token || '')); }
  adminRows(token, search = '') { return this._read('stage4AdminRows', String(token || ''), String(search || '')); }
  adminUpdateStatus(token, id, status, note = '') { return this._mutate('stage4AdminUpdateStatus', String(token || ''), String(id || ''), String(status || ''), String(note || '')); }
  adminPendingVerifications(token) { return this._read('stage4PendingReceiptVerifications', String(token || '')); }
  adminManualReceiptWa(token, id) { return this._read('stage4ManualReceiptWa', String(token || ''), String(id || '')); }
  adminManualVerifyReceipt(token, id, method, note) { return this._mutate('stage4ManualVerifyReceipt', String(token || ''), String(id || ''), String(method || ''), String(note || '')); }
  adminIncidents(token) { return this._read('stage4Incidents', String(token || '')); }
  adminVerifyIncident(token, id, status, note) { return this._mutate('stage4VerifyIncident', String(token || ''), String(id || ''), String(status || ''), String(note || '')); }
  adminArchiveHealth(token) { return this._read('stage4ArchiveHealth', String(token || '')); }
  adminRefreshMaster(token) { return this._read('stage4RefreshMaster', String(token || '')); }
  adminAuditRows(token, limit = 100) { return this._read('stage4AuditRows', String(token || ''), Number(limit || 100)); }

  managementData(token, startDate, endDate, basis = 'DAFTAR') {
    return this._read('stage5ManagementData', String(token || ''), String(startDate || ''), String(endDate || ''), String(basis || 'DAFTAR'));
  }
}
