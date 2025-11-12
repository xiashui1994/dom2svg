import cssValueParser from 'postcss-value-parser'

import { getAccessibilityAttributes } from './accessibility'
import type { Side } from './css'
import {
  calculateOverlappingCurvesFactor,
  copyCssStyles,
  getBorderRadiiForSide,
  hasUniformBorder,
  isTransparent,
  isVisible,
  parseCSSLength,
  unescapeStringValue,
} from './css'
import {
  isHTMLAnchorElement,
  isHTMLElement,
  isHTMLImageElement,
  isHTMLInputElement,
  isSVGSVGElement,
  svgNamespace,
} from './dom'
import { convertLinearGradient } from './gradients'
import type { StackingLayers } from './stacking'
import {
  cleanupStackingLayerChildren,
  createStackingLayers,
  determineStackingLayer,
  establishesStackingContext,
  sortStackingLayerChildren,
} from './stacking'
import { embedSvg, handleSvgNode } from './svg'
import { copyTextStyles } from './text'
import type { TraversalContext } from './traversal'
import { walkNode } from './traversal'
import { doRectanglesIntersect, isTaggedUnionMember } from './util'

export function handleElement(element: Element, context: Readonly<TraversalContext>): void {
  const cleanupFunctions: (() => void)[] = []

  try {
    const window = element.ownerDocument.defaultView
    if (!window)
      throw new Error('Element\'s ownerDocument has no defaultView')

    const bounds = element.getBoundingClientRect() // Includes borders
    const rectanglesIntersect = doRectanglesIntersect(bounds, context.options.captureArea)

    const styles = window.getComputedStyle(element)
    const parentStyles = element.parentElement && window.getComputedStyle(element.parentElement)

    const svgContainer
      = (isHTMLAnchorElement(element) && context.options.keepLinks)
        ? createSvgAnchor(element, context)
        : context.svgDocument.createElementNS(svgNamespace, 'g')

    // Add IDs, classes, debug info
    svgContainer.dataset.tag = element.tagName.toLowerCase()
    const id = element.id || context.getUniqueId(element.classList[0] || element.tagName.toLowerCase())
    svgContainer.id = id
    const className = element.getAttribute('class')
    if (className)
      svgContainer.setAttribute('class', className)

    // Title
    if (isHTMLElement(element) && element.title) {
      const svgTitle = context.svgDocument.createElementNS(svgNamespace, 'title')
      svgTitle.textContent = element.title
      svgContainer.prepend(svgTitle)
    }

    // Which parent should the container itself be appended to?
    const stackingLayerName = determineStackingLayer(styles, parentStyles)
    const stackingLayer = stackingLayerName
      ? context.stackingLayers[stackingLayerName]
      : context.parentStackingLayer
    if (stackingLayer) {
      context.currentSvgParent.setAttribute(
        'aria-owns',
        [context.currentSvgParent.getAttribute('aria-owns'), svgContainer.id].filter(Boolean).join(' '),
      )
    }
    // If the parent is within the same stacking layer, append to the parent.
    // Otherwise append to the right stacking layer.
    const elementToAppendTo
      = context.parentStackingLayer === stackingLayer ? context.currentSvgParent : stackingLayer
    svgContainer.dataset.zIndex = styles.zIndex // Used for sorting
    elementToAppendTo.append(svgContainer)

    // If the element establishes a stacking context, create subgroups for each stacking layer.
    let childContext: TraversalContext
    let backgroundContainer: SVGElement
    let ownStackingLayers: StackingLayers | undefined
    if (establishesStackingContext(styles, parentStyles)) {
      ownStackingLayers = createStackingLayers(svgContainer)
      backgroundContainer = ownStackingLayers.rootBackgroundAndBorders
      childContext = {
        ...context,
        currentSvgParent: svgContainer,
        stackingLayers: ownStackingLayers,
        parentStackingLayer: stackingLayer,
      }
    }
    else {
      backgroundContainer = svgContainer
      childContext = {
        ...context,
        currentSvgParent: svgContainer,
        parentStackingLayer: stackingLayer,
      }
    }

    // Opacity
    if (styles.opacity !== '1')
      svgContainer.setAttribute('opacity', styles.opacity)

    // Accessibility
    for (const [name, value] of getAccessibilityAttributes(element, context))
      svgContainer.setAttribute(name, value)

    // Handle ::before and ::after by creating temporary child elements in the DOM.
    // Avoid infinite loop, in case `element` already is already a synthetic element created by us for a pseudo element.
    if (isHTMLElement(element) && !element.dataset.pseudoElement) {
      const handlePseudoElement = (
        pseudoSelector: '::before' | '::after',
        position: 'prepend' | 'append',
      ): void => {
        const pseudoElementStyles = window.getComputedStyle(element, pseudoSelector)
        const content = cssValueParser(pseudoElementStyles.content).nodes.find(
          isTaggedUnionMember('type', 'string' as const),
        )
        if (!content)
          return

        // Pseudo elements are inline by default (like a span)
        const span = element.ownerDocument.createElement('span')
        span.dataset.pseudoElement = pseudoSelector
        copyCssStyles(pseudoElementStyles, span.style)
        span.textContent = unescapeStringValue(content.value)
        element.dataset.pseudoElementOwner = id
        cleanupFunctions.push(() => element.removeAttribute('data-pseudo-element-owner'))
        const style = element.ownerDocument.createElement('style')
        // Hide the *actual* pseudo element temporarily while we have a real DOM equivalent in the DOM
        style.textContent = `[data-pseudo-element-owner="${id}"]${pseudoSelector} { display: none !important; }`
        element.before(style)
        cleanupFunctions.push(() => style.remove())
        element[position](span)
        cleanupFunctions.push(() => span.remove())
      }
      handlePseudoElement('::before', 'prepend')
      handlePseudoElement('::after', 'append')
      // TODO handle ::marker etc
    }

    if (rectanglesIntersect)
      addBackgroundAndBorders(styles, bounds, backgroundContainer, window, context)

    // If element is overflow: hidden, create a masking element to hide any overflowing content of any descendants.
    // Use <mask> instead of <clipPath> as Figma supports <mask>, but not <clipPath>.
    if (styles.overflow !== 'visible') {
      const mask = context.svgDocument.createElementNS(svgNamespace, 'mask')
      mask.id = context.getUniqueId(`mask-for-${id}`)
      const visibleElement = createMaskElement(bounds, styles, context)
      mask.append(visibleElement)
      svgContainer.append(mask)
      svgContainer.setAttribute('mask', `url(#${mask.id})`)
      childContext = {
        ...childContext,
        ancestorMasks: [{ mask, forElement: element }, ...childContext.ancestorMasks],
      }
    }

    if (
      isHTMLElement(element)
      && (styles.position === 'absolute' || styles.position === 'fixed')
      && context.ancestorMasks.length > 0
      && element.offsetParent
    ) {
      // Absolute and fixed elements are out of the flow and will bleed out of an `overflow: hidden` ancestor
      // as long as their offsetParent is higher up than the mask element.
      for (const { mask, forElement } of context.ancestorMasks) {
        if (element.offsetParent.contains(forElement) || element.offsetParent === forElement) {
          // Add a cutout to the ancestor mask
          const cutoutElement = createMaskElement(bounds, styles, context)
          mask.append(cutoutElement)
        }
        else {
          break
        }
      }
    }

    if (
      rectanglesIntersect
      && isHTMLImageElement(element)
      // Make sure the element has a src/srcset attribute (the relative URL). `element.src` is absolute and always defined.
      && (element.getAttribute('src') || element.getAttribute('srcset'))
      && isVisible(styles)
    ) {
      const svgImage = context.svgDocument.createElementNS(svgNamespace, 'image')
      svgImage.id = `${id}-image` // read by inlineResources()
      svgImage.setAttribute('xlink:href', element.currentSrc || element.src)
      const paddingLeft = parseCSSLength(styles.paddingLeft, bounds.width) ?? 0
      const paddingRight = parseCSSLength(styles.paddingRight, bounds.width) ?? 0
      const paddingTop = parseCSSLength(styles.paddingTop, bounds.height) ?? 0
      const paddingBottom = parseCSSLength(styles.paddingBottom, bounds.height) ?? 0
      svgImage.setAttribute('x', (bounds.x + paddingLeft).toString())
      svgImage.setAttribute('y', (bounds.y + paddingTop).toString())
      svgImage.setAttribute('width', (bounds.width - paddingLeft - paddingRight).toString())
      svgImage.setAttribute('height', (bounds.height - paddingTop - paddingBottom).toString())
      if (element.alt)
        svgImage.setAttribute('aria-label', element.alt)

      svgContainer.append(svgImage)
    }
    else if (rectanglesIntersect && isHTMLInputElement(element) && bounds.width > 0 && bounds.height > 0) {
      // Handle button labels or input field content
      if (element.value) {
        const svgTextElement = context.svgDocument.createElementNS(svgNamespace, 'text')
        copyTextStyles(styles, svgTextElement)
        svgTextElement.setAttribute('dominant-baseline', 'central')
        svgTextElement.setAttribute('xml:space', 'preserve')
        svgTextElement.setAttribute(
          'x',
          (bounds.x + (parseCSSLength(styles.paddingLeft, bounds.width) ?? 0)).toString(),
        )
        const top = bounds.top + (parseCSSLength(styles.paddingTop, bounds.height) ?? 0)
        const bottom = bounds.bottom + (parseCSSLength(styles.paddingBottom, bounds.height) ?? 0)
        const middle = (top + bottom) / 2
        svgTextElement.setAttribute('y', middle.toString())
        svgTextElement.textContent = element.value
        childContext.stackingLayers.inFlowInlineLevelNonPositionedDescendants.append(svgTextElement)
      }
    }
    else if (rectanglesIntersect && isSVGSVGElement(element) && isVisible(styles)) {
      if (context.options?.inlineSvg)
        handleSvgNode(element, { ...childContext, idPrefix: `${id}-` })
      else
        embedSvg(element, bounds, styles, elementToAppendTo)
    }
    else {
      // Walk children even if rectangles don't intersect,
      // because children can overflow the parent's bounds as long as overflow: visible (default).
      for (const child of element.childNodes)
        walkNode(child, childContext)

      if (ownStackingLayers) {
        sortStackingLayerChildren(ownStackingLayers)
        cleanupStackingLayerChildren(ownStackingLayers)
      }
    }
  }
  finally {
    for (const cleanup of cleanupFunctions)
      cleanup()
  }
}

