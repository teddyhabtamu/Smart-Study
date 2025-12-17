/**
 * Format a date to relative time (e.g., "2 hours ago", "just now")
 */
export const formatRelativeTime = (date: string | Date): string => {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  // If the input isn't a valid date (e.g., already "2 hours ago"), return as-is
  if (then instanceof Date && Number.isNaN(then.getTime())) {
    return typeof date === 'string' ? date : '';
  }
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `${diffInWeeks} ${diffInWeeks === 1 ? 'week' : 'weeks'} ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths} ${diffInMonths === 1 ? 'month' : 'months'} ago`;
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears} ${diffInYears === 1 ? 'year' : 'years'} ago`;
};

/**
 * Get notification action URL based on notification content
 */
export const getNotificationActionUrl = (notification: { title: string; message: string; type: string }): string | null => {
  const title = notification.title.toLowerCase();
  const message = notification.message.toLowerCase();

  // Level up notifications -> Dashboard
  if (title.includes('level up') || title.includes('level')) {
    return '/dashboard';
  }

  // Premium upgrade -> Subscription page
  if (title.includes('premium') || title.includes('student pro') || title.includes('upgrade')) {
    return '/subscription';
  }

  // Forum replies -> Community
  if (title.includes('reply') || title.includes('forum') || title.includes('answer accepted')) {
    return '/community';
  }

  // Study reminders/goals -> Planner
  if (title.includes('study') || title.includes('reminder') || title.includes('goal')) {
    return '/planner';
  }

  // Badge/achievement -> Profile achievements tab
  if (title.includes('badge') || title.includes('achievement') || title.includes('milestone')) {
    return '/profile?tab=achievements';
  }

  // Welcome -> Dashboard
  if (title.includes('welcome')) {
    return '/dashboard';
  }

  return null;
};

