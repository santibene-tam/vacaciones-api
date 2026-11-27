import { LeaveRule, LeaveType } from '../types';

/**
 * Reglas de licencias — fuente única de verdad.
 * Expuestas por GET /api/leaves/types para que n8n consuma los mismos valores.
 *
 * Base legal: LCT art. 158 (licencias especiales), art. 160 (día hábil obligatorio),
 * art. 177 (maternidad). Mudanza es política interna.
 */
export const LEAVE_RULES: LeaveRule[] = [
  {
    code: LeaveType.NACIMIENTO,
    name: 'Nacimiento de hijo/a',
    days: 2,
    unit: 'corridos',
    annualCap: { events: 1 },
    requiresCertificate: false,
    mustIncludeBusinessDay: true,
    legalBasis: 'art. 158 LCT',
  },
  {
    code: LeaveType.MATRIMONIO,
    name: 'Matrimonio',
    days: 10,
    unit: 'corridos',
    annualCap: { events: 1 },
    requiresCertificate: false,
    mustIncludeBusinessDay: true,
    legalBasis: 'art. 158 LCT',
  },
  {
    code: LeaveType.FALLECIMIENTO_FAMILIAR,
    name: 'Fallecimiento de cónyuge/conviviente, hijos o padres',
    days: 3,
    unit: 'corridos',
    requiresCertificate: false,
    mustIncludeBusinessDay: true,
    legalBasis: 'art. 158 LCT',
  },
  {
    code: LeaveType.FALLECIMIENTO_HERMANO,
    name: 'Fallecimiento de hermano/a',
    days: 1,
    unit: 'corridos',
    requiresCertificate: false,
    mustIncludeBusinessDay: true,
    legalBasis: 'art. 158 LCT',
  },
  {
    code: LeaveType.EXAMEN,
    name: 'Examen de secundario o universidad',
    days: 2,
    unit: 'corridos',
    annualCap: { days: 10 },
    requiresCertificate: true,
    mustIncludeBusinessDay: false,
    legalBasis: 'art. 158 LCT',
  },
  {
    code: LeaveType.MUDANZA,
    name: 'Día de mudanza',
    days: [1, 2],
    unit: 'habiles',
    annualCap: { days: 2 },
    requiresCertificate: false,
    mustIncludeBusinessDay: false,
    legalBasis: 'política interna',
  },
  {
    code: LeaveType.ENFERMEDAD,
    name: 'Licencia por enfermedad',
    days: 'variable',
    unit: 'habiles',
    requiresCertificate: true,
    mustIncludeBusinessDay: false,
    legalBasis: 'política interna',
  },
  {
    code: LeaveType.MATERNIDAD,
    name: 'Maternidad',
    days: 90,
    unit: 'corridos',
    annualCap: { events: 1 },
    requiresCertificate: true,
    mustIncludeBusinessDay: false,
    legalBasis: 'art. 177 LCT',
  },
];

const RULES_BY_CODE = new Map<LeaveType, LeaveRule>(LEAVE_RULES.map((r) => [r.code, r]));

export function getLeaveRule(code: LeaveType): LeaveRule | undefined {
  return RULES_BY_CODE.get(code);
}