function addBackgroundAndBorders(
  styles: CSSStyleDeclaration,
  bounds: DOMRect,
  backgroundAndBordersContainer: SVGElement,
  window: Window,
  context: Pick<TraversalContext, 'getUniqueId' | 'svgDocument'>,
): void {
  if (isVisible(styles)) {
    if (
      bounds.width > 0
      && bounds.height > 0
      && (!isTransparent(styles.backgroundColor) || hasUniformBorder(styles) || styles.backgroundImage !== 'none')
    ) {
      const box = createBackgroundAndBorderBox(bounds, styles, context)
      backgroundAndBordersContainer.append(box)
      if (styles.backgroundImage !== 'none') {
        const backgrounds = cssValueParser(styles.backgroundImage)
          .nodes.filter(isTaggedUnionMember('type', 'function' as const))
          .reverse()
        const xBackgroundPositions = styles.backgroundPositionX.split(/\s*,\s*/g)
        const yBackgroundPositions = styles.backgroundPositionY.split(/\s*,\s*/g)
        const backgroundRepeats = styles.backgroundRepeat.split(/\s*,\s*/g)
        for (const [index, backgroundNode] of backgrounds.entries()) {
          const backgroundPositionX = parseCSSLength(xBackgroundPositions[index]!, bounds.width) ?? 0
          const backgroundPositionY = parseCSSLength(yBackgroundPositions[index]!, bounds.height) ?? 0
          const backgroundRepeat = backgroundRepeats[index]
          if (backgroundNode.value === 'url' && backgroundNode.nodes[0]) {
            const urlArgument = backgroundNode.nodes[0]
            const image = context.svgDocument.createElementNS(svgNamespace, 'image')
            image.id = context.getUniqueId('background-image') // read by inlineResources()
            const [cssWidth = 'auto', cssHeight = 'auto'] = styles.backgroundSize.split(' ')
            const backgroundWidth = parseCSSLength(cssWidth, bounds.width) ?? bounds.width
            const backgroundHeight = parseCSSLength(cssHeight, bounds.height) ?? bounds.height
            image.setAttribute('width', backgroundWidth.toString())
            image.setAttribute('height', backgroundHeight.toString())
            if (cssWidth !== 'auto' && cssHeight !== 'auto')
              image.setAttribute('preserveAspectRatio', 'none')
            else if (styles.backgroundSize === 'contain')
              image.setAttribute('preserveAspectRatio', 'xMidYMid meet')
            else if (styles.backgroundSize === 'cover')
              image.setAttribute('preserveAspectRatio', 'xMidYMid slice')

            // Technically not correct, because relative URLs should be resolved relative to the stylesheet,
            // not the page. But we have no means to know what stylesheet the style came from
            // (unless we iterate through all rules in all style sheets and find the matching one).
            const url = new URL(unescapeStringValue(urlArgument.value), window.location.href)
            image.setAttribute('xlink:href', url.href)

            if (
              backgroundRepeat === 'no-repeat'
              || (backgroundPositionX === 0
                && backgroundPositionY === 0
                && backgroundWidth === bounds.width
                && backgroundHeight === bounds.height)
            ) {
              image.setAttribute('x', bounds.x.toString())
              image.setAttribute('y', bounds.y.toString())
              backgroundAndBordersContainer.append(image)
            }
            else {
              image.setAttribute('x', '0')
              image.setAttribute('y', '0')
              const pattern = context.svgDocument.createElementNS(svgNamespace, 'pattern')
              pattern.setAttribute('patternUnits', 'userSpaceOnUse')
              pattern.setAttribute('patternContentUnits', 'userSpaceOnUse')
              pattern.setAttribute('x', (bounds.x + backgroundPositionX).toString())
              pattern.setAttribute('y', (bounds.y + backgroundPositionY).toString())
              pattern.setAttribute(
                'width',
                ((backgroundRepeat === 'repeat' || backgroundRepeat === 'repeat-x')
                  ? backgroundWidth
                  : backgroundWidth + bounds.x + backgroundPositionX // If background shouldn't repeat on this axis, make the tile as big as the element so the repetition is cut off.
                ).toString(),
              )
              pattern.setAttribute(
                'height',
                ((backgroundRepeat === 'repeat' || backgroundRepeat === 'repeat-y')
                  ? backgroundHeight
                  : backgroundHeight + bounds.y + backgroundPositionY // If background shouldn't repeat on this axis, make the tile as big as the element so the repetition is cut off.
                ).toString(),
              )
              pattern.id = context.getUniqueId('pattern')
              pattern.append(image)
              box.before(pattern)
              box.setAttribute('fill', `url(#${pattern.id})`)
            }
          }
          else if (/^(?:-webkit-)?linear-gradient$/.test(backgroundNode.value)) {
            const linearGradientCss = cssValueParser.stringify(backgroundNode)
            const svgLinearGradient = convertLinearGradient(linearGradientCss, context)
            if (backgroundPositionX !== 0 || backgroundPositionY !== 0) {
              svgLinearGradient.setAttribute(
                'gradientTransform',
                `translate(${backgroundPositionX}, ${backgroundPositionY})`,
              )
            }
            svgLinearGradient.id = context.getUniqueId('linear-gradient')
            box.before(svgLinearGradient)
            box.setAttribute('fill', `url(#${svgLinearGradient.id})`)
          }
        }
      }
    }

    if (!hasUniformBorder(styles)) {
      // Draw lines for each border
      for (const borderLine of createBorders(styles, bounds, context))
        backgroundAndBordersContainer.append(borderLine)
    }
  }
}

