import './styles.css'
import raw from '../content/content.json'
import layoutRaw from '../content/layout.json'
import { validateContent } from './content'
import { Progress } from './progress'
import { startApp } from './app'
import type { Layout } from './types'

let storage: Storage | null = null
try { storage = window.localStorage } catch { storage = null }

startApp(
  document.getElementById('app')!,
  validateContent(raw),
  layoutRaw as unknown as Layout,
  new Progress(storage),
)
