# v0.5.3 — Profile Hotfix + Stability Audit

Fixes the profile crash caused by missing `escAttr()` in the public website script.

## Replace
- index.html
- styles.css
- script.js
- admin.html
- admin.css
- admin.js

## SQL
No new SQL is required if v0.5.2 SQL already ran. Keep `community_update_v052.sql` only as the latest required backend patch.

## What changed
- Added missing public-site `escAttr()` helper.
- Added safe notification rendering so one malformed notification cannot break the whole profile sheet.
- Kept admin in stable/static dashboard mode.
- Re-checked JavaScript syntax for website and admin.