function createBox(bounds: DOMRectReadOnly, context: Pick<TraversalContext, 'svgDocument'>): SVGRectElement {
  const box = context.svgDocument.createElementNS(svgNamespace, 'rect')

  // TODO consider rotation
  box.setAttribute('width', bounds.width.toString())
  box.setAttribute('height', bounds.height.toString())
  box.setAttribute('x', bounds.x.toString())
  box.setAttribute('y', bounds.y.toString())

  return box
}

function createMaskElement(
  bounds: DOMRectReadOnly,
  styles: CSSStyleDeclaration,
  context: Pick<TraversalContext, 'svgDocument'>,
): SVGElement {
  // Create a copy of styles that has no background or border, so we only get the border-radius effect
  // This ensures we don't inherit background colors or border styles from the original element
  const maskStyles = {
    ...styles,
    getPropertyValue: (property: string) => {
      const value = styles.getPropertyValue(property)
      // Only return border-radius related properties, clear others to avoid unwanted styles
      if (property.startsWith('border-') && property.includes('-radius')) {
        return value
      }
      // Clear background, border, and other visual properties for mask
      if (property.startsWith('background') || property.startsWith('border') || property.startsWith('outline')) {
        return ''
      }
      return value
    },
  } as CSSStyleDeclaration

  // Reuse the existing border-radius calculation logic
  const maskElement = createBackgroundAndBorderBox(bounds, maskStyles, context)

  // Ensure the mask element is solid white (required for SVG masks)
  maskElement.setAttribute('fill', '#ffffff')
  // Remove any stroke that might have been added
  maskElement.removeAttribute('stroke')
  maskElement.removeAttribute('stroke-width')

  return maskElement
}

