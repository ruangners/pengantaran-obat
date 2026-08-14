export const APP_CONFIG = Object.freeze({
  appName: 'Pengantaran Obat Gratis',
  organization: 'RSUD Provinsi Nusa Tenggara Barat',
  version: '1.0.0-stage1-shell-login',
  // Kosongkan saat pengembangan awal: pengguna pertama kali akan diminta menempel URL /exec.
  // Untuk rilis internal nanti, isi URL deployment Apps Script di sini agar pengguna tidak perlu setup.
  backendUrl: '',
  backendStorageKey: 'antarobat_backend_url',
  sessionStorageKey: 'antarobat_session',
  clientIdStorageKey: 'antarobat_client_id'
});
