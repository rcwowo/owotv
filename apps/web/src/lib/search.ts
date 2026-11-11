export type SearchResultType = 'vod' | 'game' | 'show' | 'episode' | 'date'

export type SearchWeights = {
  title: string[]
  game?: string[]
  show?: string[]
  season?: string[]
  date?: string[]
}

export type SearchIndexItem = {
  type: SearchResultType
  title: string
  subtitle: string
  category: string
  href: string
  /** Lowercased text with special characters preserved. */
  searchText: string
  /** Alphanumeric-only form for loose matching (e.g. "exit8" -> "Exit 8"). */
  searchCompact: string
  _w: SearchWeights
  date?: string
}

/**
 * Base tiers before match-quality bonuses.
 * Meta categories can leap ahead via GOOD_META_MATCH_BOOST. Episodes stay lowest.
 */
export const SEARCH_TYPE_TIER: Record<SearchResultType, number> = {
  game: 320,
  show: 320,
  date: 320,
  vod: 520,
  episode: 120,
}

/** Lift for game / show / collection pages when the query fits the category title well. */
const GOOD_META_MATCH_BOOST = 780

const TITLE_MATCH_BONUS = {
  exact: 300,
  strong: 150,
  partial: 65,
  weak: 0,
} as const

type TitleMatchQuality = keyof typeof TITLE_MATCH_BONUS

export function isMetaCategory(type: SearchResultType): boolean {
  return type === 'game' || type === 'show' || type === 'date'
}

const FIELD_WEIGHT = {
  titleExact: 28,
  titlePrefix: 18,
  titlePartial: 12,
  gameExact: 22,
  gamePrefix: 14,
  showExact: 22,
  showPrefix: 14,
  seasonExact: 12,
  seasonPrefix: 8,
  dateExact: 10,
  datePrefix: 6,
  subtitle: 8,
  generic: 4,
} as const

/** Preserve special characters. Normalize case and whitespace. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function compactSearchText(value: string): string {
  return normalizeSearchText(value).replace(/[^a-z0-9]/g, '')
}

export function tokenizeField(value: string): string[] {
  const normalized = normalizeSearchText(value)
  const chunks = normalized.split(/[\s/|,;:()[\]{}]+/).filter(Boolean)
  return Array.from(new Set(chunks))
}

export function buildSearchBlob(parts: string[]): { text: string; compact: string } {
  const text = parts.map(normalizeSearchText).filter(Boolean).join(' ')
  return { text, compact: compactSearchText(text) }
}

export function queryTerms(query: string): string[] {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean)
}

function termMatchesToken(token: string, term: string, termCompact: string): boolean {
  if (!term) return false
  if (token === term) return true
  if (token.startsWith(term)) return true
  if (term.length >= 2 && token.includes(term)) return true

  const tokenCompact = compactSearchText(token)
  if (termCompact.length >= 2) {
    if (tokenCompact === termCompact) return true
    if (tokenCompact.startsWith(termCompact)) return true
  }

  return false
}

function termMatchesList(tokens: string[] | undefined, term: string, termCompact: string): boolean {
  if (!tokens?.length) return false
  return tokens.some((token) => termMatchesToken(token, term, termCompact))
}

function scoreTermAgainstWeights(
  term: string,
  termCompact: string,
  weights: SearchWeights,
  type: SearchResultType,
): number {
  if (termMatchesList(weights.title, term, termCompact)) {
    const exact = weights.title.some((t) => t === term)
    const prefix = weights.title.some((t) => t.startsWith(term))
    if (exact) return FIELD_WEIGHT.titleExact
    if (prefix) return FIELD_WEIGHT.titlePrefix
    return FIELD_WEIGHT.titlePartial
  }

  if (type === 'vod' || type === 'game') {
    if (termMatchesList(weights.game, term, termCompact)) {
      const exact = weights.game!.some((t) => t === term)
      const prefix = weights.game!.some((t) => t.startsWith(term))
      return exact ? FIELD_WEIGHT.gameExact : prefix ? FIELD_WEIGHT.gamePrefix : FIELD_WEIGHT.gamePrefix - 4
    }
  }

  if (type === 'show' || type === 'episode') {
    if (termMatchesList(weights.show, term, termCompact)) {
      const exact = weights.show!.some((t) => t === term)
      const prefix = weights.show!.some((t) => t.startsWith(term))
      return exact ? FIELD_WEIGHT.showExact : prefix ? FIELD_WEIGHT.showPrefix : FIELD_WEIGHT.showPrefix - 4
    }
    if (termMatchesList(weights.season, term, termCompact)) {
      const exact = weights.season!.some((t) => t === term)
      const prefix = weights.season!.some((t) => t.startsWith(term))
      return exact ? FIELD_WEIGHT.seasonExact : prefix ? FIELD_WEIGHT.seasonPrefix : FIELD_WEIGHT.seasonPrefix - 3
    }
  }

  if (termMatchesList(weights.date, term, termCompact)) {
    const exact = weights.date!.some((t) => t === term)
    const prefix = weights.date!.some((t) => t.startsWith(term))
    return exact ? FIELD_WEIGHT.dateExact : prefix ? FIELD_WEIGHT.datePrefix : FIELD_WEIGHT.datePrefix - 2
  }

  return FIELD_WEIGHT.generic
}

function textIncludesTerm(text: string, compact: string, term: string, termCompact: string): boolean {
  if (text.includes(term)) return true
  if (termCompact.length >= 2 && compact.includes(termCompact)) return true
  return false
}

function getTitleMatchQuality(
  item: SearchIndexItem,
  raw: string,
  rawNorm: string,
  rawCompact: string,
  terms: string[],
): TitleMatchQuality {
  const titleNorm = normalizeSearchText(item.title)
  const titleCompact = compactSearchText(item.title)
  const rawLower = raw.toLowerCase()

  if (rawLower === item.title.toLowerCase() || titleNorm === rawNorm) return 'exact'
  if (rawCompact.length >= 2 && titleCompact === rawCompact) return 'exact'

  if (
    titleNorm.startsWith(rawNorm) ||
    (rawCompact.length >= 2 && titleCompact.startsWith(rawCompact))
  ) {
    return 'strong'
  }

  const allTermsInTitle =
    terms.length > 0 &&
    terms.every((term) => termMatchesList(item._w.title, term, compactSearchText(term)))

  if (allTermsInTitle) return 'strong'

  if (
    titleNorm.includes(rawNorm) ||
    (rawCompact.length >= 2 && titleCompact.includes(rawCompact))
  ) {
    return 'partial'
  }

  if (terms.some((term) => termMatchesList(item._w.title, term, compactSearchText(term)))) {
    return 'partial'
  }

  return 'weak'
}

/** Strong fit for a browse page (whole show, game library, month collection). */
export function isGoodMetaMatch(
  item: SearchIndexItem,
  titleQuality: TitleMatchQuality,
  terms: string[],
): boolean {
  if (!isMetaCategory(item.type)) return false

  if (titleQuality === 'exact' || titleQuality === 'strong') return true

  if (item.type === 'game' && terms.length === 1) {
    const term = terms[0]!
    return item._w.title.some((token) => token === term)
  }

  if (item.type === 'show' && titleQuality === 'partial') {
    const matchedTitleTerms = terms.filter((term) =>
      termMatchesList(item._w.title, term, compactSearchText(term)),
    )
    return matchedTitleTerms.length >= Math.min(terms.length, item._w.title.length)
  }

  if (item.type === 'date') {
    const monthMatched = terms.some((term) =>
      item._w.date?.some(
        (token) => token === term || token.startsWith(term) || term.startsWith(token),
      ),
    )
    const yearMatched = terms.some(
      (term) => /^\d{4}$/.test(term) && item._w.date?.includes(term),
    )
    if (monthMatched && yearMatched) return true
    if (monthMatched && terms.length === 1) return true
  }

  return false
}

