import { getSystemTimeContext } from './dateTime';

export const initialMemories = [
  {
    id: 'mem-1',
    category: 'Exams',
    title: 'DBMS Final Exam Date',
    content: 'DBMS exam is scheduled for Friday, March 21, 2025.',
    verification_status: 'NEEDS_REVIEW',
    confidence: 'Needs Review',
    legacy_confidence: '98%',
    date: '2025-03-16',
    source: 'Voice Input / Calendar'
  },
  {
    id: 'mem-2',
    category: 'Weak Subjects',
    title: 'Normalization Weakness',
    content: 'Struggles with 3NF vs BCNF decomposition and identifying Lossless Join properties.',
    verification_status: 'UNVERIFIED',
    confidence: 'Unverified',
    legacy_confidence: '95%',
    date: '2025-03-17',
    source: 'Quiz Mode Performance'
  },
  {
    id: 'mem-3',
    category: 'Preferences',
    title: 'Study Time Preference',
    content: 'Prefers deep focus revision slots in the evening between 19:00 and 21:00.',
    verification_status: 'UNVERIFIED',
    confidence: 'Unverified',
    legacy_confidence: '92%',
    date: '2025-03-15',
    source: 'Schedule Engine Analysis'
  }
];

export const initialSchedule = [
  {
    id: 'sch-1',
    time: '10:00 AM',
    duration: '10:00 – 11:30',
    title: 'DBMS lecture',
    location: 'Lecture hall · C-204',
    dotColor: '#00f2fe'
  },
  {
    id: 'sch-2',
    time: '2:00 PM',
    duration: '14:00 – 15:00',
    title: 'Project meeting',
    location: 'Product design team',
    dotColor: '#a855f7'
  },
  {
    id: 'sch-3',
    time: '7:00 PM',
    duration: '19:00 – 21:00',
    title: 'DBMS revision',
    location: 'Focus session · No distractions',
    dotColor: '#f59e0b'
  }
];

export const initialTasks = [
  {
    id: 'task-1',
    title: 'Review normalization notes',
    subtext: 'DBMS · 2 hours',
    completed: false,
    accent: '#00f2fe'
  },
  {
    id: 'task-2',
    title: 'Submit project outline',
    subtext: 'Due today · 5:00 PM',
    completed: false,
    accent: '#f59e0b'
  },
  {
    id: 'task-3',
    title: 'Read transaction management',
    subtext: 'DBMS · 45 minutes',
    completed: true,
    accent: '#a855f7'
  }
];

export const initialRecentActivity = [
  {
    id: 'act-1',
    text: 'DBMS Notes processed',
    time: '8:42 AM',
    dotColor: '#00f2fe'
  },
  {
    id: 'act-2',
    text: 'Remembered DBMS is a weak subject',
    time: 'Yesterday',
    dotColor: '#a855f7'
  },
  {
    id: 'act-3',
    text: 'Revision plan adjusted',
    time: 'Mon',
    dotColor: '#f59e0b'
  }
];

