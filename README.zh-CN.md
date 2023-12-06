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

<p align="center">将给定的 HTML DOM 节点转换为可访问的 SVG "屏幕截图" 的库。</p>

<p align="center">复刻自 <a href="https://github.com/felixfbecker/dom-to-svg">dom-to-svg</a></p>

<p align="center"><a href="README.md">English</a> | 简体中文</p>

## 安装

```sh
pnpm/npm/yarn i dom2svg
```

## 使用

```js
import { documentToSVG, elementToSVG, formatXML, inlineResources } from 'dom2svg'

// 捕获整个文档
const svgDocument = documentToSVG(document)

// 捕获指定元素
const svgDocument = elementToSVG(document.querySelector('#my-element'))

// 内联资源
await inlineResources(svgDocument.documentElement)

// 格式化输出
const svgString = new XMLSerializer().serializeToString(svgDocument)
```

输出结果可以直接作为 SVG 使用，也可以给其他包进行美化或压缩处理。

## 特点

- 不依赖 `<foreignObject>` - 输出的 SVG 在设计工具（如 Illustrator、Figma 等）中可以正常使用。
- 使用了正确的 ARIA 属性对 SVG 进行注释，可访问 DOM 树。
- 链接可以交互。
- 文本内容可以复制到剪贴板。
- 可以内联外部资源，如图像、字体等，SVG 文件自包含。
- 元素的 CSS 层叠顺序不变。
- 在 SVG 上输出调试属性，能够追溯元素的 DOM 节点。

## 注意

- 为浏览器开发的库，可以在浏览器中运行。在服务器上使用 JSDOM 可能无法正常使用，不过可以在 Puppeteer 中运行。