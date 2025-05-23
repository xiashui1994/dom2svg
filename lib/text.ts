import { isVisible } from './css'
import { svgNamespace } from './dom'
import type { TraversalContext } from './traversal'
import { assert, doRectanglesIntersect } from './util'

export function handleTextNode(textNode: Text, context: TraversalContext): void {
  if (!textNode.ownerDocument.defaultView)
    throw new Error('Element\'s ownerDocument has no defaultView')

  const window = textNode.ownerDocument.defaultView
  const parentElement = textNode.parentElement!
  const styles = window.getComputedStyle(parentElement)
  if (!isVisible(styles))
    return

  const selection = window.getSelection()
  assert(
    selection,
    'Could not obtain selection from window. Selection is needed for detecting whitespace collapsing in text.',
  )

  const svgTextElement = context.svgDocument.createElementNS(svgNamespace, 'text')

  // Copy text styles
  // https://css-tricks.com/svg-properties-and-css
  copyTextStyles(styles, svgTextElement)

  const tabSize = Number.parseInt(styles.tabSize, 10)

  // Make sure the y attribute is the bottom of the box, not the baseline
  svgTextElement.setAttribute('dominant-baseline', 'text-after-edge')

  // Remove leading and trailing whitespace
  textNode.textContent = textNode.textContent!.trim()

  const lineRange = textNode.ownerDocument.createRange()
  lineRange.setStart(textNode, 0)
  lineRange.setEnd(textNode, 0)
  while (true) {
    const addTextSpanForLineRange = (): void => {
      if (lineRange.collapsed)
        return

      // Safari returns 2 DOMRects when wrapping text.
      const lineRectangle = Array.from(lineRange.getClientRects()).find(rect => rect.width !== 0)!
      if (!lineRectangle || !doRectanglesIntersect(lineRectangle, context.options.captureArea))
        return

      const textSpan = context.svgDocument.createElementNS(svgNamespace, 'tspan')
      textSpan.setAttribute('xml:space', 'preserve')

      // lineRange.toString() returns the text including whitespace.
      // by adding the range to a Selection, then getting the text from that selection,
      // we can let the DOM handle whitespace collapsing the same way as innerText (but for a Range).
      // For this to work, the parent element must not forbid user selection.
      const previousUserSelect = parentElement.style.userSelect
      parentElement.style.userSelect = 'all'
      try {
        selection.removeAllRanges()
        selection.addRange(lineRange)
        textSpan.textContent = selection
          .toString()
        // SVG does not support tabs in text. Tabs get rendered as one space character. Convert the
        // tabs to spaces according to tab-size instead.
        // Ideally we would keep the tab and create offset tspans.
          .replace(/\t/g, ' '.repeat(tabSize))
      }
      finally {
        parentElement.style.userSelect = previousUserSelect
        selection.removeAllRanges()
      }

      textSpan.setAttribute('x', lineRectangle.x.toString())
      textSpan.setAttribute('y', lineRectangle.bottom.toString()) // intentionally bottom because of dominant-baseline setting
      textSpan.setAttribute('textLength', lineRectangle.width.toString())
      textSpan.setAttribute('lengthAdjust', 'spacingAndGlyphs')
      svgTextElement.append(textSpan)
    }
    try {
      lineRange.setEnd(textNode, lineRange.endOffset + 1)
    }
    catch (error) {
      if ((error as DOMException).code === DOMException.INDEX_SIZE_ERR) {
        // Reached the end
        addTextSpanForLineRange()
        break
      }
      throw error
    }
    // getClientRects() returns one rectangle for each line of a text node.
    // Safari returns 2 DOMRects when wrapping text.
    const lineRectangles = Array.from(lineRange.getClientRects()).filter(rect => rect.width !== 0)
    // If no lines
    if (!lineRectangles[0]) {
      // Pure whitespace text nodes are collapsed and not rendered.
      return
    }
    // If two (unique) lines
    // Handle line breaks more explicitly for cross-browser compatibility
    // Check both top position difference and computed style white-space
    if (lineRectangles[1] && (
      lineRectangles[0].top !== lineRectangles[1].top
      || styles.whiteSpace === 'pre-wrap'
      || styles.wordBreak === 'break-all'
    )) {
      // Crossed a line break.
      // Go back one character to select exactly the previous line.
      lineRange.setEnd(textNode, lineRange.endOffset - 1)
      // Add <tspan> for exactly that line
      addTextSpanForLineRange()
      // Start on the next line.
      lineRange.setStart(textNode, lineRange.endOffset)
    }
  }

  context.currentSvgParent.append(svgTextElement)
}

export const textAttributes = new Set([
  'color',
  'dominant-baseline',
  'font-family',
  'font-size',
  'font-size-adjust',
  'font-stretch',
  'font-style',
  'font-variant',
  'font-weight',
  'direction',
  'letter-spacing',
  'text-anchor',
  'text-rendering',
  'unicode-bidi',
  'word-spacing',
  'writing-mode',
  'user-select',
] as const)
export function copyTextStyles(styles: CSSStyleDeclaration, svgElement: SVGElement): void {
  for (const textProperty of textAttributes) {
    const value = styles.getPropertyValue(textProperty)
    if (value)
      svgElement.setAttribute(textProperty, value)
  }
  // tspan uses fill, CSS uses color
  svgElement.setAttribute('fill', styles.color)
  // text-decoration
  svgElement.setAttribute('text-decoration', styles.textDecorationLine)
}
