import { YouTubeService } from '../src/services/youtubeService';
console.log('Grade 9 Math Topics:', (YouTubeService as any).getTopicsForGradeAndSubject(9, 'Mathematics'));
console.log('Grade 12 Physics Topics:', (YouTubeService as any).getTopicsForGradeAndSubject(12, 'Physics'));
