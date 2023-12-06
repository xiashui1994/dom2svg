// Namespaces
export const svgNamespace = 'http://www.w3.org/2000/svg'
export const xlinkNamespace = 'http://www.w3.org/1999/xlink'
export const xhtmlNamespace = 'http://www.w3.org/1999/xhtml'

// DOM
export function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE
}
export function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE
}
export function isCommentNode(node: Node): node is Comment {
  return node.nodeType === Node.COMMENT_NODE
}

// SVG
export function isSVGElement(element: Element): element is SVGElement {
  return element.namespaceURI === svgNamespace
}
export function isSVGSVGElement(element: Element): element is SVGSVGElement {
  return isSVGElement(element) && element.tagName === 'svg'
}
export function isSVGGraphicsElement(element: Element): element is SVGGraphicsElement {
  return isSVGElement(element) && 'getCTM' in element && 'getScreenCTM' in element
}
export function isSVGGroupElement(element: Element): element is SVGGElement {
  return isSVGElement(element) && element.tagName === 'g'
}
export function isSVGAnchorElement(element: Element): element is SVGAElement {
  return isSVGElement(element) && element.tagName === 'a'
}
export function isSVGTextContentElement(element: Element): element is SVGTextContentElement {
  return isSVGElement(element) && 'textLength' in element
}
export function isSVGImageElement(element: Element): element is SVGImageElement {
  return element.tagName === 'image' && isSVGElement(element)
}
export function isSVGStyleElement(element: Element): element is SVGStyleElement {
  return element.tagName === 'style' && isSVGElement(element)
}

// HTML
export function isHTMLElement(element: Element): element is HTMLElement {
  return element.namespaceURI === xhtmlNamespace
}
export function isHTMLAnchorElement(element: Element): element is HTMLAnchorElement {
  return element.tagName === 'A' && isHTMLElement(element)
}
export function isHTMLLabelElement(element: Element): element is HTMLLabelElement {
  return element.tagName === 'LABEL' && isHTMLElement(element)
}
export function isHTMLImageElement(element: Element): element is HTMLImageElement {
  return element.tagName === 'IMG' && isHTMLElement(element)
}
export function isHTMLInputElement(element: Element): element is HTMLInputElement {
  return element.tagName === 'INPUT' && isHTMLElement(element)
}
export function hasLabels(element: HTMLElement): element is HTMLElement & Pick<HTMLInputElement, 'labels'> {
  return 'labels' in element
}

export function* traverseDOM(node: Node, shouldEnter: (node: Node) => boolean = () => true): Iterable<Node> {
  yield node
  if (shouldEnter(node)) {
    for (const childNode of node.childNodes)
      yield * traverseDOM(childNode)
  }
}