export const dbmsNotesDocument = {
  title: 'DBMS_Notes_Normalization.pdf',
  uploadedAt: `${getSystemTimeContext().short_date} 08:42 AM`,
  totalPages: 3,
  totalChunks: 6,
  chunks: [
    {
      id: 'chk-1',
      page: 1,
      title: 'First & Second Normal Forms (1NF, 2NF)',
      text: 'First Normal Form (1NF) requires that attributes contain atomic values with no repeating groups. Second Normal Form (2NF) builds on 1NF by requiring all non-key attributes to be fully functionally dependent on the entire primary key, eliminating partial dependencies.',
      embeddingPreview: '[0.024, -0.184, 0.492, 0.089, -0.312, 0.771, ... 768 dims]'
    },
    {
      id: 'chk-2',
      page: 1,
      title: 'Third Normal Form (3NF)',
      text: 'Third Normal Form (3NF) requires a relation to be in 2NF and have no transitive functional dependencies. Formally, for any non-trivial functional dependency X -> A, either X is a superkey or A is a prime attribute.',
      embeddingPreview: '[0.115, -0.042, 0.621, 0.140, -0.210, 0.814, ... 768 dims]'
    },
    {
      id: 'chk-3',
      page: 2,
      title: 'Boyce-Codd Normal Form (BCNF)',
      text: 'BCNF is a stricter version of 3NF. A relation is in BCNF if for every non-trivial functional dependency X -> A, X MUST be a superkey. Unlike 3NF, BCNF does not allow A to be a prime attribute if X is not a superkey.',
      embeddingPreview: '[0.204, 0.081, 0.551, -0.012, -0.402, 0.901, ... 768 dims]'
    },
    {
      id: 'chk-4',
      page: 2,
      title: 'Lossless-Join & Dependency Preservation',
      text: 'A decomposition of relation R into R1 and R2 is lossless-join if and only if R1 ∩ R2 -> R1 or R1 ∩ R2 -> R2. Not all BCNF decompositions preserve functional dependencies, whereas 3NF decompositions can always guarantee dependency preservation.',
      embeddingPreview: '[-0.045, 0.212, 0.388, 0.310, -0.119, 0.654, ... 768 dims]'
    },
    {
      id: 'chk-5',
      page: 3,
      title: 'Fourth Normal Form (4NF) & Multi-Valued Dependencies',
      text: 'Fourth Normal Form (4NF) addresses multi-valued dependencies (MVD). A relation is in 4NF if for every non-trivial MVD X ->-> Y, X is a superkey for R.',
      embeddingPreview: '[0.088, -0.112, 0.419, 0.005, -0.278, 0.710, ... 768 dims]'
    },
    {
      id: 'chk-6',
      page: 3,
      title: 'Exam Key Formulas & Theorems',
      text: 'Key Exam Rule: To check BCNF decomposition: 1) Find candidate keys. 2) Check each FD X->Y. If X is not a superkey, decompose into R1(X, Y) and R2(R - Y). Repeat until all relations satisfy BCNF.',
      embeddingPreview: '[0.310, 0.120, 0.702, -0.090, -0.150, 0.888, ... 768 dims]'
    }
  ]
};

export const sampleQuizQuestions = [
  {
    id: 'q1',
    question: 'What requirement makes Boyce-Codd Normal Form (BCNF) stricter than 3NF?',
    options: [
      'BCNF requires all attributes to be numerical',
      'In BCNF, for every FD X -> A, X MUST be a superkey (no prime attribute exception)',
      'BCNF allows partial dependencies if they belong to candidate keys',
      'BCNF eliminates multi-valued dependencies only'
    ],
    correctAnswerIndex: 1,
    explanation: 'In 3NF, X -> A is allowed if A is a prime attribute even if X is not a superkey. BCNF removes this exception; X must always be a superkey.',
    citation: 'DBMS Notes — Page 2 (Boyce-Codd Normal Form)'
  },
  {
    id: 'q2',
    question: 'Which condition guarantees that a decomposition of R into R1 and R2 is lossless-join?',
    options: [
      'R1 and R2 have equal number of attributes',
      'R1 ∩ R2 -> R1 or R1 ∩ R2 -> R2',
      'R1 ∪ R2 contains no primary keys',
      'Both R1 and R2 are in 1NF'
    ],
    correctAnswerIndex: 1,
    explanation: 'A decomposition is lossless-join if the common attributes (R1 ∩ R2) functionally determine at least one of the decomposed relations.',
    citation: 'DBMS Notes — Page 2 (Lossless-Join & Dependency Preservation)'
  },
  {
    id: 'q3',
    question: 'Can every relational schema be decomposed into BCNF while preserving all functional dependencies?',
    options: [
      'Yes, always guaranteed',
      'No, BCNF decomposition guarantees lossless-join but may not preserve dependencies',
      'Only if the table has fewer than 5 columns',
      'Yes, if using 1NF rules'
    ],
    correctAnswerIndex: 1,
    explanation: '3NF guarantees both lossless-join and dependency preservation. BCNF guarantees lossless-join, but dependency preservation is not always possible.',
    citation: 'DBMS Notes — Page 2 (Lossless-Join & Dependency Preservation)'
  }
];
