// Site-inspection checklist model — kept in sync with the web app
// (src/constants/inspectionSections.js + InspectionsPage.templateToSections).
//
// Two shapes exist:
//  • DEFINITION shape (built-in default + inspection_templates.sections rows):
//      { id, name, defaultEnabled, questions: string[] }
//  • ANSWER shape (what an inspection row stores in inspections.sections):
//      { id, name, enabled, notes, photos, questions: [{ id, text, result, note, photos }] }
// templateToSections() converts DEFINITION → ANSWER at create time.

export type QResult = 'pass' | 'fail' | 'na' | null;
export type IQuestion = { id: string; text: string; result: QResult; note: string; photos: string[] };
export type ISection = { id: string; name: string; enabled: boolean; notes: string; photos: string[]; questions: IQuestion[] };

// Built-in "Default checklist" — mirrors the web INSPECTION_SECTIONS verbatim.
export const INSPECTION_SECTIONS: { id: string; name: string; defaultEnabled: boolean; questions: string[] }[] = [
  {
    id: 's1', name: 'General Site Conditions', defaultEnabled: true,
    questions: [
      'Site entrance and perimeter are clearly marked and secured',
      'Signage is visible and up to date',
      'Walkways and pathways are clear of obstructions',
      'Adequate lighting throughout the facility',
      'Housekeeping standards are maintained',
      'No unauthorized personnel observed on site',
    ],
  },
  {
    id: 's2', name: 'Personal Protective Equipment', defaultEnabled: true,
    questions: [
      'All personnel wearing appropriate hard hats',
      'High-visibility vests worn in active work zones',
      'Safety glasses / face shields in use where required',
      'Appropriate footwear (steel-toed boots) worn',
      'Gloves available and used for material handling',
      'Hearing protection available in high-noise areas',
    ],
  },
  {
    id: 's3', name: 'Fire Safety & Emergency Preparedness', defaultEnabled: true,
    questions: [
      'Fire extinguishers are present, charged, and accessible',
      'Emergency exits are clearly marked and unobstructed',
      'Emergency evacuation plan is posted',
      'First aid kits are stocked and accessible',
      'Emergency contact numbers are posted',
      'Fire suppression equipment last inspection date is current',
    ],
  },
  {
    id: 's4', name: 'Equipment & Machinery', defaultEnabled: false,
    questions: [
      'All equipment pre-use inspections are completed and logged',
      'Guards and safety devices are in place and functional',
      'Equipment is free of visible damage or defects',
      'Operator certifications are current',
      'Equipment is stored properly when not in use',
      'Lockout/Tagout procedures are posted and followed',
    ],
  },
  {
    id: 's5', name: 'Torch & Cutting Operations', defaultEnabled: false,
    questions: [
      'Hot work permit is obtained and displayed',
      'Fire watch is assigned during all torch operations',
      '20-foot clearance of combustibles maintained',
      'Gas cylinders are secured upright with valve caps when not in use',
      'Hoses and fittings inspected for leaks before use',
      'Torch operator is wearing full PPE (face shield, leather apron, gloves)',
      'Fire extinguisher within 10 feet of hot work area',
      'Area is checked for hidden combustibles before starting',
    ],
  },
  {
    id: 's6', name: 'Hazardous Materials', defaultEnabled: false,
    questions: [
      'SDS (Safety Data Sheets) are accessible for all chemicals on site',
      'Hazardous materials are properly labeled',
      'Spill containment measures are in place',
      'Chemical storage areas are ventilated',
      'No improper mixing or storage of incompatible materials',
      'Waste disposal containers are labeled and not overfilled',
    ],
  },
  {
    id: 's7', name: 'Electrical Safety', defaultEnabled: false,
    questions: [
      'Electrical panels are accessible and clearly labeled',
      'No exposed wiring or damaged cords observed',
      'GFCIs in use in wet or outdoor areas',
      'Extension cords used appropriately and not daisy-chained',
      'Adequate clearance around electrical panels (36 inches)',
    ],
  },
  {
    id: 's8', name: 'Vehicle & Mobile Equipment', defaultEnabled: false,
    questions: [
      'All vehicles have current inspections and certifications',
      'Operators have valid licenses for equipment operated',
      'Speed limits are posted and observed',
      'Spotters used when backing in congested areas',
      'Forklift pre-shift inspections completed and logged',
      'Pedestrian zones are clearly marked and separated',
    ],
  },
];

// DEFINITION → ANSWER. Accepts a template's sections (or the built-in default).
// Questions may be plain strings (web format) or objects with a `text` field.
export function templateToSections(defSections: any[]): ISection[] {
  return (defSections || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    enabled: s.defaultEnabled ?? s.enabled ?? true,
    notes: '',
    photos: [],
    questions: (s.questions || []).map((q: any, i: number) => ({
      id: `${s.id}_q${i}`,
      text: typeof q === 'string' ? q : (q.text ?? String(q ?? '')),
      result: null,
      note: '',
      photos: [],
    })),
  }));
}

// Fresh answer-shape copy of the built-in default checklist.
export const defaultSections = (): ISection[] => templateToSections(INSPECTION_SECTIONS);
