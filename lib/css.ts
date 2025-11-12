export function isCSSFontFaceRule(rule: CSSRule): rule is CSSFontFaceRule {
  return rule.type === CSSRule.FONT_FACE_RULE
}

export function isInline(styles: CSSStyleDeclaration): boolean {
  return styles.displayOutside === 'inline' || styles.display.startsWith('inline-')
}

export function isPositioned(styles: CSSStyleDeclaration): boolean {
  return styles.position !== 'static'
}

export function isInFlow(styles: CSSStyleDeclaration): boolean {
  return styles.float === 'none' && styles.position !== 'absolute' && styles.position !== 'fixed'
}

export function isTransparent(color: string): boolean {
  return color === 'transparent' || color === 'rgba(0, 0, 0, 0)'
}

export function hasUniformBorder(styles: CSSStyleDeclaration): boolean {
  return Number.parseFloat(styles.borderTopWidth) !== 0
    && styles.borderTopStyle !== 'none'
    && styles.borderTopStyle !== 'inset'
    && styles.borderTopStyle !== 'outset'
    && !isTransparent(styles.borderTopColor)
  // Cannot use border property directly as in Firefox those are empty strings.
  // Need to get the specific border properties from the specific sides.
  // https://stackoverflow.com/questions/41696063/getcomputedstyle-returns-empty-strings-on-ff-when-instead-crome-returns-a-comp
    && styles.borderTopWidth === styles.borderLeftWidth
    && styles.borderTopWidth === styles.borderRightWidth
    && styles.borderTopWidth === styles.borderBottomWidth
    && styles.borderTopColor === styles.borderLeftColor
    && styles.borderTopColor === styles.borderRightColor
    && styles.borderTopColor === styles.borderBottomColor
    && styles.borderTopStyle === styles.borderLeftStyle
    && styles.borderTopStyle === styles.borderRightStyle
    && styles.borderTopStyle === styles.borderBottomStyle
}

/** A side of a box. */
export type Side = 'top' | 'bottom' | 'right' | 'left'

/** The 4 sides of a box. */
const SIDES: Side[] = ['top', 'bottom', 'right', 'left']

/** Whether the given side is a horizontal side. */
export function isHorizontal(side: Side): boolean {
  return side === 'bottom' || side === 'top'
}

/**
 * The two corners for each side, in order of lower coordinate to higher coordinate.
 */
const CORNERS: Record<Side, [Side, Side]> = {
  top: ['left', 'right'],
  bottom: ['left', 'right'],
  left: ['top', 'bottom'],
  right: ['top', 'bottom'],
}

/**
 * Returns the (elliptic) border radii for a given side.
 * For example, for the top side it will return the horizontal top-left and the horizontal top-right border radii.
 */
export function getBorderRadiiForSide(
  side: Side,
  styles: CSSStyleDeclaration,
  bounds: DOMRectReadOnly,
): [number, number] {
  const [horizontalStyle1, verticalStyle1] = styles
    .getPropertyValue(
      isHorizontal(side)
        ? `border-${side}-${CORNERS[side][0]}-radius`
        : `border-${CORNERS[side][0]}-${side}-radius`,
    )
    .split(' ')

  const [horizontalStyle2, verticalStyle2] = styles
    .getPropertyValue(
      isHorizontal(side)
        ? `border-${side}-${CORNERS[side][1]}-radius`
        : `border-${CORNERS[side][1]}-${side}-radius`,
    )
    .split(' ')

  if (isHorizontal(side)) {
    return [
      parseCSSLength(horizontalStyle1 || '0px', bounds.width) ?? 0,
      parseCSSLength(horizontalStyle2 || '0px', bounds.width) ?? 0,
    ]
  }
  return [
    parseCSSLength(verticalStyle1 || horizontalStyle1 || '0px', bounds.height) ?? 0,
    parseCSSLength(verticalStyle2 || horizontalStyle2 || '0px', bounds.height) ?? 0,
  ]
}

/**
 * Returns the factor by which all border radii have to be scaled to fit correctly.
 *
 * @see https://drafts.csswg.org/css-backgrounds-3/#corner-overlap
 */
export function calculateOverlappingCurvesFactor(styles: CSSStyleDeclaration, bounds: DOMRectReadOnly): number {
  return Math.min(
    ...SIDES.map((side) => {
      const length = isHorizontal(side) ? bounds.width : bounds.height
      const radiiSum = getBorderRadiiForSide(side, styles, bounds).reduce((sum, radius) => sum + radius, 0)
      return length / radiiSum
    }),
    1,
  )
}

export function isVisible(styles: CSSStyleDeclaration): boolean {
  return styles.displayOutside !== 'none'
    && styles.display !== 'none'
    && styles.visibility !== 'hidden'
    && styles.opacity !== '0'
}

export function parseCSSLength(length: string, containerLength: number): number | undefined {
  if (length.endsWith('px'))
    return Number.parseFloat(length)

  if (length.endsWith('%'))
    return (Number.parseFloat(length) / 100) * containerLength

  return undefined
}

export function unescapeStringValue(value: string): string {
  return value
  // Replace hex escape sequences
    .replace(/\\([\da-f]{1,2})/gi, (_substring, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 16)))
  // Replace all other escapes (quotes, backslash, etc)
    .replace(/\\(.)/g, '$1')
}

export function copyCssStyles(from: CSSStyleDeclaration, to: CSSStyleDeclaration): void {
  for (const property of from)
    to.setProperty(property, from.getPropertyValue(property), from.getPropertyPriority(property))
}
