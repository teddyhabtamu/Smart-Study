import { useCallback } from 'react';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  canonical?: string;
  type?: 'website' | 'article' | 'profile';
  /** Page-level structured data (VideoObject, LearningResource, …).
      Reconciled on every call: passing none removes the previous page's
      node, so navigating away from a video never leaves stale JSON-LD. */
  jsonLd?: Record<string, unknown> | null;
}

export const useSEO = () => {
  // Memoized: every wired page deps on this in useEffect — a fresh identity
  // per render re-ran all of them pointlessly.
  const updateSEO = useCallback(({
    title,
    description,
    keywords,
    image,
    url,
    canonical,
    type = 'website',
    jsonLd = null,
  }: SEOProps) => {
    // Update document title
    if (title) {
      document.title = title;
    }

    // Update meta description
    if (description) {
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute('content', description);
      }
    }

    // Update meta keywords
    if (keywords) {
      const metaKeywords = document.querySelector('meta[name="keywords"]');
      if (metaKeywords) {
        metaKeywords.setAttribute('content', keywords);
      }
    }

    // Update canonical URL
    if (canonical) {
      let canonicalLink = document.querySelector('link[rel="canonical"]');
      if (!canonicalLink) {
        canonicalLink = document.createElement('link');
        canonicalLink.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalLink);
      }
      canonicalLink.setAttribute('href', canonical);
    }

    // Update Open Graph tags
    if (title) {
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) {
        ogTitle.setAttribute('content', title);
      }
    }

    if (description) {
      const ogDescription = document.querySelector('meta[property="og:description"]');
      if (ogDescription) {
        ogDescription.setAttribute('content', description);
      }
    }

    if (image) {
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage) {
        ogImage.setAttribute('content', image);
      }
    }

    if (url) {
      const ogUrl = document.querySelector('meta[property="og:url"]');
      if (ogUrl) {
        ogUrl.setAttribute('content', url);
      }
    }

    // Update Twitter Card tags (spec requires name=, not property=)
    if (title) {
      const twitterTitle = document.querySelector('meta[name="twitter:title"]');
      if (twitterTitle) {
        twitterTitle.setAttribute('content', title);
      }
    }

    if (description) {
      const twitterDescription = document.querySelector('meta[name="twitter:description"]');
      if (twitterDescription) {
        twitterDescription.setAttribute('content', description);
      }
    }

    if (image) {
      const twitterImage = document.querySelector('meta[name="twitter:image"]');
      if (twitterImage) {
        twitterImage.setAttribute('content', image);
      }
    }

    // Page-level JSON-LD: one managed node, replaced per page so structured
    // data always describes the CURRENT page (stale VideoObject on an
    // unrelated page reads as spam to Google).
    const prev = document.getElementById('page-jsonld');
    if (prev) prev.remove();
    if (jsonLd) {
      const script = document.createElement('script');
      script.id = 'page-jsonld';
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        ...jsonLd,
      });
      document.head.appendChild(script);
    }
  }, []);

  return { updateSEO };
};

// Page copy. Rules, learned the hard way: canonicals must be the LIVE host
// (they once pointed at a dead Vercel slug, telling Google every page lived
// elsewhere — then at the old tewodroshabtamu.dev host after the move to
// smartstudy.pro.et), and superlatives must be verifiable — no "leading",
// "largest", "thousands", or "experienced instructors".
// Keyword strategy: every title front-loads what Ethiopian students actually
// type — grade level, subject, "Ethiopia", national-exam terms — then the
// brand. Descriptions stay under ~160 chars so Google shows them whole.
const SITE = 'https://smartstudy.pro.et';

// Truncate display strings for title/description budgets without cutting
// mid-word where avoidable.
const clip = (text: string, max: number): string => {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
};

