# SmartStudy Notification System Documentation

## Overview
The SmartStudy platform has a comprehensive, full-featured notification system that handles real-time updates, browser notifications, and email alerts.

---

## Architecture

### Backend Components

#### 1. Database Schema
**Table: `notifications`**
```sql
- id (UUID, Primary Key)
- user_id (UUID, Foreign Key → users.id)
- title (VARCHAR)
- message (TEXT)
- type (NotificationType: INFO | WARNING | SUCCESS | ERROR)
- is_read (BOOLEAN, default: false)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### 2. NotificationService (`backend/src/services/notificationService.ts`)
Centralized service for all notification operations:

**Core Methods:**
- `create()` - Create a new notification
- `delete()` - Delete a notification by ID
- `markAsRead()` - Mark notifications as read (individual or bulk)
- `getForUser()` - Retrieve user notifications with pagination

**Specialized Notification Creators:**
- `createLevelUpNotification()` - When user levels up
- `createAchievementUnlockedNotification()` - When user unlocks a badge
- `createPremiumUpgradeNotification()` - When user upgrades to premium
- `createStudyGoalCompletedNotification()` - When user completes study goals
- `createPracticeMilestoneNotification()` - When user reaches practice milestones
- `createStudyReminderNotification()` - Study event reminders (1 day, 1 hour before)
- `createForumReplyNotification()` - When someone replies to user's forum post
- `createStreakAchievementNotification()` - When user achieves streak milestones

#### 3. API Endpoints (`backend/src/routes/users.ts`)

**GET `/api/users/profile`**
- Returns user data including all notifications
- Notifications sorted by creation date (newest first)
- Used for polling updates

**PUT `/api/users/notifications/read`**
- Mark notifications as read
- Body (optional): `{ notificationIds: string[] }`
- If no IDs provided, marks all as read

**DELETE `/api/users/notifications/:id`**
- Delete a specific notification
- Verifies user ownership

#### 4. Notification Triggers
Notifications are automatically created on various events across the platform:

**User Events:**
- Level up (XP milestones) → `users.ts:512`
- Premium upgrade → `users.ts:684`
- Achievement unlocked

**Study Events:**
- Study goal completion → `planner.ts:208`
- Study reminders (24h, 1h before) → `schedulerService.ts`
- Practice session milestones

**Social Events:**
- Forum post replies → `forum.ts`
- New community updates

**Admin Actions:**
- Premium status change → `admin.ts:235`
- Account status change → `admin.ts:282`

---

### Frontend Components

#### 1. AuthContext (`src/context/AuthContext.tsx`)

**Notification Polling:**
- Polls `/api/users/profile` every 20 seconds
- On error, increases interval to 60 seconds
- Detects truly new notifications vs updates
- Triggers browser notifications for unread items

**Notification Actions:**
- `markNotificationsAsRead(notificationIds?: string[])` - Mark as read
- `deleteNotification(notificationId: string)` - Delete notification
- `refreshUser()` - Fetch latest user data including notifications

**Browser Notifications:**
- Requests permission on first new notification
- Shows system notification with title, message, and count
- Auto-dismisses after 5 seconds
- Includes SmartStudy icon

#### 2. Layout Component (`src/components/Layout.tsx`)

**Notification Bell:**
- Located in sidebar footer next to profile
- Shows unread count badge
- Opens dropdown on click
- Fetches fresh notifications immediately (non-blocking)

**Notification Dropdown:**
- Positioned using React Portal (above icon to avoid clipping)
- Dynamic positioning: `bottom: window.innerHeight - icon.top + 8px`
- Maximum height: 600px or available space
- Minimum height: 200px

**Dropdown Features:**
- Header with unread count
- Filter tabs: "All" and "Unread"
- "Mark all as read" button
- Grouped by date (Today, Yesterday, This Week, Earlier)
- Each notification shows:
  - Icon based on type (Info, Success, Warning, Error)
  - Title and message
  - Relative time (e.g., "2 hours ago")
  - Unread indicator (blue pulsing dot)
  - Hover actions: Mark as read, Delete
  - Clickable to navigate to relevant page
- Empty states for no notifications
- Footer link to "View all notifications"

**Notification Click Actions:**
Uses `getNotificationActionUrl()` to determine navigation:
- Level up → `/profile`
- Achievement → `/profile`
- Premium upgrade → `/subscription`
- Study goal → `/planner`
- Forum reply → `/community`
- Default → No action

#### 3. Profile Page (`src/pages/Profile.tsx`)

**Notification Center Tab:**
- Complete notification history
- Filter by type: All, Info, Success, Warning, Error
- Same display format as dropdown
- Pagination support (if implemented)

#### 4. Utility Functions (`src/utils/dateUtils.ts`)

**formatRelativeTime(dateString: string)**
- Converts timestamp to human-readable format
- Examples: "just now", "5 minutes ago", "2 hours ago", "3 days ago"

**getNotificationActionUrl(notification: Notification)**
- Maps notification content to relevant page URLs
- Returns null for non-clickable notifications

---

## Integration Flow

### 1. Notification Creation Flow
```
User Action → Backend Route Handler → NotificationService.create()
                                    → Insert into DB
                                    → (Optional) EmailService.send()
```

### 2. Notification Delivery Flow
```
Backend: Notification stored in DB
         ↓
Frontend: AuthContext polling (every 20s)
         ↓
GET /api/users/profile
         ↓
Response with notifications array
         ↓
AuthContext detects new notifications
         ↓
Updates user state
         ↓
Shows browser notification (if permission granted)
         ↓
Layout updates notification bell badge
```

### 3. Notification Read Flow
```
User clicks notification → Navigate to relevant page
                        → Call markNotificationsAsRead([id])
                        → PUT /api/users/notifications/read
                        → Update is_read in DB
                        → refreshUser()
                        → UI updates (badge count, styling)
