/* ════════════════════════════════════════════════
   BRACU FACULTY REVIEWS — ADMIN DASHBOARD
   ════════════════════════════════════════════════ */

// Change this before using.
const ADMIN_PASSCODE = 'mueenxyz-26';

const supabaseUrl = 'https://mbmgmqignuqgixsabkwv.supabase.co';
const supabaseKey = 'sb_publishable_sUnVlxyJ0hNbb6qn6KJDwg_PVpp_39b';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let currentMode = 'daily';
let allRows = [];
let selectedUsername = null;

const adminLock = document.getElementById('adminLock');
const adminShell = document.getElementById('adminShell');
const adminPassInput = document.getElementById('adminPassInput');
const adminPassBtn = document.getElementById('adminPassBtn');
const adminPassError = document.getElementById('adminPassError');

const dailyModeBtn = document.getElementById('dailyModeBtn');
const weeklyModeBtn = document.getElementById('weeklyModeBtn');
const dateInput = document.getElementById('dateInput');
const dateLabel = document.getElementById('dateLabel');
const userFilterInput = document.getElementById('userFilterInput');
const sortSelect = document.getElementById('sortSelect');
const refreshBtn = document.getElementById('refreshBtn');

const statUniqueUsers = document.getElementById('statUniqueUsers');
const statTotalVisits = document.getElementById('statTotalVisits');
const statRepeatVisits = document.getElementById('statRepeatVisits');
const statSearches = document.getElementById('statSearches');
const statFailedSearches = document.getElementById('statFailedSearches');
const statVotesReviews = document.getElementById('statVotesReviews');

const listTitle = document.getElementById('listTitle');
const listSubtitle = document.getElementById('listSubtitle');
const rowCount = document.getElementById('rowCount');
const userList = document.getElementById('userList');

const emptyDetail = document.getElementById('emptyDetail');
const detailContent = document.getElementById('detailContent');
const detailUsername = document.getElementById('detailUsername');
const detailEmail = document.getElementById('detailEmail');
const detailRange = document.getElementById('detailRange');

const detailRangeVisits = document.getElementById('detailRangeVisits');
const detailLifetimeVisits = document.getElementById('detailLifetimeVisits');
const detailActiveDays = document.getElementById('detailActiveDays');
const detailReviewsCount = document.getElementById('detailReviewsCount');
const detailUpvotes = document.getElementById('detailUpvotes');
const detailDownvotes = document.getElementById('detailDownvotes');

const tabSearches = document.getElementById('tab-searches');
const tabVotes = document.getElementById('tab-votes');
const tabReviews = document.getElementById('tab-reviews');
const tabTimeline = document.getElementById('tab-timeline');

document.addEventListener('DOMContentLoaded', () => {
    dateInput.value = todayBD();

    if (localStorage.getItem('bracu_admin_ok') === 'yes') {
        unlockAdmin();
    }

    bindEvents();
});

function bindEvents() {
    adminPassBtn.addEventListener('click', checkPasscode);

    adminPassInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') checkPasscode();
    });

    dailyModeBtn.addEventListener('click', () => setMode('daily'));
    weeklyModeBtn.addEventListener('click', () => setMode('weekly'));

    dateInput.addEventListener('change', loadDashboard);
    userFilterInput.addEventListener('input', renderUsers);
    sortSelect.addEventListener('change', renderUsers);
    refreshBtn.addEventListener('click', loadDashboard);

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-body').forEach(b => b.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        });
    });
}

function checkPasscode() {
    const pass = adminPassInput.value.trim();

    if (pass !== ADMIN_PASSCODE) {
        adminPassError.textContent = 'Wrong passcode.';
        return;
    }

    localStorage.setItem('bracu_admin_ok', 'yes');
    unlockAdmin();
}

function unlockAdmin() {
    adminLock.classList.add('hidden');
    adminShell.classList.add('show');
    loadDashboard();
}

function setMode(mode) {
    currentMode = mode;
    selectedUsername = null;

    dailyModeBtn.classList.toggle('active', mode === 'daily');
    weeklyModeBtn.classList.toggle('active', mode === 'weekly');

    dateLabel.textContent = mode === 'daily' ? 'Select date' : 'Select any date in week';

    emptyDetail.style.display = 'block';
    detailContent.classList.remove('show');

    loadDashboard();
}

