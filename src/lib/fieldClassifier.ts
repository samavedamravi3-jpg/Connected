import type { CommunityEvent, FieldId } from '@/data/types';

/** Search terms used to find events for each field. */
export const FIELD_QUERIES: Record<FieldId, string[]> = {
  finance: ['finance networking', 'banking', 'fintech', 'accounting'],
  tech: ['software developers', 'tech meetup', 'cybersecurity', 'data science'],
  health: ['healthcare', 'nursing', 'public health', 'medtech'],
  energy: ['energy', 'engineering', 'clean energy', 'utilities'],
  design: ['design', 'marketing', 'UX', 'creative professionals'],
  public: ['nonprofit', 'public service', 'civic', 'community volunteers'],
  education: ['education', 'teachers', 'edtech', 'tutoring'],
};

const KEYWORDS: Record<FieldId, string[]> = {
  finance: ['finance', 'financial', 'bank', 'banking', 'fintech', 'invest', 'accounting', 'accountant', 'cpa', 'wealth', 'credit union', 'insurance', 'trading', 'venture capital'],
  tech: ['software', 'developer', 'engineering team', 'coding', 'programming', 'cyber', 'data science', 'machine learning', 'ai ', 'cloud', 'devops', 'startup', 'hackathon', 'python', 'javascript', 'web3', 'tech'],
  health: ['health', 'healthcare', 'nurse', 'nursing', 'medical', 'clinical', 'medtech', 'hospital', 'physician', 'pharma', 'wellness', 'mental health', 'public health'],
  energy: ['energy', 'solar', 'wind power', 'utility', 'utilities', 'grid', 'battery', 'electric vehicle', 'civil engineer', 'mechanical engineer', 'electrical engineer', 'sustainability', 'renewable'],
  design: ['design', 'designer', 'ux', 'ui ', 'brand', 'marketing', 'creative', 'photography', 'advertising', 'copywriting', 'content creator', 'figma'],
  public: ['nonprofit', 'non-profit', 'public service', 'civic', 'government', 'volunteer', 'community organizing', 'policy', 'social impact', 'advocacy'],
  education: ['education', 'teacher', 'teaching', 'school', 'student', 'tutor', 'edtech', 'curriculum', 'university', 'college', 'learning'],
};

/** Counts keyword hits in the title (weighted 3x) and description. Returns null when nothing matches. */
export function classifyField(title: string, description = ''): FieldId | null {
  const t = ` ${title.toLowerCase()} `;
  const d = ` ${description.toLowerCase().slice(0, 600)} `;
  let best: FieldId | null = null;
  let bestScore = 0;
  for (const f of Object.keys(KEYWORDS) as FieldId[]) {
    let score = 0;
    for (const k of KEYWORDS[f]) {
      const re = new RegExp(`\\b${k.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      if (re.test(t)) score += 3;
      if (re.test(d)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

/** The user's own field first, then by start time. Stable for the rest. */
export function sortMyFieldFirst<T extends Pick<CommunityEvent, 'field' | 'start'>>(events: T[], myField: FieldId | null | undefined): T[] {
  if (!myField) return events;
  const rank = (e: T) => (e.field === myField ? 0 : 1);
  return [...events].sort((a, b) => rank(a) - rank(b) || a.start - b.start);
}