```

### 4. Notification Delete Flow
```
User clicks delete button → Call deleteNotification(id)
                          → DELETE /api/users/notifications/:id
                          → Delete from DB
                          → refreshUser()
                          → Notification removed from UI
```

---

## Notification Types & Styling

### Type: INFO (Blue)
- Icon: Info circle
- Color: `border-l-blue-500 bg-blue-50/30`
- Use cases: General information, reminders, updates

### Type: SUCCESS (Green)
- Icon: Check circle
- Color: `border-l-emerald-500 bg-emerald-50/30`
- Use cases: Achievements, level ups, completions

### Type: WARNING (Orange)
- Icon: Alert triangle
- Color: `border-l-amber-500 bg-amber-50/30`
- Use cases: Important notices, approaching deadlines

### Type: ERROR (Red)
- Icon: Alert circle
- Color: `border-l-red-500 bg-red-50/30`
- Use cases: Errors, account issues, failures

---

## Email Notifications (Optional)

### EmailService (`backend/src/services/emailService.ts`)

**Features:**
- Respects user email notification preferences
- Sends emails for critical events:
  - Study reminders (1 day, 1 hour before)
  - Important account changes
  - Achievement milestones

**User Preferences:**
User can enable/disable email notifications in Profile → Notifications settings.

---

## Performance Optimizations

1. **Polling Strategy:**
   - 20-second interval for real-time feel
   - Increases to 60 seconds on errors
   - Only updates UI when truly new notifications detected

2. **Non-blocking UI:**
   - Dropdown opens immediately on click
   - API call runs in background
   - No loading spinners for better UX

3. **Smart Diffing:**
   - Compares current vs new notifications by ID
   - Only triggers updates for actual changes
   - Prevents unnecessary re-renders

4. **Indexed Database Queries:**
   - Notifications indexed by `user_id`
   - Fast lookups for read/unread counts

5. **Portal Rendering:**
   - Dropdown rendered outside sidebar DOM
   - Prevents z-index and overflow issues
   - Better positioning control

---

## Browser Notification Permissions

### Permission Handling
1. Requests permission on first new notification
2. Three states: `default`, `granted`, `denied`
3. Respects user's choice
4. No repeated permission prompts

### Notification Format
```
Title: "SmartStudy" or "SmartStudy (X new)"
Body: Notification message
Icon: SmartStudy logo
Duration: 5 seconds (auto-dismiss)
```

---

## Accessibility

- Keyboard navigation support
- ARIA labels for screen readers
- High contrast colors for readability
- Clear visual indicators for unread items
- Semantic HTML structure

---

## Testing Notification Creation

### Manual Testing
You can manually create test notifications using the database or API:

```typescript
// Example: Create a test notification via NotificationService
await NotificationService.create({
  user_id: 'user-uuid-here',
  title: 'Test Notification',
  message: 'This is a test notification to verify the system.',
  type: 'INFO'
});
```

### Automated Triggers
Test the system by performing these actions:
1. Gain XP to level up
2. Complete a study event in planner
3. Reply to a forum post
4. Upgrade to premium
5. Wait for scheduled study reminders

---

## Future Enhancements

### Potential Improvements:
1. **WebSocket Integration:** Real-time push instead of polling
2. **Notification Preferences:** Fine-grained control per notification type
3. **Notification History Export:** Download notification history
4. **Rich Notifications:** Embedded images, action buttons
5. **Notification Categories:** Group by feature area
6. **Snooze Functionality:** Remind me later option
7. **Notification Sound:** Optional audio alerts
8. **Mobile Push Notifications:** PWA support

---

## Troubleshooting

### Notifications Not Showing
1. Check if user is logged in
2. Verify token is valid
3. Check browser console for errors
4. Verify backend is creating notifications (check DB)
5. Ensure polling is active (check Network tab)

### Browser Notifications Not Working
1. Check permission status in browser settings
2. Verify HTTPS (required for notifications)
3. Check if browser supports Notification API
4. Look for blocked notifications in browser

### Positioning Issues
1. Notification dropdown uses dynamic positioning
2. Portal renders outside sidebar to avoid clipping
3. Position calculated based on icon's `getBoundingClientRect()`
4. Falls back to bottom positioning if space available

---

## API Reference

### Get User Profile (with notifications)
```
GET /api/users/profile
Authorization: Bearer <token>

Response:
{
  success: true,
  data: {
    id: string,
    name: string,
    email: string,
    notifications: [
      {
        id: string,
        title: string,
        message: string,
        type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR',
        isRead: boolean,
        date: string (ISO 8601)
      }
    ],
    ...other user fields
  }
}
```

### Mark Notifications as Read
```
PUT /api/users/notifications/read
Authorization: Bearer <token>
Content-Type: application/json

Body (optional):
{
  notificationIds: ["uuid1", "uuid2", ...]
}

Response:
{
  success: true,
  message: "Notifications marked as read"
}
```

### Delete Notification
```
DELETE /api/users/notifications/:id
Authorization: Bearer <token>

Response:
{
  success: true,
  message: "Notification deleted successfully"
}
```

---

## Summary

The SmartStudy notification system is a **production-ready, full-featured solution** that:

✅ Provides real-time updates via polling
✅ Supports browser notifications
✅ Integrates email notifications (optional)
✅ Offers rich, interactive UI
✅ Handles multiple notification types
✅ Provides bulk and individual actions
✅ Includes accessibility features
✅ Optimized for performance
✅ Properly positioned and responsive
✅ Fully integrated across the platform

The system automatically notifies users of important events, achievements, reminders, and social interactions, enhancing user engagement and retention.