async function loadDashboard() {
    userList.innerHTML = '<div class="empty-list">Loading users...</div>';

    const selectedDate = dateInput.value || todayBD();

    try {
        if (currentMode === 'daily') {
            const { data, error } = await _supabase
                .from('admin_user_day_rollup')
                .select('*')
                .eq('visit_date', selectedDate)
                .order('visits_that_day', { ascending: false });

            if (error) throw error;

            allRows = data || [];

            listTitle.textContent = 'Daily users';
            listSubtitle.textContent = selectedDate;

        } else {
            const { start, end } = weekRange(selectedDate);

            const { data, error } = await _supabase
                .from('admin_user_week_rollup')
                .select('*')
                .eq('week_start', start)
                .order('visits_that_week', { ascending: false });

            if (error) throw error;

            allRows = data || [];

            listTitle.textContent = 'Weekly users';
            listSubtitle.textContent = `${start} → ${end}`;
        }

        renderStats(allRows);
        renderUsers();

    } catch (err) {
        console.error(err);
        userList.innerHTML = '<div class="empty-list">Failed to load admin data. Check SQL views and console.</div>';
    }
}

function renderStats(rows) {
    const uniqueUsers = rows.length;

    let totalVisits = 0;
    let repeatVisits = 0;
    let searches = 0;
    let failedSearches = 0;
    let votes = 0;
    let reviews = 0;

    rows.forEach(row => {
        if (currentMode === 'daily') {
            totalVisits += Number(row.visits_that_day || 0);
            repeatVisits += Math.max(Number(row.visits_that_day || 0) - 1, 0);
        } else {
            totalVisits += Number(row.visits_that_week || 0);
            repeatVisits += Number(row.repeat_visits_that_week || 0);
        }

        searches += Number(row.total_searches || 0);
        failedSearches += Number(row.failed_searches || 0);
        votes += Number(row.total_vote_actions || 0);
        reviews += Number(row.total_review_actions || 0);
    });

    statUniqueUsers.textContent = uniqueUsers;
    statTotalVisits.textContent = totalVisits;
    statRepeatVisits.textContent = repeatVisits;
    statSearches.textContent = searches;
    statFailedSearches.textContent = failedSearches;
    statVotesReviews.textContent = `${votes} / ${reviews}`;
}

function getFilteredSortedRows() {
    const q = userFilterInput.value.trim().toLowerCase();

    let rows = allRows.filter(row => {
        if (!q) return true;

        return String(row.username || '').toLowerCase().includes(q)
            || String(row.full_email || '').toLowerCase().includes(q);
    });

    const sort = sortSelect.value;

    rows.sort((a, b) => {
        if (sort === 'visits') {
            return getVisits(b) - getVisits(a);
        }

        if (sort === 'searches') {
            return Number(b.total_searches || 0) - Number(a.total_searches || 0);
        }

        if (sort === 'failed') {
            return Number(b.failed_searches || 0) - Number(a.failed_searches || 0);
        }

        if (sort === 'votes') {
            return Number(b.total_vote_actions || 0) - Number(a.total_vote_actions || 0);
        }

        if (sort === 'reviews') {
            return Number(b.total_review_actions || 0) - Number(a.total_review_actions || 0);
        }

        if (sort === 'recent') {
            return new Date(getLastSeen(b) || 0) - new Date(getLastSeen(a) || 0);
        }

        return 0;
    });

    return rows;
}

