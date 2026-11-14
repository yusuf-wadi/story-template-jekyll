import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vitest/config'

const escAttr = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Share/crawler metadata and a <noscript> fallback, filled from content/content.json so the copy has one source. */
function personMeta(): Plugin {
  return {
    name: 'person-meta',
    transformIndexHtml(html) {
      const { person } = JSON.parse(readFileSync('content/content.json', 'utf8')) as
        { person: { name: string; tagline: string; links: { label: string; url: string }[] } }
      const links = person.links.filter((l) => /^(https?:|mailto:)/i.test(l.url))
        .map((l) => `<a href="${escAttr(l.url)}">${escAttr(l.label)}</a>`).join(' · ')
      return html
        .replaceAll('%PERSON_NAME%', escAttr(person.name))
        .replaceAll('%PERSON_TAGLINE%', escAttr(person.tagline))
        .replace('%PERSON_LINKS%', `${links} · <a href="/writing/">Writing</a>`)
    },
  }
}

export default defineConfig({
  plugins: [personMeta()],
  // three.js in its own long-cached chunk; the app chunk stays small and changes independently.
  build: {
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] } },
    },
  },
  test: { environment: 'node', include: ['tests/unit/**/*.test.ts'] },
})
