import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { config } from '../config';
import { supabase } from '../database/config';
import { EmailService, isNewLoginFingerprint } from '../services/emailService';
import { eatTodayStr } from '../utils/dates';

// OAuth accounts have no password: password_hash is NOT NULL in the schema,
// so Google sign-ups store this placeholder. Anything that branches on
// "has a password" (delete-account re-auth, change-password) must treat this
// value as absent — import this constant instead of re-stating the string.
export const OAUTH_PASSWORD_PLACEHOLDER = 'oauth_user_no_password';

// Configure Google OAuth Strategy (passReqToCallback so the verify step
// sees the request: IP + user-agent feed the login fingerprint, exactly
// like password logins — OAuth sign-ins used to email on every login).
passport.use(new GoogleStrategy({
  clientID: config.google.clientId!,
  clientSecret: config.google.clientSecret!,
  callbackURL: `${config.server.backendUrl}/api/auth/google/callback`,
  passReqToCallback: true
}, async (req: any, accessToken: string, refreshToken: string, profile: any, done: any) => {
  try {
    const { id, displayName, emails, photos } = profile;
    // Google verifies inbox control before issuing a profile, so a Google
    // sign-in proves ownership. Respect an explicit unverified flag if Google
    // ever sends one; otherwise treat the address as verified. This closes
    // the gap where password-registered (unverified) accounts walked in via
    // OAuth while the password gate still 403s them.
    const googleVerifiedEmail = emails?.[0]?.verified !== false;
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
        password_hash: OAUTH_PASSWORD_PLACEHOLDER,
        email_verified: googleVerifiedEmail,
        avatar: avatar || null,
        role: 'STUDENT',
        status: 'Active', // Default status for new users
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

      // Send welcome email via Brevo (non-blocking)
      EmailService.sendWelcomeEmail(user.email, user.name).catch(error => {
        console.error('Failed to send welcome email for OAuth user:', error);
        // Don't fail authentication if email fails
      });
    } else {
      // User exists — blocked accounts must fail authentication HERE, before
      // any token is issued. Signal with `done(null, false, { message })`
      // (passport "failure", not "error"): an Error would bypass the route's
      // redirect and Express would render raw JSON at the callback URL.
      // The callback route turns the code into the full login-page message.
      user = existingUser;

      const blockedStatuses: Record<string, string> = { Banned: 'banned', Suspended: 'suspended', Inactive: 'deactivated' };
      if (user.status && blockedStatuses[user.status]) {
        return done(null, false, { message: blockedStatuses[user.status] });
      }

      // Pre-existing password account linking Google for the first time:
      // Google just proved inbox control, so heal the unverified flag
      // instead of leaving a verified-owner account permanently gated.
      if (googleVerifiedEmail && !user.email_verified) {
        const { error: verifyError } = await supabase
          .from('users')
          .update({ email_verified: true })
          .eq('id', user.id);
        if (!verifyError) user.email_verified = true;
        // Non-fatal on failure: login still proceeds; the password gate
        // keeps working off the stored flag as before.
      }
      
      // Send login success email for existing users logging in via OAuth (non-blocking)
      const loginTime = new Date().toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });
      
      // Login-success emails fire on new device/IP only, same rule as
      // password logins (first OAuth sign-in always notifies). req comes
      // from passReqToCallback; fall back to the old constants if absent.
      const rawUa = req?.headers?.['user-agent'];
      const userAgent = typeof rawUa === 'string' && rawUa ? rawUa : '';
      const deviceInfo = userAgent
        ? (userAgent.length > 100 ? userAgent.substring(0, 100) + '...' : userAgent)
        : 'Google OAuth Login';
      const rawIp = req?.ip || req?.socket?.remoteAddress || null;
      const ip = rawIp || 'OAuth Authentication';
      const location = rawIp ? `IP: ${rawIp}` : 'OAuth Authentication';

      if (isNewLoginFingerprint({ ip: user.last_login_ip, device: user.last_login_device }, ip, deviceInfo)) {
        console.log('📧 Triggering login success email for OAuth user:', { email: user.email, name: user.name });
        EmailService.sendLoginSuccessEmail(user.email, user.name, loginTime, deviceInfo, location).catch(error => {
          console.error('❌ Failed to send login success email for OAuth user:', error);
        });
      } else {
        console.log('📧 OAuth login email skipped (known device) for user:', { email: user.email });
      }
      // Persist the fingerprint best-effort (never fails the login; a missed
      // write just re-notifies next time). Tolerates pre-migration schemas
      // missing the columns.
      supabase
        .from('users')
        .update({ last_login_ip: String(ip), last_login_device: deviceInfo })
        .eq('id', user.id)
        .then(
          ({ error }: any) => {
            if (error) console.warn('Failed to persist OAuth login fingerprint:', error.message || error);
          },
          () => undefined
        );

      // Try to update google_id if user doesn't have it
      if (!user.google_id) {
        try {
          const updateData: any = {
            updated_at: new Date().toISOString()
          };

          // Only update avatar if user doesn't have a custom one
          // Check if avatar is null, empty, or is a Google avatar URL (contains googleusercontent.com)
          const hasCustomAvatar = user.avatar && 
                                  user.avatar.trim() !== '' && 
                                  !user.avatar.includes('googleusercontent.com') &&
                                  !user.avatar.includes('googleapis.com');
          
          // Only set Google avatar if user doesn't have a custom avatar
          if (!hasCustomAvatar && avatar) {
            updateData.avatar = avatar;
          }

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
              console.warn('google_id column not available, updating without it');
              const fallbackUpdate: any = {
                updated_at: new Date().toISOString()
              };
              
              // Only update avatar if user doesn't have a custom one
              if (!hasCustomAvatar && avatar) {
                fallbackUpdate.avatar = avatar;
              }
              
              const { error: avatarUpdateError } = await supabase
                .from('users')
                .update(fallbackUpdate)
                .eq('id', user.id);

              if (avatarUpdateError) console.warn('Failed to update user:', avatarUpdateError);
              else if (!hasCustomAvatar && avatar) user.avatar = avatar;
            } else {
              throw updateError;
            }
          } else {
            user.google_id = id;
            if (!hasCustomAvatar && avatar) user.avatar = avatar;
          }
        } catch (updateError: any) {
          console.error('Error updating user with Google info:', updateError);
          // Continue with authentication even if update fails
        }
      } else {
        // User already has google_id, but check if we should update avatar
        // Only update if user doesn't have a custom avatar
        const hasCustomAvatar = user.avatar && 
                                user.avatar.trim() !== '' && 
                                !user.avatar.includes('googleusercontent.com') &&
                                !user.avatar.includes('googleapis.com');
        
        if (!hasCustomAvatar && avatar && user.avatar !== avatar) {
          try {
            const { error: avatarUpdateError } = await supabase
              .from('users')
              .update({
                avatar: avatar,
                updated_at: new Date().toISOString()
              })
              .eq('id', user.id);

            if (!avatarUpdateError) {
              user.avatar = avatar;
            }
          } catch (avatarError) {
            console.warn('Failed to update Google avatar:', avatarError);
          }
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

    // Update last active date and streak (Ethiopian day — see auth.ts).
    const today = eatTodayStr();
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

      const previousStreak = user.streak || 0;

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

      // Check for streak milestones (7, 14, 30, 50, 100 days)
      if (newStreak > previousStreak) {
        const streakMilestones = [7, 14, 30, 50, 100];
        if (streakMilestones.includes(newStreak)) {
          const { NotificationService } = await import('../services/notificationService');
          await NotificationService.createStreakMilestoneNotification(user.id, newStreak);
          
          // Send streak milestone email (non-blocking)
          if (user.email && user.name) {
            EmailService.sendStreakMilestoneEmail(
              user.email,
              user.name,
              newStreak
            ).catch(error => {
              console.error('❌ Failed to send streak milestone email on Google OAuth login:', error);
            });
          }
        }
      }
    }

    return done(null, user);
  } catch (error) {
    console.error('Google OAuth error:', error);
    return done(error, undefined);
  }
}));

// Serialize user for session
passport.serializeUser((user: any, done: (err: any, id?: string) => void) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done: (err: any, user?: any, info?: any) => void) => {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (userError?.code === 'PGRST116' || !user) {
      return done(null, false);
    }

    // Block banned, suspended, AND deactivated accounts (same gate as above).
    const blockedStatuses: Record<string, string> = { Banned: 'banned', Suspended: 'suspended', Inactive: 'deactivated' };
    if (user.status && blockedStatuses[user.status]) {
      return done(null, false, { message: blockedStatuses[user.status] });
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