function createBackgroundAndBorderBox(
  bounds: DOMRectReadOnly,
  styles: CSSStyleDeclaration,
  context: Pick<TraversalContext, 'svgDocument'>,
): SVGElement {
  const background = createBox(bounds, context)

  // TODO handle background image and other properties
  if (styles.backgroundColor)
    background.setAttribute('fill', styles.backgroundColor)

  if (hasUniformBorder(styles)) {
    // Uniform border, use stroke
    // Cannot use borderColor/borderWidth directly as in Firefox those are empty strings.
    // Need to get the border property from some specific side (they are all the same in this condition).
    // https://stackoverflow.com/questions/41696063/getcomputedstyle-returns-empty-strings-on-ff-when-instead-crome-returns-a-comp
    background.setAttribute('stroke', styles.borderTopColor)
    background.setAttribute('stroke-width', styles.borderTopWidth)
    if (styles.borderTopStyle === 'dashed') {
      // > Displays a series of short square-ended dashes or line segments.
      // > The exact size and length of the segments are not defined by the specification and are implementation-specific.
      background.setAttribute('stroke-dasharray', '1')
    }
  }

  // Set border radius
  const factor = calculateOverlappingCurvesFactor(styles, bounds)

  // Calculate all 4 corners' radii from CSS
  const topRadii = getBorderRadiiForSide('top', styles, bounds)
  const bottomRadii = getBorderRadiiForSide('bottom', styles, bounds)
  const leftRadii = getBorderRadiiForSide('left', styles, bounds)
  const rightRadii = getBorderRadiiForSide('right', styles, bounds)

  // Get radii for each corner (applying factor)
  const topLeft = { x: topRadii[0] * factor, y: leftRadii[0] * factor }
  const topRight = { x: topRadii[1] * factor, y: rightRadii[0] * factor }
  const bottomRight = { x: bottomRadii[1] * factor, y: rightRadii[1] * factor }
  const bottomLeft = { x: bottomRadii[0] * factor, y: leftRadii[1] * factor }

  // Check if border-radius is uniform
  const isUniform = (
    topLeft.x === topRight.x
    && topLeft.x === bottomRight.x
    && topLeft.x === bottomLeft.x
    && topLeft.y === topRight.y
    && topLeft.y === bottomRight.y
    && topLeft.y === bottomLeft.y
  )

  if (isUniform) {
    // Uniform border-radius, use rx/ry attributes
    background.setAttribute('rx', topLeft.x.toString())
    background.setAttribute('ry', topLeft.y.toString())
  }
  else if (topLeft.x + topRight.x + bottomRight.x + bottomLeft.x > 0
    || topLeft.y + topRight.y + bottomRight.y + bottomLeft.y > 0) {
    // Irregular border-radius, use path
    const path = context.svgDocument.createElementNS(svgNamespace, 'path')
    path.setAttribute('d', createRoundedRectPath(bounds, topLeft, topRight, bottomRight, bottomLeft))

    // Copy attributes
    for (const attr of ['fill', 'stroke', 'stroke-width', 'stroke-dasharray'] as const) {
      if (background.hasAttribute(attr))
        path.setAttribute(attr, background.getAttribute(attr)!)
    }

    return path
  }

  return background
}

