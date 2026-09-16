export interface SyllabusItemConfig<D extends string> {
  id: number;
  domain: D;
  code: string;
  taskNumber: number;
  title: string;
  planDay: number;
}

export interface ExamConfig<D extends string = string> {
  code: string;
  title: string;
  examDate: string;
  questionCount: number;
  scoredCount: number;
  minutes: number;
  breaks: { count: number; minutes: number };
  pacingSecondsPerQuestion: number;
  domains: readonly D[];
  domainLabels: Record<D, string>;
  domainWeights: Record<D, number>;
  syllabus: SyllabusItemConfig<D>[];
  plan: { startDate: string; days: number };
  readinessGates: { overallPct: number; domainPct: number; mocksRequired: number };
  bank: {
    minPerItem: number;
    deliveryMix: Record<string, number>;
    difficultyMix: Record<1 | 2 | 3, number>;
    itemTypeMix: Record<string, number>;
    topUpThreshold: number;
  };
  distractorFamilies: readonly string[];
  emphasisedFamilies: readonly string[];
  familyRules: Record<string, { label: string; rule: string }>;
  mindsetRules: readonly string[];
  structuralFacts: readonly string[];
  sourceToSyllabus: Record<string, number[]>;
}
