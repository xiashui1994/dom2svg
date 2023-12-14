<h1 align="center">dom2svg</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/dom2svg">
    <img src="https://img.shields.io/npm/v/dom2svg.svg" alt="Version">
  </a>
  <a href="https://www.npmjs.com/package/dom2svg">
    <img src="https://img.shields.io/npm/dm/dom2svg" alt="Downloads">
  </a>
  <a href="https://github.com/xiashui1994/dom2svg/issues">
    <img src="https://img.shields.io/github/issues/xiashui1994/dom2svg" alt="Issues">
  </a>
  <a href="https://github.com/xiashui1994/dom2svg/blob/main/LICENSE">
    <img src="https://img.shields.io/npm/l/dom2svg.svg" alt="License">
  </a>
</p>

<p align="center">Library to convert a given HTML DOM node into an accessible SVG "screenshot".</p>

<p align="center">Fork from <a href="https://github.com/felixfbecker/dom-to-svg">dom-to-svg</a></p>

<p align="center">English | <a href="README.zh-CN.md">简体中文</a></p>

## Install

```sh
pnpm/npm/yarn i dom2svg
```

## Usage

```js
import { documentToSVG, elementToSVG, formatXML, inlineResources } from 'dom2svg'

// Capture the whole document
const svgDocument = documentToSVG(document)

// Capture specific element
const svgDocument = elementToSVG(document.querySelector('#my-element'))

// Inline external resources (fonts, images, etc) as data: URIs
await inlineResources(svgDocument.documentElement)

// Get SVG string
const svgString = new XMLSerializer().serializeToString(svgDocument)
```

The output can be used as-is as valid SVG or easily passed to other packages to pretty-print or compress.

## Features

- Does NOT rely on `<foreignObject>` - SVGs will work in design tools like Illustrator, Figma etc.
- Maintains DOM accessibility tree by annotating SVG with correct ARIA attributes.
- Maintains interactive links.
- Maintains text to allow copying to clipboard.
- Can inline external resources like images, fonts, etc to make SVG self-contained.
- Maintains CSS stacking order of elements.
- Outputs debug attributes on SVG to trace elements back to their DOM nodes.

## Caveats

- Designed to run in the browser. Using JSDOM on the server will likely not work, but it can easily run inside Puppeteer.
