export const APP_CONFIG = Object.freeze({
  appName: 'Pengantaran Obat Gratis',
  organization: 'RSUD Provinsi Nusa Tenggara Barat',
  version: '2.0.0-stage2-farmasi',
  // Untuk trial, URL /exec tetap disimpan di browser sehingga tidak perlu ditaruh sebagai secret.
  backendUrl: '',
  backendStorageKey: 'antarobat_backend_url',
  sessionStorageKey: 'antarobat_session',
  clientIdStorageKey: 'antarobat_client_id',
  farmasiDraftKey: 'antarobat_farmasi_draft'
});