/** Returns -1 when the item does not match the query. */
export function scoreSearchItem(item: SearchIndexItem, query: string): number {
  const raw = query.trim()
  if (!raw) return -1

  const terms = queryTerms(raw)
  if (terms.length === 0) return -1

  const titleNorm = normalizeSearchText(item.title)
  const titleCompact = compactSearchText(item.title)
  const subtitleNorm = normalizeSearchText(item.subtitle)
  const rawNorm = normalizeSearchText(raw)
  const rawCompact = compactSearchText(raw)

  for (const term of terms) {
    const termCompact = compactSearchText(term)
    const matches =
      textIncludesTerm(item.searchText, item.searchCompact, term, termCompact) ||
      textIncludesTerm(titleNorm, titleCompact, term, termCompact) ||
      textIncludesTerm(subtitleNorm, compactSearchText(item.subtitle), term, termCompact)

    if (!matches) return -1
  }

  const titleQuality = getTitleMatchQuality(item, raw, rawNorm, rawCompact, terms)
  const goodMeta = isGoodMetaMatch(item, titleQuality, terms)

  let score = SEARCH_TYPE_TIER[item.type]
  score += TITLE_MATCH_BONUS[titleQuality]

  if (goodMeta) score += GOOD_META_MATCH_BOOST

  for (const term of terms) {
    score += scoreTermAgainstWeights(term, compactSearchText(term), item._w, item.type)
  }

  if (item.type === 'game' && (titleNorm.includes(rawNorm) || titleCompact.includes(rawCompact))) {
    score += 20
  }

  if (item.type === 'date') {
    for (const term of terms) {
      if (item._w.date?.some((t) => t === term || t.startsWith(term))) score += 10
    }
  }

  // Recency only nudges VODs. Not episodes or "browse" pages.
  if (item.type === 'vod' && item.date) {
    const ageBoost =
      1 / (1 + (Date.now() - Date.parse(item.date)) / (1000 * 60 * 60 * 24 * 30))
    score += ageBoost
  }

  return score
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function gameSlug(game: string): string {
  return slugify(game || 'other')
}

export function monthYearSlug(monthYear: string): string {
  return monthYear.toLowerCase().replace(' ', '-')
}

export function buildDateTokens(date: Date): string[] {
  const year = date.getFullYear().toString()
  const monthNum = (date.getMonth() + 1).toString()
  const monthNumPadded = monthNum.padStart(2, '0')
  const day = date.getDate().toString()
  const dayPadded = day.padStart(2, '0')
  const monthName = date.toLocaleString('en-US', { month: 'long' }).toLowerCase()
  const monthShort = date.toLocaleString('en-US', { month: 'short' }).toLowerCase()

  return [
    year,
    monthNum,
    monthNumPadded,
    day,
    dayPadded,
    monthName,
    monthShort,
    `${year}-${monthNumPadded}-${dayPadded}`,
    `${monthName}-${year}`,
    `${monthShort}-${year}`,
  ]
}
