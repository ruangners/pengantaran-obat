function trustedAppsScriptMessageOrigin(origin) {
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:') return false;
    return u.hostname === 'script.google.com' ||
      u.hostname === 'script.googleusercontent.com' ||
      u.hostname.endsWith('.googleusercontent.com');
  } catch (_) {
    return false;
  }
}

export class AppsScriptFormTransport {
  constructor({ endpoint, timeoutMs = 25000, onState = () => {} }) {
    this.endpoint = String(endpoint || '').trim();
    this.timeoutMs = timeoutMs;
    this.onState = onState;
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
      pending.reject(new Error('Transport dihentikan.'));
    }
    this.pending.clear();
  }

  async connect() {
    this.onState({ ready: false, message: 'Menguji koneksi backend…' });
    const result = await this.call('stage3Ping');
    const version = result?.data?.version || '';
    this.onState({ ready: true, message: `Backend siap • ${version}` });
    return result;
  }

  handleMessage(event) {
    const msg = event.data || {};
    if (msg.type !== 'ANTAROBAT_RPC_RESPONSE' || msg.nonce !== this.nonce || !msg.id) return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;

    if (!trustedAppsScriptMessageOrigin(event.origin)) {
      clearTimeout(pending.timer);
      this.pending.delete(msg.id);
      pending.cleanup();
      pending.reject(new Error(`Origin respons tidak dipercaya: ${event.origin || '(kosong)'}`));
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(msg.id);
    pending.cleanup();
    if (msg.ok) pending.resolve(msg.result);
    else {
      const err = new Error(msg.error?.message || 'Apps Script transport error');
      err.code = msg.error?.code || 'APPS_SCRIPT_ERROR';
      pending.reject(err);
    }
  }

  call(method, ...args) {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(this.endpoint)) {
      return Promise.reject(new Error('URL backend harus berupa deployment Apps Script yang berakhir /exec.'));
    }

    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const frameName = `antarobat_rpc_${id.replace(/[^a-zA-Z0-9_]/g, '_')}`;

    return new Promise((resolve, reject) => {
      const frame = document.createElement('iframe');
      frame.name = frameName;
      frame.title = 'Apps Script RPC';
      frame.style.display = 'none';
      frame.setAttribute('aria-hidden', 'true');
      document.body.appendChild(frame);

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = this.endpoint;
      form.target = frameName;
      form.acceptCharset = 'UTF-8';
      form.style.display = 'none';

      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'rpc';
      input.value = JSON.stringify({
        type: 'ANTAROBAT_RPC_REQUEST',
        id,
        nonce: this.nonce,
        method,
        args,
        origin: location.origin
      });
      form.appendChild(input);
      document.body.appendChild(form);

      const cleanup = () => {
        try { form.remove(); } catch (_) {}
        try { frame.remove(); } catch (_) {}
      };

      const timer = setTimeout(() => {
        this.pending.delete(id);
        cleanup();
        reject(new Error(`Timeout ${this.timeoutMs / 1000} detik saat memanggil ${method}.`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer, cleanup });
      form.submit();
      setTimeout(() => { try { form.remove(); } catch (_) {} }, 0);
    });
  }
}

export class PengantaranApi {
  constructor(transport) { this.transport = transport; }

  ping() { return this.transport.call('stage3Ping'); }
  login(pin, clientInfo) { return this.transport.call('stage1Login', String(pin || ''), clientInfo || {}); }
  session(token) { return this.transport.call('stage1Session', String(token || '')); }
  logout(token) { return this.transport.call('stage1Logout', String(token || '')); }

  farmasiBootstrap(token) { return this.transport.call('stage2FarmasiBootstrap', String(token || '')); }
  farmasiRows(token, searchText = '') { return this.transport.call('stage2FarmasiRows', String(token || ''), String(searchText || '')); }
  pendingReceiptVerifications(token) { return this.transport.call('stage2PendingReceiptVerifications', String(token || '')); }
  refreshFarmasiMaster(token) { return this.transport.call('stage2RefreshFarmasiMaster', String(token || '')); }
  createDelivery(token, payload) { return this.transport.call('stage2CreateDelivery', String(token || ''), payload || {}); }
  updateFarmasiRecord(token, id, payload) { return this.transport.call('stage2UpdateFarmasiRecord', String(token || ''), String(id || ''), payload || {}); }
  markReady(token, id) { return this.transport.call('stage2MarkReady', String(token || ''), String(id || '')); }
  registrationWa(token, id) { return this.transport.call('stage2RegistrationWa', String(token || ''), String(id || '')); }
  manualReceiptWa(token, id) { return this.transport.call('stage2ManualReceiptWa', String(token || ''), String(id || '')); }
  manualVerifyReceipt(token, id, method, note) {
    return this.transport.call('stage2ManualVerifyReceipt', String(token || ''), String(id || ''), String(method || ''), String(note || ''));
  }

  courierBootstrap(token) { return this.transport.call('stage3CourierBootstrap', String(token || '')); }
  courierRows(token) { return this.transport.call('stage3CourierRows', String(token || '')); }
  courierHistory(token, limit = 50) { return this.transport.call('stage3CourierHistory', String(token || ''), Number(limit) || 50); }
  claimTask(token, id) { return this.transport.call('stage3ClaimTask', String(token || ''), String(id || '')); }
  completeVerified(token, id, payload) { return this.transport.call('stage3CompleteVerified', String(token || ''), String(id || ''), payload || {}); }
  failTask(token, id, payload) { return this.transport.call('stage3FailTask', String(token || ''), String(id || ''), payload || {}); }
  reportIncident(token, payload) { return this.transport.call('stage3ReportIncident', String(token || ''), payload || {}); }
  resolveIncident(token, incidentId, resolutionNote) { return this.transport.call('stage3ResolveIncident', String(token || ''), String(incidentId || ''), String(resolutionNote || '')); }

}
