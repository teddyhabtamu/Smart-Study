import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { config } from '../config';
import { query } from '../database/config';

// Configure Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: config.google.clientId,
  clientSecret: config.google.clientSecret,
  callbackURL: `${config.server.frontendUrl}/api/auth/google/callback`
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const { id, displayName, emails, photos } = profile;
    const email = emails?.[0]?.value;
    const avatar = photos?.[0]?.value;
    const name = displayName;

    if (!email) {
      return done(new Error('No email provided by Google'), undefined);
    }

    // Check if user exists
    let result = await query('SELECT * FROM users WHERE email = $1', [email]);

    let user;
    if (result.rows.length === 0) {
      // Create new user
      const createResult = await query(`
        INSERT INTO users (name, email, google_id, avatar, role, preferences, unlocked_badges, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'STUDENT', '{"emailNotifications": true, "studyReminders": true}', ARRAY['b1'], NOW(), NOW())
        RETURNING id, name, email, google_id, role, is_premium, avatar, preferences, xp, level, streak, last_active_date, unlocked_badges, practice_attempts, created_at, updated_at
      `, [name, email, id, avatar]);

      user = createResult.rows[0];
      user.bookmarks = [];

      // Create welcome notification
      await query(`
        INSERT INTO notifications (user_id, title, message, type, is_read)
        VALUES ($1, 'Welcome to SmartStudy!', 'Complete your profile to earn your first badge.', 'INFO', false)
      `, [user.id]);
    } else {
      // User exists, update Google info if needed
      user = result.rows[0];

      if (!user.google_id) {
        await query('UPDATE users SET google_id = $1, avatar = COALESCE($2, avatar), updated_at = NOW() WHERE id = $3', [id, avatar, user.id]);
        user.google_id = id;
        if (avatar) user.avatar = avatar;
      }

      // Get bookmarks
      const bookmarksResult = await query('SELECT item_id FROM bookmarks WHERE user_id = $1', [user.id]);
      user.bookmarks = bookmarksResult.rows.map(row => row.item_id);
    }

    // Update last active date and streak
    const today = new Date().toISOString().split('T')[0];
    const todayDate = new Date(today);
    if (user.last_active_date !== today) {
      const lastActive = user.last_active_date ? new Date(user.last_active_date) : todayDate;
      const diffTime = Math.abs(todayDate.getTime() - lastActive.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let newStreak = user.streak;
      if (diffDays === 1) {
        newStreak += 1; // Consecutive day
      } else if (diffDays > 1) {
        newStreak = 1; // Streak broken
      }

      await query('UPDATE users SET last_active_date = $1, streak = $2, updated_at = NOW() WHERE id = $3', [today, newStreak, user.id]);
      user.streak = newStreak;
      user.last_active_date = today;
    }

    return done(null, user);
  } catch (error) {
    console.error('Google OAuth error:', error);
    return done(error, undefined);
  }
}));

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return done(null, false);
    }
    const user = result.rows[0];
    // Get bookmarks
    const bookmarksResult = await query('SELECT item_id FROM bookmarks WHERE user_id = $1', [user.id]);
    user.bookmarks = bookmarksResult.rows.map(row => row.item_id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
