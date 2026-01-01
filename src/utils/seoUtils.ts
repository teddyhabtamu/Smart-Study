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
  const updateSEO = ({
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
  };

  return { updateSEO };
};

// Predefined SEO configurations for different pages
export const pageSEO = {
  home: {
    title: 'SmartStudy - AI-Powered Learning Platform for Ethiopian High School Students',
    description: 'SmartStudy is the leading AI-powered educational platform for Ethiopian high school students. Access digital library, AI tutor, video lessons, and community support. Free to start, designed for Ethiopian curriculum.',
    keywords: 'Ethiopian education, smart study, education platform, Ethiopian high school, AI tutor, digital library, Ethiopian curriculum, high school learning, Ethiopian students',
    canonical: 'https://smartstudy.et/'
  },
  library: {
    title: 'Digital Library - Access Textbooks & Study Materials | SmartStudy Ethiopia',
    description: 'Browse and download thousands of textbooks, exam papers, and study materials for Ethiopian high school curriculum. Free access to educational resources.',
    keywords: 'digital library Ethiopia, textbooks Ethiopia, study materials, Ethiopian curriculum books, exam papers, educational resources',
    canonical: 'https://smartstudy.et/library'
  },
  aiTutor: {
    title: 'AI Tutor - Get Instant Help with Math, Physics & Chemistry | SmartStudy',
    description: 'Get personalized AI tutoring for Ethiopian high school subjects. Instant explanations, step-by-step solutions, and 24/7 homework help powered by advanced AI.',
    keywords: 'AI tutor Ethiopia, math help, physics tutor, chemistry help, homework assistance, Ethiopian education AI',
    canonical: 'https://smartstudy.et/ai-tutor'
  },
  videos: {
    title: 'Video Lessons - Ethiopian High School Video Classroom | SmartStudy',
    description: 'Watch high-quality video lessons taught by experienced Ethiopian instructors. Visual learning for grades 9-12 following the national curriculum.',
    keywords: 'video lessons Ethiopia, online classroom, Ethiopian teachers, high school videos, educational videos',
    canonical: 'https://smartstudy.et/videos'
  },
  pastExams: {
    title: 'Past Exam Papers - Practice with Previous Years\' Exams | SmartStudy',
    description: 'Access past exam papers and practice tests for Ethiopian high school national exams. Prepare effectively with real exam questions.',
    keywords: 'past exams Ethiopia, exam papers, national exam preparation, Ethiopian high school exams, practice tests',
    canonical: 'https://smartstudy.et/past-exams'
  },
  community: {
    title: 'Study Community - Connect with Ethiopian Students | SmartStudy',
    description: 'Join the largest study community for Ethiopian high school students. Share notes, ask questions, and study together with peers across Ethiopia.',
    keywords: 'study community Ethiopia, student forum, Ethiopian students, study groups, educational community',
    canonical: 'https://smartstudy.et/community'
  },
  practice: {
    title: 'Practice Center - Test Your Knowledge | SmartStudy Ethiopia',
    description: 'Practice with interactive quizzes and tests designed for Ethiopian high school curriculum. Track your progress and improve your grades.',
    keywords: 'practice tests Ethiopia, quiz platform, Ethiopian curriculum practice, study assessment',
    canonical: 'https://smartstudy.et/practice'
  },
  about: {
    title: 'About SmartStudy - Ethiopia\'s Leading Educational Platform',
    description: 'Learn about SmartStudy, the innovative educational platform transforming learning for Ethiopian high school students with AI technology and community support.',
    keywords: 'about SmartStudy, Ethiopian education platform, educational technology Ethiopia',
    canonical: 'https://smartstudy.et/about'
  },
  careers: {
    title: 'Careers - Join the SmartStudy Team | Education Technology Ethiopia',
    description: 'Explore career opportunities at SmartStudy. Help us revolutionize education in Ethiopia by joining our team of educators and technologists.',
    keywords: 'careers Ethiopia, education jobs, tech jobs Ethiopia, SmartStudy careers',
    canonical: 'https://smartstudy.et/careers'
  }
};
