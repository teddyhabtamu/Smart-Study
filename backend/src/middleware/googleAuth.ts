import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { config } from '../config';
import { supabase } from '../database/config';

// Configure Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: config.google.clientId!,
  clientSecret: config.google.clientSecret!,
  callbackURL: `${config.server.backendUrl}/api/auth/google/callback`
}, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
  try {
    const { id, displayName, emails, photos } = profile;
    const email = emails?.[0]?.value;
    const avatar = photos?.[0]?.value;
    const name = displayName;

    if (!email) {
      return done(new Error('No email provided by Google'), undefined);
    }

    // Check if user exists
    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    let user;
    if (selectError?.code === 'PGRST116' || !existingUser) {
      // Create new user (use placeholder password_hash for OAuth users)
      const userData: any = {
        name,
        email,
        password_hash: 'oauth_user_no_password',
        avatar: avatar || null,
        role: 'STUDENT',
        preferences: { emailNotifications: true, studyReminders: true },
        unlocked_badges: ['b1'],
        is_premium: false,
        xp: 0,
        level: 1,
        streak: 0,
        practice_attempts: 0
      };

      // Try to add google_id, but don't fail if column doesn't exist yet
      // Note: google_id column should exist in schema, but handle gracefully if not
      userData.google_id = id;

      let { data: newUser, error: createError } = await supabase
        .from('users')
        .insert(userData)
        .select()
        .single();

      // If google_id column doesn't exist in schema cache, retry without it
      if (createError && (createError.message?.includes('google_id') || createError.code === '42703')) {
        delete userData.google_id;
        const retryResult = await supabase
          .from('users')
          .insert(userData)
          .select()
          .single();
        
        if (retryResult.error) throw retryResult.error;
        newUser = retryResult.data;
      } else if (createError) {
        throw createError;
      }

      user = newUser;
      user.bookmarks = [];

      // Create welcome notification
      try {
        await supabase
          .from('notifications')
          .insert({
            user_id: user.id,
            title: 'Welcome to SmartStudy!',
            message: 'Complete your profile to earn your first badge.',
            type: 'INFO',
            is_read: false
          });
      } catch (notificationError) {
        console.error('Failed to create welcome notification:', notificationError);
        // Continue with authentication even if notification creation fails
      }
    } else {
      // User exists, update Google info if needed
      user = existingUser;

      // Try to update google_id if user doesn't have it
      if (!user.google_id) {
        try {
          const updateData: any = {
            avatar: avatar || user.avatar,
            updated_at: new Date().toISOString()
          };

          // Only add google_id if the user object doesn't already have it
          // This handles cases where the column might not exist in schema cache
          if (!user.google_id) {
            updateData.google_id = id;
          }

          const { error: updateError } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', user.id);

          if (updateError) {
            // If google_id column doesn't exist, try without it
            if (updateError.message?.includes('google_id') || updateError.code === '42703') {
              console.warn('google_id column not available, updating avatar only');
              const { error: avatarUpdateError } = await supabase
                .from('users')
                .update({
                  avatar: avatar || user.avatar,
                  updated_at: new Date().toISOString()
                })
                .eq('id', user.id);

              if (avatarUpdateError) console.warn('Failed to update avatar:', avatarUpdateError);
              else if (avatar) user.avatar = avatar;
            } else {
              throw updateError;
            }
          } else {
            user.google_id = id;
            if (avatar) user.avatar = avatar;
          }
        } catch (updateError: any) {
          console.error('Error updating user with Google info:', updateError);
          // Continue with authentication even if update fails
        }
      }

      // Get bookmarks
      const { data: bookmarks, error: bookmarksError } = await supabase
        .from('bookmarks')
        .select('item_id')
        .eq('user_id', user.id);

      if (bookmarksError) throw bookmarksError;

      user.bookmarks = bookmarks.map(row => row.item_id);
    }

    // Update last active date and streak
    const todayISO = new Date().toISOString();
    const today = todayISO.split('T')[0] || todayISO.substring(0, 10);
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

      const { error: streakError } = await supabase
        .from('users')
        .update({
          last_active_date: today,
          streak: newStreak,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (streakError) throw streakError;
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
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (userError?.code === 'PGRST116' || !user) {
      return done(null, false);
    }

    // Get bookmarks
    const { data: bookmarks, error: bookmarksError } = await supabase
      .from('bookmarks')
      .select('item_id')
      .eq('user_id', user.id);

    if (bookmarksError) throw bookmarksError;

    user.bookmarks = bookmarks.map(row => row.item_id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
