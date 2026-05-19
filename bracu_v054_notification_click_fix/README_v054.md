# v0.5.4 Notification Click Fix

This hotfix fixes profile notification clicks that showed:

`Notification target is not available yet.`

## Root cause

Some notifications store `source_type = community_review` and `source_id = the review id`, not the faculty page id. The browser was trying to resolve that review through public views. If the view/RLS/cache did not return the review, the notification click failed.

## Fix

The new SQL adds a server-side resolver RPC:

`resolve_my_notification_target(p_username, p_full_email, p_notification_id)`

The public site now asks Supabase to resolve the notification target securely, then opens the correct faculty page/review.

## Deploy

1. Run `community_update_v054.sql` in Supabase SQL Editor.
2. Replace public website files:
   - `index.html`
   - `styles.css`
   - `script.js`
   - `favicon.ico`
   - `bracu-campus-bg.webp`
   - `assets/profile-avatars/`
3. Replace admin files only if you want to keep the latest stable copies:
   - `admin.html`
   - `admin.css`
   - `admin.js`
4. Hard refresh the website.

## Test

1. Open profile.
2. Click a notification created by a review/page/request.
3. It should close the profile and open the related faculty page.
4. Review notifications should open the faculty page and attempt to highlight the review card.