function* createBorders(
  styles: CSSStyleDeclaration,
  bounds: DOMRectReadOnly,
  context: Pick<TraversalContext, 'svgDocument'>,
): Iterable<SVGLineElement> {
  for (const side of ['top', 'bottom', 'right', 'left'] as const) {
    if (hasBorder(styles, side))
      yield createBorder(styles, bounds, side, context)
  }
}

function hasBorder(styles: CSSStyleDeclaration, side: Side): boolean {
  return (
    !!styles.getPropertyValue(`border-${side}-color`)
    && !isTransparent(styles.getPropertyValue(`border-${side}-color`))
    && styles.getPropertyValue(`border-${side}-width`) !== '0px'
  )
}

function createBorder(
  styles: CSSStyleDeclaration,
  bounds: DOMRectReadOnly,
  side: Side,
  context: Pick<TraversalContext, 'svgDocument'>,
): SVGLineElement {
  // TODO handle border-radius for non-uniform borders
  const border = context.svgDocument.createElementNS(svgNamespace, 'line')
  border.setAttribute('stroke-linecap', 'square')
  const color = styles.getPropertyValue(`border-${side}-color`)
  border.setAttribute('stroke', color)
  border.setAttribute('stroke-width', styles.getPropertyValue(`border-${side}-width`))

  // Handle inset/outset borders
  const borderStyle = styles.getPropertyValue(`border-${side}-style`)
  if (
    (borderStyle === 'inset' && (side === 'top' || side === 'left'))
    || (borderStyle === 'outset' && (side === 'right' || side === 'bottom'))
  ) {
    const match = color.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/)
    if (!match)
      throw new Error(`Unexpected color: ${color}`)

    const components = match.slice(1, 4).map(value => Number.parseInt(value, 10) * 0.3)
    if (match[4])
      components.push(Number.parseFloat(match[4]))

    // Low-light border
    // https://stackoverflow.com/questions/4147940/how-do-browsers-determine-which-exact-colors-to-use-for-border-inset-or-outset
    border.setAttribute('stroke', `rgba(${components.join(', ')})`)
  }

  if (side === 'top') {
    border.setAttribute('x1', bounds.left.toString())
    border.setAttribute('x2', bounds.right.toString())
    border.setAttribute('y1', bounds.top.toString())
    border.setAttribute('y2', bounds.top.toString())
  }
  else if (side === 'left') {
    border.setAttribute('x1', bounds.left.toString())
    border.setAttribute('x2', bounds.left.toString())
    border.setAttribute('y1', bounds.top.toString())
    border.setAttribute('y2', bounds.bottom.toString())
  }
  else if (side === 'right') {
    border.setAttribute('x1', bounds.right.toString())
    border.setAttribute('x2', bounds.right.toString())
    border.setAttribute('y1', bounds.top.toString())
    border.setAttribute('y2', bounds.bottom.toString())
  }
  else if (side === 'bottom') {
    border.setAttribute('x1', bounds.left.toString())
    border.setAttribute('x2', bounds.right.toString())
    border.setAttribute('y1', bounds.bottom.toString())
    border.setAttribute('y2', bounds.bottom.toString())
  }

  if (borderStyle === 'dashed') {
    const width = Number.parseFloat(styles.getPropertyValue(`border-${side}-width`))
    const dashLength = Math.max(width * 3, 3)
    border.setAttribute('stroke-dasharray', `${dashLength},${dashLength}`)
  }

  return border
}

