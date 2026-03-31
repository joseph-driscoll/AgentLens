/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    proxy: {
      // Routes /langsmith/* → https://api.smith.langchain.com/*
      // Solves CORS: the LangSmith REST API doesn't allow browser-origin requests.
      // DEV ONLY - for production, replace with a serverless proxy
      //    (Vercel Edge Function / Cloudflare Worker) that injects the API key
      //    server-side so it never appears in the browser bundle.
      '/langsmith': {
        target: 'https://api.smith.langchain.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/langsmith/, ''),
      },

      // Routes /langgraph/* → http://localhost:2024
      // The local LangGraph dev server (npx @langchain/langgraph-cli dev).
      '/langgraph': {
        target: 'http://localhost:2024',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/langgraph/, ''),
      },

      // Routes /openai/* → https://api.openai.com
      // Used only for the LLM-as-judge evaluator (gpt-4o-mini scoring).
      '/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openai/, ''),
      },
    },
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    // Exclude the langgraph-agent Jest tests - they use @jest/globals and are run
    // by that package's own Jest config, not Vitest.
    exclude: ['langgraph-agent/**', 'node_modules/**'],
  },
})