function renderUsers() {
    const rows = getFilteredSortedRows();

    rowCount.textContent = `${rows.length} rows`;

    if (!rows.length) {
        userList.innerHTML = '<div class="empty-list">No users found for this period.</div>';
        return;
    }

    userList.innerHTML = rows.map(row => {
        const visits = getVisits(row);
        const searches = Number(row.total_searches || 0);
        const failed = Number(row.failed_searches || 0);
        const votes = Number(row.total_vote_actions || 0);
        const reviews = Number(row.total_review_actions || 0);
        const lastAction = row.last_action || 'none';

        return `
            <button class="user-row ${row.username === selectedUsername ? 'active' : ''}" data-username="${escAttr(row.username)}">
                <div class="user-main">
                    <div class="user-name">${escHtml(row.username || 'Unknown')}</div>
                    <div class="user-email">${escHtml(row.full_email || '')}</div>

                    <div class="user-badges">
                        <span class="badge blue">${searches} searches</span>
                        <span class="badge ${failed ? 'red' : 'green'}">${failed} failed</span>
                        <span class="badge yellow">${votes} votes</span>
                        <span class="badge green">${reviews} reviews</span>
                        <span class="badge">${escHtml(lastAction)}</span>
                    </div>
                </div>

                <div class="user-side">
                    <div class="big-num">${visits}</div>
                    <span class="small-label">visits</span>
                </div>
            </button>
        `;
    }).join('');

    userList.querySelectorAll('.user-row').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedUsername = btn.dataset.username;
            renderUsers();
            loadUserDetails(selectedUsername);
        });
    });
}

async function loadUserDetails(username) {
    const selectedDate = dateInput.value || todayBD();
    let start = selectedDate;
    let end = selectedDate;

    if (currentMode === 'weekly') {
        const range = weekRange(selectedDate);
        start = range.start;
        end = range.end;
    }

    emptyDetail.style.display = 'none';
    detailContent.classList.add('show');

    detailUsername.textContent = username;
    detailEmail.textContent = 'Loading...';
    detailRange.textContent = currentMode === 'daily' ? start : `${start} → ${end}`;

    clearDetailsLoading();

    try {
        const { data, error } = await _supabase.rpc('admin_get_user_range_details', {
            p_username: username,
            p_start_date: start,
            p_end_date: end
        });

        if (error) throw error;

        renderUserDetails(data || {}, username, start, end);

    } catch (err) {
        console.error(err);
        tabTimeline.innerHTML = '<div class="empty-list">Failed to load user details.</div>';
    }
}

function clearDetailsLoading() {
    detailRangeVisits.textContent = '...';
    detailLifetimeVisits.textContent = '...';
    detailActiveDays.textContent = '...';
    detailReviewsCount.textContent = '...';
    detailUpvotes.textContent = '...';
    detailDownvotes.textContent = '...';

    tabSearches.innerHTML = '<div class="empty-list">Loading...</div>';
    tabVotes.innerHTML = '<div class="empty-list">Loading...</div>';
    tabReviews.innerHTML = '<div class="empty-list">Loading...</div>';
    tabTimeline.innerHTML = '<div class="empty-list">Loading...</div>';
}

function renderUserDetails(data, username, start, end) {
    const profile = data.profile || {};
    const rangeVisits = data.range_visits || {};
    const lifetime = data.lifetime || {};

    detailUsername.textContent = profile.username || username;
    detailEmail.textContent = profile.full_email || '';
    detailRange.textContent = currentMode === 'daily' ? start : `${start} → ${end}`;

    detailRangeVisits.textContent = Number(rangeVisits.total_visits_in_range || 0);
    detailLifetimeVisits.textContent = Number(profile.total_visits || 0);
    detailActiveDays.textContent = Number(rangeVisits.active_days || 0);
    detailReviewsCount.textContent = Number(lifetime.total_reviews || 0);
    detailUpvotes.textContent = Number(lifetime.current_upvotes || 0);
    detailDownvotes.textContent = Number(lifetime.current_downvotes || 0);

    renderSearches(data.searches || []);
    renderVotes(data.current_votes || []);
    renderReviews(data.reviews || []);
    renderTimeline(data.timeline || []);
}

