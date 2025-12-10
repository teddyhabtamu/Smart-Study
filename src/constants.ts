import { Document, FileType, VideoLesson, ForumPost, UserRole, Badge, User } from './types';

export const BADGES: Badge[] = [
  {
    id: 'b1',
    name: 'First Steps',
    description: 'Create your account and start learning.',
    iconName: 'Footprints',
    requiredLevel: 1
  },
  {
    id: 'b2',
    name: 'Dedicated Student',
    description: 'Reach Level 5 by earning XP.',
    iconName: 'BookOpen',
    requiredLevel: 5
  },
  {
    id: 'b3',
    name: 'Scholar',
    description: 'Reach Level 10 and master your subjects.',
    iconName: 'GraduationCap',
    requiredLevel: 10
  },
  {
    id: 'b4',
    name: 'Streak Master',
    description: 'Maintain a 7-day study streak.',
    iconName: 'Flame',
    requiredStreak: 7
  },
  {
    id: 'b5',
    name: 'Community Pillar',
    description: 'Contribute helpful answers in the forum.',
    iconName: 'Users',
    requiredLevel: 2
  },
  {
    id: 'b6',
    name: 'Top of the Class',
    description: 'Reach Level 20. You are an expert!',
    iconName: 'Trophy',
    requiredLevel: 20
  }
];

export const MOCK_USERS: any[] = [
  { id: 's1', name: 'Kebede Tadesse', email: 'kebede@example.com', role: UserRole.STUDENT, isPremium: false, joinedDate: '2023-09-01', status: 'Active' },
  { id: 's2', name: 'Sara Alemu', email: 'sara@example.com', role: UserRole.STUDENT, isPremium: true, joinedDate: '2023-09-15', status: 'Active' },
  { id: 's3', name: 'Dawit Bekele', email: 'dawit@example.com', role: UserRole.STUDENT, isPremium: false, joinedDate: '2023-10-02', status: 'Banned' },
  { id: 's4', name: 'Lidya M.', email: 'lidya@example.com', role: UserRole.STUDENT, isPremium: true, joinedDate: '2023-11-10', status: 'Active' },
];

export const MOCK_DOCUMENTS: Document[] = [
  {
    id: '1',
    title: 'Grade 9 Mathematics: Algebra Basics',
    description: 'Comprehensive notes on linear equations, inequalities, and functions for Grade 9 students.',
    subject: 'Mathematics',
    grade: 9,
    file_type: FileType.PDF,
    is_premium: false,
    uploadedAt: '2023-09-01',
    downloads: 1240,
    preview_image: 'https://picsum.photos/400/300?random=1',
    tags: ['algebra', 'math', 'equations'],
    author: 'Dept. of Education'
  },
  {
    id: '2',
    title: 'Physics Grade 10: Mechanics & Motion',
    description: 'Detailed textbook chapter covering Newton\'s laws, kinematics, and dynamics.',
    subject: 'Physics',
    grade: 10,
    file_type: FileType.PDF,
    is_premium: true,
    uploadedAt: '2023-09-05',
    downloads: 850,
    preview_image: 'https://picsum.photos/400/300?random=2',
    tags: ['physics', 'mechanics', 'newton'],
    author: 'Senior Tutor Abebe'
  },
  {
    id: '3',
    title: 'Chemistry Grade 11: Organic Chemistry Intro',
    description: 'Introduction to hydrocarbons, functional groups, and nomenclature.',
    subject: 'Chemistry',
    grade: 11,
    file_type: FileType.PPT,
    is_premium: true,
    uploadedAt: '2023-10-12',
    downloads: 530,
    preview_image: 'https://picsum.photos/400/300?random=3',
    tags: ['chemistry', 'organic', 'science'],
    author: 'Dr. Kebede'
  },
  {
    id: '4',
    title: 'Civics Grade 12: Constitution & Federalism',
    description: 'Exam preparation notes regarding the Ethiopian constitution and federal structure.',
    subject: 'Civics',
    grade: 12,
    file_type: FileType.DOCX,
    is_premium: false,
    uploadedAt: '2023-11-01',
    downloads: 2100,
    preview_image: 'https://picsum.photos/400/300?random=4',
    tags: ['civics', 'law', 'government'],
    author: 'Civics Dept.'
  },
  {
    id: '5',
    title: 'Biology Grade 9: Cell Structure',
    description: 'Visual guide to plant and animal cell structures and functions.',
    subject: 'Biology',
    grade: 9,
    file_type: FileType.PDF,
    is_premium: false,
    uploadedAt: '2023-08-20',
    downloads: 900,
    preview_image: 'https://picsum.photos/400/300?random=5',
    tags: ['biology', 'cells', 'science'],
    author: 'Ms. Almaz'
  },
  {
    id: '6',
    title: 'English Grade 10: Grammar & Composition',
    description: 'Workbook for improving essay writing and mastering English grammar rules.',
    subject: 'English',
    grade: 10,
    file_type: FileType.PDF,
    is_premium: false,
    uploadedAt: '2023-09-15',
    downloads: 1500,
    preview_image: 'https://picsum.photos/400/300?random=6',
    tags: ['english', 'grammar', 'writing'],
    author: 'Language Dept.'
  }
];

