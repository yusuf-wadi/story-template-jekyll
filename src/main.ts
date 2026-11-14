import './styles.css'
import raw from '../content/content.json'
import layoutRaw from '../content/layout.json'
import { validateContent } from './content'
import { Progress } from './progress'
import { startApp } from './app'
import { renderList } from './list/list'
import type { Content, Layout } from './types'

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}

let storage: Storage | null = null
try { storage = window.localStorage } catch { storage = null }

const root = document.getElementById('app')!
let content: Content | null = null
const progress = new Progress(storage)
try {
  content = validateContent(raw)
  startApp(root, content, layoutRaw as unknown as Layout, progress, { webgl: hasWebGL() })
} catch (e) {
  // Never ship a blank page: fall back to the plain list, or a plain message if the content itself is broken.
  console.warn('startApp failed; showing the plain list instead.', e)
  root.replaceChildren()
  if (content) renderList(root, content, { backToBrain: false, progress })
  else {
    const p = document.createElement('p')
    p.className = 'boot-error'
    p.textContent = 'This page failed to load. Please try again later.'
    root.append(p)
  }
}
