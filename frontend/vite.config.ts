import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react-swc'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import { zodLocalePlugin } from './scripts/vite-zod-locale-plugin.js'

const backendPort = process.env.BACKEND_PORT || '5000'

export default defineConfig(() => {
	return {
		plugins: [
			zodLocalePlugin(fileURLToPath(new URL('./scripts/zod-locales-shim.js', import.meta.url))),
			cloudflare(),
			react(),
		],
		server: {
			host: '127.0.0.1',
			port: 5173,
			proxy: {
				'/api': `http://127.0.0.1:${backendPort}`,
			},
		},
	}
})
