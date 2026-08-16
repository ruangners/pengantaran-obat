export const APP_CONFIG = Object.freeze({
  appName: 'Pengantaran Obat Gratis',
  organization: 'RSUD Provinsi Nusa Tenggara Barat',
  version: '6.1.3-stage6b1-hf2-followupflow',
  apiContract: 'ANTAROBAT-RC1-REDELIVERY-HF2',
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
