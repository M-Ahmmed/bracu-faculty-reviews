# v0.5.2 — Stable Admin + Smart Notifications

This version removes the unstable admin deep-link/control-room jump behavior and returns the admin to a stable, static intelligence dashboard.

## Main website updates
- Missing faculty searches are quietly saved as watches.
- If that faculty page is later added, previous searchers get a useful in-app notification.
- If a page gets its first review, previous searchers and the page creator can be notified.
- If a page unlocks Community Verdict, involved users can be notified.
- Notifications are clickable inside the profile and open the relevant faculty/review page inside the website.
- Review requests are targeted and capped, not blasted to everyone.

## Admin updates
- No unstable “open exact page from admin” behavior.
- Admin remains static and focused on inspecting data.
- Adds a Notification Pulse panel showing watches, review requests, and recent notification activity.
- Reports/feedback remain visible.

## Deploy order
1. Run `community_update_v052.sql` in Supabase SQL Editor.
2. Replace main website files:
   - `index.html`
   - `styles.css`
   - `script.js`
   - `favicon.ico`
   - `bracu-campus-bg.webp`
   - `assets/profile-avatars/`
3. Replace admin files:
   - `admin.html`
   - `admin.css`
   - `admin.js`
4. Hard refresh both website and admin.

## Notes
- No existing data is deleted.
- The notification system is website-only for now. No email/browser push is added.
- Department selection is not added to user profile yet.
