// Lecture venues: your course decides where your lectures are (and who teaches you).
// Each venue has its own lecturer, subject, board text, wall colour and a prop on
// stage, so the lecture scene looks different in every building.

export const COURSE_VENUE = {
  Accounting: 'smig',
  'Information Systems': 'smig',
  Management: 'smig',
  Marketing: 'smig',
  'Computer Science': 'science',
  Science: 'science',
  Engineering: 'engineering',
  Law: 'law',
  Medicine: 'health_sciences',
  Nursing: 'health_sciences',
}

export const VENUES = {
  smig: {
    id: 'smig', name: 'SMIG', subject: 'Management 101', lecturer: 'dr_moodley', lecturerName: 'Dr Moodley',
    wall: 0xf6ecd8, side: 0xeadcc2, accent: 0x22143b, prop: 'charts',
    sitin: 'smig_sitin',
  },
  law: {
    id: 'law', name: 'Law', subject: 'Introduction to Law', lecturer: 'prof_naidoo', lecturerName: 'Prof Naidoo',
    wall: 0xe9dcc6, side: 0x8a5a3a, accent: 0x6b1d1d, prop: 'gavel',
    sitin: 'law_sitin',
  },
  science: {
    id: 'science', name: 'Science', subject: 'Chemistry 101', lecturer: 'dr_mahlangu', lecturerName: 'Dr Mahlangu',
    wall: 0xe8f1f2, side: 0xc9dde0, accent: 0x1d6f7b, prop: 'flasks',
    sitin: 'sci_sitin',
  },
  engineering: {
    id: 'engineering', name: 'Engineering', subject: 'Statics 101', lecturer: 'prof_vanwyk', lecturerName: 'Prof van Wyk',
    wall: 0xe6e6e0, side: 0xb8b8ae, accent: 0xd97a1d, prop: 'truss',
    sitin: 'eng_sitin',
  },
  health_sciences: {
    id: 'health_sciences', name: 'Health Sci', subject: 'Anatomy 101', lecturer: 'dr_khumalo', lecturerName: 'Dr Khumalo',
    wall: 0xeef6f0, side: 0xcfe6d6, accent: 0x2e8b57, prop: 'skeleton',
    sitin: 'hs_sitin',
  },
}

export function venueIdFor(course) {
  return COURSE_VENUE[course] || 'smig'
}

export function venueFor(run) {
  return VENUES[venueIdFor(run?.character?.course)]
}

export const LECTURERS = Object.fromEntries(Object.values(VENUES).map((v) => [v.lecturer, v]))