// Predefined SEO configurations for different pages
export const pageSEO = {
  home: {
    title: 'SmartStudy Ethiopia | AI Tutor, Video Lessons & Exam Prep for Grades 9–12',
    description: 'Study smarter for Ethiopian national exams: AI tutor, video lessons, textbooks, past papers & community for grades 9–12. Free to start.',
    keywords: 'Ethiopian education, smart study Ethiopia, EGSECE preparation, Ethiopian high school, AI tutor, digital library, Ethiopian curriculum, grade 9, grade 10, grade 11, grade 12, national exam Ethiopia',
    canonical: `${SITE}/`
  },
  library: {
    title: 'Ethiopian Textbooks & Study Materials (Grades 9–12) | SmartStudy Library',
    description: 'Free textbooks, exam papers & study materials for the Ethiopian high school curriculum, grades 9–12. Browse by subject and grade.',
    keywords: 'Ethiopian textbooks, digital library Ethiopia, grade 9 textbook, grade 10 textbook, study materials Ethiopia, exam papers Ethiopia',
    canonical: `${SITE}/library`
  },
  aiTutor: {
    title: 'AI Tutor for Math, Physics & Chemistry | SmartStudy Ethiopia',
    description: 'Stuck on homework? Get step-by-step AI explanations for Ethiopian high school math, physics, chemistry & more. Free to try.',
    keywords: 'AI tutor Ethiopia, math help Ethiopia, physics tutor, chemistry help, homework help Ethiopia, EGSECE help',
    canonical: `${SITE}/ai-tutor`
  },
  videos: {
    title: 'Video Lessons for Ethiopian High School (Grades 9–12) | SmartStudy',
    description: 'Watch free video lessons for grades 9–12: math, physics, chemistry, biology & more, organized around the Ethiopian curriculum.',
    keywords: 'Ethiopian video lessons, online classes Ethiopia, grade 9 videos, grade 12 physics, high school videos Ethiopia, study videos',
    canonical: `${SITE}/videos`
  },
  pastExams: {
    title: 'Ethiopian National Exam Past Papers (EGSECE) | SmartStudy',
    description: 'Practice with past Ethiopian national exam papers for grades 10 & 12. Real questions with answers to prepare for EGSECE & EUEE.',
    keywords: 'EGSECE past papers, Ethiopian national exam, EUEE past exams, grade 10 exam Ethiopia, grade 12 exam, past exam papers Ethiopia',
    canonical: `${SITE}/past-exams`
  },
  community: {
    title: 'Ethiopian Student Study Community & Forum | SmartStudy',
    description: 'Ask questions, share notes & study with Ethiopian high school students. Get help with homework and national exam prep.',
    keywords: 'Ethiopian student forum, study community Ethiopia, homework help Ethiopia, study groups Ethiopia',
    canonical: `${SITE}/community`
  },
  practice: {
    title: 'Practice Quizzes for Ethiopian Curriculum (Grades 9–12) | SmartStudy',
    description: 'Test yourself with interactive quizzes for the Ethiopian high school curriculum. Track progress, earn XP & improve grades.',
    keywords: 'Ethiopia practice tests, EGSECE quiz, grade 10 practice questions, Ethiopian curriculum quiz, online test Ethiopia',
    canonical: `${SITE}/practice`
  },
  about: {
    title: 'About SmartStudy | Education Platform for Ethiopia',
    description: 'SmartStudy helps Ethiopian high school students study with an AI tutor, video lessons, digital library & community. Learn our story.',
    keywords: 'about SmartStudy, Ethiopian education platform, edtech Ethiopia',
    canonical: `${SITE}/about`
  },
  careers: {
    title: 'Careers at SmartStudy | Education Jobs in Ethiopia',
    description: 'Join SmartStudy and help improve education in Ethiopia. See open roles for educators, engineers & content creators.',
    keywords: 'SmartStudy careers, education jobs Ethiopia, edtech jobs Ethiopia',
    canonical: `${SITE}/careers`
  }
};

// --- Detail pages: the long tail. A generic "Video | SmartStudy" title can
// never rank; "{topic} — Grade {grade} {subject}" can. ---------------------

export interface DetailSEOInput {
  id: string;
  title: string;
  description?: string;
  subject?: string;
  grade?: number;
  image?: string;
  createdAt?: string;
}

const gradeLabel = (grade?: number): string =>
  grade && grade > 0 ? `Grade ${grade} ` : '';

export const videoSEO = (video: DetailSEOInput) => {
  const topic = clip(video.title, 52);
  const gradeSubject = `${gradeLabel(video.grade)}${video.subject || 'Lesson'}`.trim();
  return {
    title: `${topic} — ${gradeSubject} Video Lesson | SmartStudy`,
    description: clip(
      video.description ||
      `Watch "${video.title}" — a ${gradeSubject} video lesson for Ethiopian high school students on SmartStudy.`,
      158
    ),
    canonical: `${SITE}/video/${video.id}`,
    url: `${SITE}/video/${video.id}`,
    image: video.image,
    jsonLd: {
      '@type': 'VideoObject',
      name: video.title,
      description: clip(video.description || video.title, 300),
      thumbnailUrl: video.image ? [video.image] : undefined,
      uploadDate: video.createdAt,
      contentUrl: undefined,
      inLanguage: 'en',
      educationalLevel: video.grade && video.grade > 0 ? `Grade ${video.grade}` : undefined,
      about: video.subject,
    },
  };
};

export const documentSEO = (doc: DetailSEOInput & { fileType?: string }) => {
  const topic = clip(doc.title, 52);
  const gradeSubject = `${gradeLabel(doc.grade)}${doc.subject || 'Study material'}`.trim();
  const kind = doc.fileType ? `${doc.fileType} ` : '';
  return {
    title: `${topic} — ${gradeSubject} ${kind}Study Material | SmartStudy`.replace('  ', ' '),
    description: clip(
      doc.description ||
      `Download "${doc.title}" — ${gradeSubject} study material for the Ethiopian curriculum on SmartStudy.`,
      158
    ),
    canonical: `${SITE}/document/${doc.id}`,
    url: `${SITE}/document/${doc.id}`,
    image: doc.image,
    jsonLd: {
      '@type': 'LearningResource',
      name: doc.title,
      description: clip(doc.description || doc.title, 300),
      url: `${SITE}/document/${doc.id}`,
      inLanguage: 'en',
      educationalLevel: doc.grade && doc.grade > 0 ? `Grade ${doc.grade}` : undefined,
      teaches: doc.subject,
    },
  };
};

export const communityPostSEO = (
  post: { id: string; title: string; content: string; author?: string; createdAt?: string; subject?: string }
) => ({
  title: `${clip(post.title, 60)} | SmartStudy Community`,
  description: clip(post.content, 158),
  canonical: `${SITE}/community/${post.id}`,
  url: `${SITE}/community/${post.id}`,
  jsonLd: {
    '@type': 'DiscussionForumPosting',
    headline: post.title,
    text: clip(post.content, 500),
    datePublished: post.createdAt,
    inLanguage: 'en',
    author: post.author ? { '@type': 'Person', name: post.author } : undefined,
  },
});