export const MOCK_VIDEOS: VideoLesson[] = [
  {
    id: 'v1',
    title: 'Algebra: Linear Equations & Variables',
    description: 'Khan Academy lesson on the basics of Algebra, variables, and linear equations.',
    subject: 'Mathematics',
    grade: 9,
    thumbnail: 'https://img.youtube.com/vi/NybHckSEQBI/maxresdefault.jpg',
    video_url: 'https://www.youtube.com/watch?v=NybHckSEQBI',
    instructor: 'Khan Academy',
    views: 12500,
    likes: 842,
    uploadedAt: '2023-10-05',
    isPremium: false
  },
  {
    id: 'v2',
    title: 'Newton\'s Laws of Motion',
    description: 'Introduction to Newton\'s Laws of Motion with real-world examples.',
    subject: 'Physics',
    grade: 10,
    thumbnail: 'https://img.youtube.com/vi/kKKM8Y-u7ds/maxresdefault.jpg',
    video_url: 'https://www.youtube.com/watch?v=kKKM8Y-u7ds',
    instructor: 'CrashCourse',
    views: 8900,
    likes: 563,
    uploadedAt: '2023-09-12',
    isPremium: true
  },
  {
    id: 'v3',
    title: 'Atomic Theory: Chemistry Basics',
    description: 'Understanding atoms, electrons, protons, and neutrons.',
    subject: 'Chemistry',
    grade: 11,
    thumbnail: 'https://img.youtube.com/vi/thnDxF222hs/maxresdefault.jpg',
    video_url: 'https://www.youtube.com/watch?v=thnDxF222hs',
    instructor: 'CrashCourse',
    views: 6700,
    likes: 320,
    uploadedAt: '2023-11-20',
    isPremium: false
  },
  {
    id: 'v4',
    title: 'Parts of Speech: English Grammar',
    description: 'Learn about Nouns, Verbs, Adjectives, and Adverbs.',
    subject: 'English',
    grade: 10,
    thumbnail: 'https://img.youtube.com/vi/8_UoXZ99UEk/maxresdefault.jpg',
    video_url: 'https://www.youtube.com/watch?v=8_UoXZ99UEk',
    instructor: 'Khan Academy',
    views: 5600,
    likes: 410,
    uploadedAt: '2023-08-30',
    isPremium: false
  },
  {
    id: 'v5',
    title: 'Mitosis vs Meiosis',
    description: 'Cell division explained simply with animations.',
    subject: 'Biology',
    grade: 10,
    thumbnail: 'https://img.youtube.com/vi/8IlzKri08kk/maxresdefault.jpg',
    video_url: 'https://www.youtube.com/watch?v=8IlzKri08kk',
    instructor: 'Amoeba Sisters',
    views: 4200,
    likes: 295,
    uploadedAt: '2023-10-15',
    isPremium: true
  }
];

export const MOCK_FORUM_POSTS: ForumPost[] = [
  {
    id: 'f1',
    title: 'How do I solve for X in quadratic equations when a > 1?',
    content: 'I am struggling with the AC method. Can someone explain it simply? I always get confused when splitting the middle term.',
    author: 'Student123',
    authorRole: UserRole.STUDENT,
    subject: 'Mathematics',
    grade: 10,
    createdAt: '2 hours ago',
    votes: 5,
    views: 42,
    isSolved: false,
    tags: ['algebra', 'quadratics', 'math-help'],
    comments: [
      {
        id: 'c1',
        author: 'Mr. Tadesse',
        role: UserRole.TUTOR,
        content: 'The key is to multiply `a` and `c` first. If 2x² + 7x + 3, multiply 2*3 = 6. Then find factors of 6 that add up to 7 (which are 6 and 1).',
        createdAt: '1 hour ago',
        votes: 3,
        isAccepted: true
      }
    ]
  },
  {
    id: 'f2',
    title: 'Difference between Mitosis and Meiosis?',
    content: 'I know they both deal with cell division, but I keep mixing up which one produces haploid cells.',
    author: 'BioFan_99',
    authorRole: UserRole.STUDENT,
    subject: 'Biology',
    grade: 9,
    createdAt: '1 day ago',
    votes: 12,
    views: 156,
    isSolved: true,
    tags: ['biology', 'cells', 'exam-prep'],
    comments: []
  },
  {
    id: 'f3',
    title: 'Can anyone review my essay thesis statement?',
    content: 'Topic: The impact of technology on education. My thesis: "Technology is good for schools because it helps people learn fast."',
    author: 'Writer_Girl',
    authorRole: UserRole.STUDENT,
    subject: 'English',
    grade: 11,
    createdAt: '3 hours ago',
    votes: 2,
    views: 28,
    isSolved: false,
    tags: ['writing', 'essay', 'feedback'],
    comments: [
      {
        id: 'c2',
        author: 'Admin User',
        role: UserRole.ADMIN,
        content: 'It is a bit too simple. Try to be more specific. E.g., "Technology enhances educational accessibility, but requires structured integration to be effective."',
        createdAt: '30 mins ago',
        votes: 4
      }
    ]
  }
];

export const SUBJECTS = ['All', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'Civics', 'History', 'Geography'];
export const GRADES = ['All', '9', '10', '11', '12'];