function renderSearches(searches) {
    if (!searches.length) {
        tabSearches.innerHTML = '<div class="empty-list">No searches in this period.</div>';
        return;
    }

    tabSearches.innerHTML = searches.map(s => {
        const matched = s.matched === true;

        return `
            <div class="event-card">
                <div class="event-head">
                    <div class="event-title">${escHtml(s.search_query || s.event_label || 'Unknown search')}</div>
                    <div class="event-time">${formatTime(s.created_at)}</div>
                </div>
                <div class="event-sub">
                    Type: ${escHtml(s.search_type || 'unknown')}
                    · Result:
                    <span class="badge ${matched ? 'green' : 'red'}">${matched ? 'matched' : 'failed'}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderVotes(votes) {
    if (!votes.length) {
        tabVotes.innerHTML = '<div class="empty-list">No current votes.</div>';
        return;
    }

    tabVotes.innerHTML = votes.map(v => {
        const cls = v.vote_type === 'up' ? 'green' : 'red';

        return `
            <div class="event-card">
                <div class="event-head">
                    <div class="event-title">${escHtml(v.faculty_name || ('Faculty ' + v.faculty_id))}</div>
                    <div class="event-time">${formatTime(v.updated_at)}</div>
                </div>
                <div class="event-sub">
                    Current vote:
                    <span class="badge ${cls}">${escHtml(v.vote_type)}</span>
                    · Faculty ID: ${escHtml(v.faculty_id)}
                </div>
            </div>
        `;
    }).join('');
}

function renderReviews(reviews) {
    if (!reviews.length) {
        tabReviews.innerHTML = '<div class="empty-list">No reviews submitted by this user.</div>';
        return;
    }

    tabReviews.innerHTML = reviews.map(r => {
        const avg = averageRating(r.teaching_rating, r.marking_rating, r.behavior_rating);

        return `
            <div class="event-card">
                <div class="event-head">
                    <div class="event-title">${escHtml(r.faculty_name || ('Faculty ' + r.faculty_id))}</div>
                    <div class="event-time">${formatTime(r.created_at)}</div>
                </div>
                <div class="event-sub">
                    Course: ${escHtml(r.course_code || 'N/A')}
                    · Avg rating: ${avg}
                    ${r.created_in_selected_range ? '<span class="badge green">in selected range</span>' : ''}
                </div>
                <div class="event-sub" style="margin-top:8px;">${escHtml(r.raw_feedback || '')}</div>
            </div>
        `;
    }).join('');
}

function renderTimeline(events) {
    if (!events.length) {
        tabTimeline.innerHTML = '<div class="empty-list">No activity events in this period.</div>';
        return;
    }

    tabTimeline.innerHTML = events.map(e => {
        return `
            <div class="event-card">
                <div class="event-head">
                    <div class="event-title">${escHtml(e.event_type || 'event')}</div>
                    <div class="event-time">${formatTime(e.created_at)}</div>
                </div>
                <div class="event-sub">
                    Target: ${escHtml(e.target_type || '—')}
                    ${e.target_id ? ' · ID: ' + escHtml(e.target_id) : ''}
                    ${e.event_label ? ' · ' + escHtml(e.event_label) : ''}
                </div>
                <div class="event-meta">${escHtml(JSON.stringify(e.metadata || {}, null, 2))}</div>
            </div>
        `;
    }).join('');
}

function getVisits(row) {
    if (currentMode === 'daily') {
        return Number(row.visits_that_day || 0);
    }

    return Number(row.visits_that_week || 0);
}

function getLastSeen(row) {
    if (currentMode === 'daily') {
        return row.last_seen_that_day;
    }

    return row.last_seen_that_week;
}

function todayBD() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

function weekRange(dateString) {
    const date = new Date(dateString + 'T12:00:00');
    const day = date.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const monday = new Date(date);
    monday.setDate(date.getDate() + diffToMonday);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    return {
        start: toDateInputValue(monday),
        end: toDateInputValue(sunday)
    };
}

function toDateInputValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
}

function formatTime(ts) {
    if (!ts) return '—';

    return new Date(ts).toLocaleString('en-US', {
        timeZone: 'Asia/Dhaka',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function averageRating(a, b, c) {
    const nums = [a, b, c].map(Number).filter(n => !Number.isNaN(n));

    if (!nums.length) return 'N/A';

    return (nums.reduce((x, y) => x + y, 0) / nums.length).toFixed(1);
}

function escHtml(value) {
    if (value == null) return '';

    const div = document.createElement('div');
    div.textContent = String(value);

    return div.innerHTML;
}

function escAttr(value) {
    return escHtml(value).replace(/"/g, '&quot;');
}
