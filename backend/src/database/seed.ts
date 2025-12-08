import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import bcrypt from 'bcryptjs';

const seedDatabase = async () => {
  try {
    console.log('🌱 Starting database seeding...');

    // Initialize Supabase admin client for seeding
    if (!config.supabase.url || !config.supabase.serviceRoleKey) {
      throw new Error('Supabase configuration is missing. Please check your environment variables.');
    }

    const supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey);

    // Seed badges
    const badges = [
      { id: 'b1', name: 'Welcome Badge', description: 'Welcome to SmartStudy!', icon_name: 'star', required_level: 1 },
      { id: 'b2', name: 'First Steps', description: 'Complete your first lesson', icon_name: 'book-open', required_level: 2 },
      { id: 'b3', name: 'Study Streak', description: 'Maintain a 7-day study streak', icon_name: 'flame', required_level: 3 },
      { id: 'b4', name: 'Knowledge Seeker', description: 'Complete 10 lessons', icon_name: 'brain', required_level: 5 },
      { id: 'b5', name: 'Expert Scholar', description: 'Reach level 10', icon_name: 'graduation-cap', required_level: 10 }
    ];

    for (const badge of badges) {
      const { error } = await supabaseAdmin
        .from('badges')
        .upsert(badge, { onConflict: 'id' });

      if (error) console.warn('Badge seeding warning:', error.message);
    }
    console.log('✅ Badges seeded');

    // Create an admin user (password: admin123)
    const adminPasswordHash = await bcrypt.hash('admin123', 12);
    const { data: existingAdmin } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', 'admin@smartstudy.com')
      .single();

    if (!existingAdmin) {
      const { error } = await supabaseAdmin
        .from('users')
        .insert({
          name: 'Admin User',
          email: 'admin@smartstudy.com',
          password_hash: adminPasswordHash,
          role: 'ADMIN',
          is_premium: true,
          xp: 5000,
          level: 6,
          streak: 15,
          unlocked_badges: ['b1', 'b2', 'b3', 'b4'],
          practice_attempts: 25,
          preferences: { emailNotifications: true, studyReminders: true }
        });

      if (error) console.warn('Admin user seeding warning:', error.message);
    }
    console.log('✅ Admin user seeded');

    // Create a sample student user (password: student123)
    const studentPasswordHash = await bcrypt.hash('student123', 12);
    const { data: existingStudent } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', 'student@smartstudy.com')
      .single();

    if (!existingStudent) {
      const { error } = await supabaseAdmin
        .from('users')
        .insert({
          name: 'Sample Student',
          email: 'student@smartstudy.com',
          password_hash: studentPasswordHash,
          role: 'STUDENT',
          is_premium: false,
          xp: 1200,
          level: 2,
          streak: 3,
          unlocked_badges: ['b1', 'b2'],
          practice_attempts: 8,
          preferences: { emailNotifications: true, studyReminders: true }
        });

      if (error) console.warn('Student user seeding warning:', error.message);
    }
    console.log('✅ Sample student user seeded');

    // Seed sample documents (only if they don't exist)
    const documents = [
      { title: 'Introduction to Algebra', description: 'Basic concepts of algebra for beginners', subject: 'Mathematics', grade: 9, file_type: 'PDF', is_premium: false, downloads: 245, preview_image: '/previews/algebra-intro.jpg', tags: ['algebra', 'basics', 'equations'], author: 'Dr. Smith' },
      { title: 'World History: Ancient Civilizations', description: 'Comprehensive guide to ancient world history', subject: 'History', grade: 10, file_type: 'PDF', is_premium: false, downloads: 189, preview_image: '/previews/ancient-history.jpg', tags: ['history', 'ancient', 'civilizations'], author: 'Prof. Johnson' },
      { title: 'Chemistry Fundamentals', description: 'Basic principles of chemistry', subject: 'Chemistry', grade: 9, file_type: 'PDF', is_premium: true, downloads: 67, preview_image: '/previews/chemistry-basics.jpg', tags: ['chemistry', 'atoms', 'molecules'], author: 'Dr. Williams' },
      { title: 'English Literature: Shakespeare', description: 'Analysis of Shakespeare\'s major works', subject: 'English', grade: 11, file_type: 'DOCX', is_premium: false, downloads: 134, preview_image: '/previews/shakespeare.jpg', tags: ['literature', 'shakespeare', 'drama'], author: 'Ms. Davis' },
      { title: 'Physics: Mechanics', description: 'Newtonian mechanics and motion', subject: 'Physics', grade: 10, file_type: 'PDF', is_premium: true, downloads: 98, preview_image: '/previews/physics-mechanics.jpg', tags: ['physics', 'mechanics', 'motion'], author: 'Dr. Brown' }
    ];

    // Get admin user ID for uploaded_by
    const { data: adminUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', 'admin@smartstudy.com')
      .single();

    if (adminUser) {
      for (const doc of documents) {
        const { error } = await supabaseAdmin
          .from('documents')
          .insert({ ...doc, uploaded_by: adminUser.id });

        if (error && !error.message.includes('duplicate key')) {
          console.warn('Document seeding warning:', error.message);
        }
      }
    }
    console.log('✅ Sample documents seeded');

    // Seed sample videos
    const videos = [
      { title: 'Solving Linear Equations', description: 'Step-by-step guide to solving linear equations', subject: 'Mathematics', grade: 9, thumbnail: '/thumbnails/linear-equations.jpg', video_url: 'https://youtube.com/watch?v=example1', instructor: 'Mr. Anderson', views: 1250, likes: 45, is_premium: false },
      { title: 'The Roman Empire', description: 'Rise and fall of the Roman Empire', subject: 'History', grade: 10, thumbnail: '/thumbnails/roman-empire.jpg', video_url: 'https://youtube.com/watch?v=example2', instructor: 'Dr. Martinez', views: 890, likes: 32, is_premium: false },
      { title: 'Chemical Reactions', description: 'Understanding chemical reactions and equations', subject: 'Chemistry', grade: 9, thumbnail: '/thumbnails/chemical-reactions.jpg', video_url: 'https://youtube.com/watch?v=example3', instructor: 'Ms. Taylor', views: 567, likes: 28, is_premium: true },
      { title: 'Macbeth Analysis', description: 'Deep dive into Shakespeare\'s Macbeth', subject: 'English', grade: 11, thumbnail: '/thumbnails/macbeth.jpg', video_url: 'https://youtube.com/watch?v=example4', instructor: 'Prof. Wilson', views: 723, likes: 41, is_premium: false },
      { title: 'Newton\'s Laws of Motion', description: 'Fundamental laws governing motion', subject: 'Physics', grade: 10, thumbnail: '/thumbnails/newtons-laws.jpg', video_url: 'https://youtube.com/watch?v=example5', instructor: 'Dr. Garcia', views: 934, likes: 53, is_premium: true }
    ];

    if (adminUser) {
      for (const video of videos) {
        const { error } = await supabaseAdmin
          .from('videos')
          .insert({ ...video, uploaded_by: adminUser.id });

        if (error && !error.message.includes('duplicate key')) {
          console.warn('Video seeding warning:', error.message);
        }
      }
    }
    console.log('✅ Sample videos seeded');

    console.log('🎉 Database seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
};

// Run seeding
seedDatabase()
  .then(() => {
    console.log('✅ Seeding script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seeding script failed:', error);
    process.exit(1);
  });
