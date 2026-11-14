import raw from '../content/content.json'
import { validateContent } from './content'

const content = validateContent(raw)
const app = document.getElementById('app')!
const h1 = document.createElement('h1')
h1.textContent = content.person.name
app.append(h1)
