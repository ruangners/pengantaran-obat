export const APP_CONFIG = Object.freeze({
  appName: 'Pengantaran Obat Gratis',
  organization: 'RSUD Provinsi Nusa Tenggara Barat',
  version: '5.0.1-stage5-hf1-cachefix',
  // Untuk trial, URL /exec tetap disimpan di browser sehingga tidak perlu ditaruh sebagai secret.
  backendUrl: '',
  backendStorageKey: 'antarobat_backend_url',
  sessionStorageKey: 'antarobat_session',
  clientIdStorageKey: 'antarobat_client_id',
  farmasiDraftKey: 'antarobat_farmasi_draft'
});
