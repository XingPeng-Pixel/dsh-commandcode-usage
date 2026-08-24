import { clientBundle } from './build/tsdown.client.ts'

/**
 * Self-contained bundle for the plugin:
 *  - lib/index.js  Host half (Node)
 *  - lib/client.js Browser half (web dsh.client)
 * The profile supplies @deepseek-ai/* at runtime; everything else the browser
 * half needs (React, settings scope) rides the shell module table.
 */
export default clientBundle(
  'dsh-commandcode-usage-monitor',
  ['src/index.ts'],
  {
    lib: {
      // Host-side externals: resolved from the profile's node_modules.
      external: [
        '@deepseek-ai/cordis',
        '@deepseek-ai/schemastery',
        '@deepseek-ai/dsh-credentials',
        '@deepseek-ai/dsh-launch-environment',
        '@deepseek-ai/dsh-commands',
        '@deepseek-ai/dsh-host-webserver',
        '@deepseek-ai/dsh-settings',
      ],
    },
  },
)
