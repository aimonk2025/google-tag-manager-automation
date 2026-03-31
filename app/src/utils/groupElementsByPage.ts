export interface AuditElement {
  file: string
  page?: string
  line?: number
  text: string
  id?: string | null
  classes?: string[]
  tracking: boolean
  recommendation?: string
  category: string
  needsDom?: boolean  // true if element needs DOM standardization (missing id or js-track)
}

// Conforming ID pattern: {category}_{location}_{descriptor} (at least 2 underscores, starts with known category)
const KNOWN_CATEGORIES = ['cta', 'nav', 'form', 'outbound', 'media', 'video', 'audio', 'download', 'pricing', 'auth', 'demo']
function hasConformingId(id: string | null | undefined): boolean {
  if (!id) return false
  const parts = id.split('_')
  return parts.length >= 3 && KNOWN_CATEGORIES.includes(parts[0])
}

function hasJsTrack(classes: string[] | undefined): boolean {
  return Array.isArray(classes) && classes.includes('js-track')
}

export function elementNeedsDom(el: { id?: string | null; classes?: string[]; tracking: boolean }): boolean {
  return !el.tracking || !hasConformingId(el.id) || !hasJsTrack(el.classes)
}

export interface PageGroup {
  page: string
  trackedCount: number
  untrackedCount: number
  needsDomCount: number
  elements: AuditElement[]
}

function derivePageFromFile(file: string): string {
  // Normalize slashes
  const normalized = file.replace(/\\/g, '/')

  // Next.js app router: app/(...)/page.tsx
  const appPageMatch = normalized.match(/(?:^|\/)app\/(.*?)\/page\.tsx?$/)
  if (appPageMatch) {
    const segments = appPageMatch[1]
      .split('/')
      .filter(seg => seg !== '' && !/^\(.*\)$/.test(seg)) // strip route groups like (marketing)
    if (segments.length === 0) return '/'
    return '/' + segments.join('/')
  }

  // app/page.tsx (root)
  if (/(?:^|\/)app\/page\.tsx?$/.test(normalized)) {
    return '/'
  }

  // pages/index.tsx
  if (/(?:^|\/)pages\/index\.tsx?$/.test(normalized)) {
    return '/'
  }

  // pages/about.tsx -> /about
  const pagesMatch = normalized.match(/(?:^|\/)pages\/(.+?)\.tsx?$/)
  if (pagesMatch) {
    const route = pagesMatch[1].replace(/\/index$/, '') || '/'
    return route.startsWith('/') ? route : '/' + route
  }

  // components/Header.tsx or src/components/Footer.tsx -> _component/Header
  const componentMatch = normalized.match(/(?:^|\/)(src\/)?components\/(.+?)\.tsx?$/)
  if (componentMatch) {
    const name = componentMatch[2]
    return `_component/${name}`
  }

  return normalized
}

export function groupElementsByPage(auditReport: Record<string, unknown>): PageGroup[] {
  const CATEGORIES = ['cta', 'nav', 'form', 'outbound', 'media']

  const categorized = auditReport.categorized as
    | Record<string, { elements?: Array<Record<string, unknown>> }>
    | undefined

  if (!categorized) return []

  const pageMap = new Map<string, AuditElement[]>()

  for (const category of CATEGORIES) {
    const catData = categorized[category]
    if (!catData?.elements) continue

    for (const rawEl of catData.elements) {
      const file = typeof rawEl.file === 'string' ? rawEl.file : ''
      const page =
        typeof rawEl.page === 'string' && rawEl.page.trim() !== ''
          ? rawEl.page.trim()
          : derivePageFromFile(file)

      const elId = rawEl.id === null ? null : typeof rawEl.id === 'string' ? rawEl.id : undefined
      const elClasses = Array.isArray(rawEl.classes)
        ? (rawEl.classes as unknown[]).map(c => String(c))
        : []
      const elTracking = rawEl.tracking === true

      const element: AuditElement = {
        file,
        page,
        line: typeof rawEl.line === 'number' ? rawEl.line : undefined,
        text: typeof rawEl.text === 'string' ? rawEl.text : '',
        id: elId,
        classes: elClasses,
        tracking: elTracking,
        recommendation:
          typeof rawEl.recommendation === 'string' ? rawEl.recommendation : undefined,
        category,
        needsDom: elementNeedsDom({ id: elId, classes: elClasses, tracking: elTracking }),
      }

      const existing = pageMap.get(page) ?? []
      existing.push(element)
      pageMap.set(page, existing)
    }
  }

  const groups: PageGroup[] = []

  for (const [page, elements] of pageMap.entries()) {
    // Sort elements: needsDom first, then tracked
    const sorted = [...elements].sort((a, b) => {
      if (a.needsDom === b.needsDom) return 0
      return a.needsDom ? -1 : 1
    })

    const trackedCount = elements.filter(e => e.tracking).length
    const untrackedCount = elements.length - trackedCount
    const needsDomCount = elements.filter(e => e.needsDom).length

    groups.push({ page, trackedCount, untrackedCount, needsDomCount, elements: sorted })
  }

  // Sort pages: '/' first, then alphabetical, then '_component/' last
  groups.sort((a, b) => {
    const aIsComponent = a.page.startsWith('_component/')
    const bIsComponent = b.page.startsWith('_component/')

    if (a.page === '/') return -1
    if (b.page === '/') return 1

    if (aIsComponent && !bIsComponent) return 1
    if (!aIsComponent && bIsComponent) return -1

    return a.page.localeCompare(b.page)
  })

  return groups
}
