import './style.css'
import { elementToSVG } from '../lib/index'
import typescriptLogo from './typescript.svg'
import viteLogo from './vite.svg'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <a href="https://vitejs.dev" target="_blank">
      <img src="${viteLogo}" class="logo" alt="Vite logo" />
    </a>
    <a href="https://www.typescriptlang.org/" target="_blank">
      <img src="${typescriptLogo}" class="logo vanilla" alt="TypeScript logo" />
    </a>
    <h1>Vite + TypeScript</h1>
    <div class="card">
      <button id="export" type="button">export</button>
    </div>
    <p class="read-the-docs">Click on the Vite and TypeScript logos to learn more</p>
  </div>
`

document.querySelector('#export')?.addEventListener('click', () => {
  const svg = elementToSVG(document.querySelector('body')!)
  const svgString = new XMLSerializer().serializeToString(svg)
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  window.open(URL.createObjectURL(blob))
})