function createSvgAnchor(element: HTMLAnchorElement, context: Pick<TraversalContext, 'svgDocument'>): SVGAElement {
  const svgAnchor = context.svgDocument.createElementNS(svgNamespace, 'a')
  if (element.href && !element.href.startsWith('javascript:'))
    svgAnchor.setAttribute('href', element.href)

  if (element.rel)
    svgAnchor.setAttribute('rel', element.rel)

  if (element.target)
    svgAnchor.setAttribute('target', element.target)

  if (element.download)
    svgAnchor.setAttribute('download', element.download)

  return svgAnchor
}

function createRoundedRectPath(
  bounds: DOMRectReadOnly,
  topLeft: { x: number, y: number },
  topRight: { x: number, y: number },
  bottomRight: { x: number, y: number },
  bottomLeft: { x: number, y: number },
): string {
  const { x, y, width, height } = bounds

  // Build path using SVG arc commands
  let path = `M ${x + topLeft.x} ${y}`

  // Top edge
  path += ` H ${x + width - topRight.x}`
  // Top-right corner (arc)
  if (topRight.x || topRight.y)
    path += ` A ${topRight.x} ${topRight.y} 0 0 1 ${x + width} ${y + topRight.y}`

  // Right edge
  path += ` V ${y + height - bottomRight.y}`
  // Bottom-right corner (arc)
  if (bottomRight.x || bottomRight.y)
    path += ` A ${bottomRight.x} ${bottomRight.y} 0 0 1 ${x + width - bottomRight.x} ${y + height}`

  // Bottom edge
  path += ` H ${x + bottomLeft.x}`
  // Bottom-left corner (arc)
  if (bottomLeft.x || bottomLeft.y)
    path += ` A ${bottomLeft.x} ${bottomLeft.y} 0 0 1 ${x} ${y + height - bottomLeft.y}`

  // Left edge
  path += ` V ${y + topLeft.y}`
  // Top-left corner (arc)
  if (topLeft.x || topLeft.y)
    path += ` A ${topLeft.x} ${topLeft.y} 0 0 1 ${x + topLeft.x} ${y}`

  return `${path} Z`
}
