export const APP_CONFIG = Object.freeze({
  appName: 'Pengantaran Obat Gratis',
  organization: 'RSUD Provinsi Nusa Tenggara Barat',
  version: '6.1.7-stage6b1-hf5a-notefix',
  apiContract: 'ANTAROBAT-RC1-REDELIVERY-HF5A',
  backendUrl: '',
  backendStorageKey: 'antarobat_backend_url',
  sessionStorageKey: 'antarobat_session',
  clientIdStorageKey: 'antarobat_client_id',
  farmasiDraftKey: 'antarobat_farmasi_draft',
  transportTimeoutMs: 25000,
  readRetryCount: 1,
  readRetryDelayMs: 700,
  mutationReplayWindowMs: 120000,
  mutationBusyRetryCount: 2,
  mutationBusyRetryDelayMs: 700,
  sessionRecheckMs: 5 * 60 * 1000
});
