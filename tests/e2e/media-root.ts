import os from 'node:os'
import path from 'node:path'

// MEDIA_ROOT of the e2e server: outside the repository, emptied by the global setup.
export const E2E_MEDIA_ROOT = path.join(os.tmpdir(), 'trattoria-e2e-media')
