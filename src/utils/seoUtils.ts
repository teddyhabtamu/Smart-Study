import { useCallback } from 'react';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  canonical?: string;
  type?: 'website' | 'article' | 'profile';
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
    type = 'website'
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

    // Update Twitter Card tags
    if (title) {
      const twitterTitle = document.querySelector('meta[property="twitter:title"]');
      if (twitterTitle) {
        twitterTitle.setAttribute('content', title);
      }
    }

    if (description) {
      const twitterDescription = document.querySelector('meta[property="twitter:description"]');
      if (twitterDescription) {
        twitterDescription.setAttribute('content', description);
      }
    }

    if (image) {
      const twitterImage = document.querySelector('meta[property="twitter:image"]');
      if (twitterImage) {
        twitterImage.setAttribute('content', image);
      }
    }
  }, []);

  return { updateSEO };
};

// Page copy. Rules, learned the hard way: canonicals must be the LIVE host
// (they once pointed at a dead Vercel slug, telling Google every page lived
// elsewhere), and superlatives must be verifiable — no "leading", "largest",
// "thousands", or "experienced instructors" for a 14-document, 2-post
// library of curated YouTube lessons.
const SITE = 'https://smart-study-ncwi.vercel.app';

// Predefined SEO configurations for different pages
export const pageSEO = {
  home: {
    title: 'SmartStudy - AI-Powered Learning Platform for Ethiopian High School Students',
    description: 'SmartStudy helps Ethiopian high school students study with a digital library, AI tutor, video lessons, and community support. Free to start, organized around the Ethiopian curriculum.',
    keywords: 'Ethiopian education, smart study, education platform, Ethiopian high school, AI tutor, digital library, Ethiopian curriculum, high school learning, Ethiopian students',
    canonical: `${SITE}/`
  },
  library: {
    title: 'Digital Library - Textbooks & Study Materials | SmartStudy Ethiopia',
    description: 'Browse textbooks, exam papers, and study materials for the Ethiopian high school curriculum. Free access to educational resources.',
    keywords: 'digital library Ethiopia, textbooks Ethiopia, study materials, Ethiopian curriculum books, exam papers, educational resources',
    canonical: `${SITE}/library`
  },
  aiTutor: {
    title: 'AI Tutor - Help with Math, Physics & Chemistry | SmartStudy',
    description: 'Get AI tutoring for Ethiopian high school subjects: explanations, step-by-step solutions, and homework help. Always cross-check critical facts with your textbooks.',
    keywords: 'AI tutor Ethiopia, math help, physics tutor, chemistry help, homework assistance, Ethiopian education AI',
    canonical: `${SITE}/ai-tutor`
  },
  videos: {
    title: 'Video Lessons - Ethiopian High School Video Classroom | SmartStudy',
    description: 'Watch curated video lessons for grades 9-12, organized around the national curriculum. Free to browse; Pro unlocks the full collection.',
    keywords: 'video lessons Ethiopia, online classroom, Ethiopian teachers, high school videos, educational videos',
    canonical: `${SITE}/videos`
  },
  pastExams: {
    title: 'Past Exam Papers - Practice with Previous Years\' Exams | SmartStudy',
    description: 'Practice with past exam papers and tests for Ethiopian high school national exams. Prepare with real exam questions.',
    keywords: 'past exams Ethiopia, exam papers, national exam preparation, Ethiopian high school exams, practice tests',
    canonical: `${SITE}/past-exams`
  },
  community: {
    title: 'Study Community - Connect with Ethiopian Students | SmartStudy',
    description: 'Join the study community for Ethiopian high school students. Share notes, ask questions, and study together with peers.',
    keywords: 'study community Ethiopia, student forum, Ethiopian students, study groups, educational community',
    canonical: `${SITE}/community`
  },
  practice: {
    title: 'Practice Center - Test Your Knowledge | SmartStudy Ethiopia',
    description: 'Practice with interactive quizzes and tests designed for the Ethiopian high school curriculum. Track your progress and improve your grades.',
    keywords: 'practice tests Ethiopia, quiz platform, Ethiopian curriculum practice, study assessment',
    canonical: `${SITE}/practice`
  },
  about: {
    title: 'About SmartStudy - Educational Platform for Ethiopia',
    description: 'Learn about SmartStudy, an educational platform for Ethiopian high school students with AI tutoring, a digital library, and community support.',
    keywords: 'about SmartStudy, Ethiopian education platform, educational technology Ethiopia',
    canonical: `${SITE}/about`
  },
  careers: {
    title: 'Careers - Join the SmartStudy Team | Education Technology Ethiopia',
    description: 'Explore career opportunities at SmartStudy. Help us improve education in Ethiopia by joining our team of educators and technologists.',
    keywords: 'careers Ethiopia, education jobs, tech jobs Ethiopia, SmartStudy careers',
    canonical: `${SITE}/careers`
  }
};
