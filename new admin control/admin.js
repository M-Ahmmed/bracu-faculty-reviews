/* ════════════════════════════════════════════════
   BRACU FACULTY REVIEWS — ADMIN CONTROL ROOM v0.4.3
   Owner analytics dashboard for Aura, reviews, pages, searches, reactions,
   notifications, and activity trails.
   ════════════════════════════════════════════════ */

// Change this before deploying.
const ADMIN_PASSCODE = 'mueenxyz-26';

const supabaseUrl = 'https://mbmgmqignuqgixsabkwv.supabase.co';
const supabaseKey = 'sb_publishable_sUnVlxyJ0hNbb6qn6KJDwg_PVpp_39b';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

const AURA_RANKS = [
    { level: 1, xp: 0, rank: 'Notun Scout' },
    { level: 2, xp: 50, rank: 'Vanguard' },
    { level: 3, xp: 150, rank: 'Phoenix' },
    { level: 4, xp: 300, rank: 'Shikhor' },
    { level: 5, xp: 550, rank: 'Maharathi' },
    { level: 6, xp: 900, rank: 'Atlas' },
    { level: 7, xp: 1400, rank: 'Titan' },
    { level: 8, xp: 2200, rank: 'Oracle' },
    { level: 9, xp: 3500, rank: 'Campus Myth' },
    { level: 10, xp: 5000, rank: 'Mythos' }
];

let currentMode = 'daily';
let dashboardPayload = null;
let allRows = [];
let selectedUsername = null;
let selectedUserPayload = null;

const $ = id => document.getElementById(id);

const adminLock = $('adminLock');
const adminShell = $('adminShell');
const adminPassInput = $('adminPassInput');
const adminPassBtn = $('adminPassBtn');
const adminPassError = $('adminPassError');

const dailyModeBtn = $('dailyModeBtn');
const weeklyModeBtn = $('weeklyModeBtn');
const allModeBtn = $('allModeBtn');
const dateInput = $('dateInput');
const dateLabel = $('dateLabel');
const userFilterInput = $('userFilterInput');
const quickFilterSelect = $('quickFilterSelect');
const sortSelect = $('sortSelect');
const refreshBtn = $('refreshBtn');
const exportBtn = $('exportBtn');

const statUsers = $('statUsers');
const statVisits = $('statVisits');
const statSearches = $('statSearches');
const statFailedSearches = $('statFailedSearches');
const statReviews = $('statReviews');
const statPages = $('statPages');
const statAura = $('statAura');
const statReactions = $('statReactions');

const demandCount = $('demandCount');
const recentReviewCount = $('recentReviewCount');
const recentPageCount = $('recentPageCount');
const topFailedSearches = $('topFailedSearches');
const recentReviews = $('recentReviews');
const recentPages = $('recentPages');

const listTitle = $('listTitle');
const listSubtitle = $('listSubtitle');
const rowCount = $('rowCount');
const userList = $('userList');

const emptyDetail = $('emptyDetail');
const detailContent = $('detailContent');
const detailUsername = $('detailUsername');
const detailEmail = $('detailEmail');
const detailHandle = $('detailHandle');
const detailRange = $('detailRange');
const detailAuraRank = $('detailAuraRank');

const detailRangeVisits = $('detailRangeVisits');
const detailLifetimeVisits = $('detailLifetimeVisits');
const detailAura = $('detailAura');
const detailReviewsCount = $('detailReviewsCount');
const detailPagesCount = $('detailPagesCount');
const detailAgrees = $('detailAgrees');
const detailFailed = $('detailFailed');
const detailReports = $('detailReports');

const tabOverview = $('tab-overview');
const tabSearches = $('tab-searches');
const tabReviews = $('tab-reviews');
const tabPages = $('tab-pages');
const tabAura = $('tab-aura');
const tabReactions = $('tab-reactions');
const tabNotifications = $('tab-notifications');
const tabVotes = $('tab-votes');
const tabTimeline = $('tab-timeline');
const tabRaw = $('tab-raw');

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
    allModeBtn.addEventListener('click', () => setMode('all'));

    dateInput.addEventListener('change', loadDashboard);
    userFilterInput.addEventListener('input', renderUsers);
    quickFilterSelect.addEventListener('change', renderUsers);
    sortSelect.addEventListener('change', renderUsers);
    refreshBtn.addEventListener('click', loadDashboard);
    exportBtn.addEventListener('click', exportCurrentJson);

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-body').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            $('tab-' + btn.dataset.tab).classList.add('active');
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
    selectedUserPayload = null;

    dailyModeBtn.classList.toggle('active', mode === 'daily');
    weeklyModeBtn.classList.toggle('active', mode === 'weekly');
    allModeBtn.classList.toggle('active', mode === 'all');

    dateInput.disabled = mode === 'all';
    dateLabel.textContent = mode === 'daily' ? 'Select date' : mode === 'weekly' ? 'Select any date in week' : 'All time';

    emptyDetail.style.display = 'block';
    detailContent.classList.remove('show');

    loadDashboard();
}

function getCurrentRange() {
    const selectedDate = dateInput.value || todayBD();

    if (currentMode === 'weekly') {
        return weekRange(selectedDate);
    }

    if (currentMode === 'all') {
        return { start: '2000-01-01', end: todayBD(), label: 'All time' };
    }

    return { start: selectedDate, end: selectedDate, label: selectedDate };
}

async function loadDashboard() {
    userList.innerHTML = '<div class="empty-list">Loading users...</div>';
    topFailedSearches.innerHTML = '<div class="empty-list">Loading...</div>';
    recentReviews.innerHTML = '<div class="empty-list">Loading...</div>';
    recentPages.innerHTML = '<div class="empty-list">Loading...</div>';

    const range = getCurrentRange();

    try {
        const { data, error } = await _supabase.rpc('admin_get_control_room', {
            p_start_date: range.start,
            p_end_date: range.end
        });

        if (error) throw error;

        dashboardPayload = data || {};
        allRows = Array.isArray(dashboardPayload.users) ? dashboardPayload.users : [];

        listTitle.textContent = currentMode === 'daily' ? 'Daily users' : currentMode === 'weekly' ? 'Weekly users' : 'All users';
        listSubtitle.textContent = currentMode === 'all' ? 'Full dashboard range' : range.label || `${range.start} → ${range.end}`;

        renderStats(dashboardPayload.stats || {});
        renderInsightPanels(dashboardPayload);
        renderUsers();

    } catch (err) {
        console.error(err);
        userList.innerHTML = `<div class="empty-list">Failed to load admin data. Run admin_update_v043.sql first.<br>${escHtml(err.message || '')}</div>`;
        renderStats({});
    }
}

function renderStats(stats) {
    statUsers.textContent = fmtNum(stats.users || 0);
    statVisits.textContent = fmtNum(stats.visits || 0);
    statSearches.textContent = fmtNum(stats.searches || 0);
    statFailedSearches.textContent = fmtNum(stats.failed_searches || 0);
    statReviews.textContent = fmtNum(stats.reviews || 0);
    statPages.textContent = fmtNum(stats.pages_added || 0);
    statAura.textContent = fmtNum(stats.aura_earned || 0);
    statReactions.textContent = fmtNum(stats.reactions || 0);
}

function renderInsightPanels(payload) {
    const failed = payload.top_failed_searches || [];
    const reviews = payload.recent_reviews || [];
    const pages = payload.recent_pages || [];

    demandCount.textContent = `${failed.length}`;
    recentReviewCount.textContent = `${reviews.length}`;
    recentPageCount.textContent = `${pages.length}`;

    topFailedSearches.innerHTML = failed.length ? failed.map(item => `
        <div class="compact-item">
            <div>
                <div class="compact-title">${escHtml(item.query || 'Unknown')}</div>
                <div class="compact-sub">${fmtNum(item.unique_students || 0)} students · ${fmtNum(item.total_searches || 0)} failed searches</div>
            </div>
            <div class="compact-num">${fmtNum(item.total_searches || 0)}</div>
        </div>
    `).join('') : '<div class="empty-list">No demand gaps in this range.</div>';

    recentReviews.innerHTML = reviews.length ? reviews.map(item => `
        <div class="compact-item">
            <div>
                <div class="compact-title">${escHtml(item.faculty_label || 'Unknown faculty')}</div>
                <div class="compact-sub">${escHtml(item.username || '')} · ${escHtml(item.course_code || '')} · ${formatTime(item.created_at)}</div>
            </div>
            <div class="compact-num">${safeRating(item.avg_rating)}</div>
        </div>
    `).join('') : '<div class="empty-list">No recent community reviews.</div>';

    recentPages.innerHTML = pages.length ? pages.map(item => `
        <div class="compact-item">
            <div>
                <div class="compact-title">${escHtml(item.faculty_label || item.faculty_initial || 'Unknown')}</div>
                <div class="compact-sub">${escHtml((item.course_codes || []).join(', ') || item.department || 'No metadata')} · ${escHtml(item.added_by_username || '')}</div>
            </div>
            <div class="compact-num">${fmtNum(item.review_count || 0)}</div>
        </div>
    `).join('') : '<div class="empty-list">No community pages created.</div>';
}

function getFilteredSortedRows() {
    const q = userFilterInput.value.trim().toLowerCase();
    const quick = quickFilterSelect.value;

    let rows = allRows.filter(row => {
        if (q) {
            const haystack = [
                row.username,
                row.full_email,
                row.anonymous_handle,
                row.first_name_guess
            ].map(x => String(x || '').toLowerCase()).join(' ');

            if (!haystack.includes(q)) return false;
        }

        if (quick === 'reviewers') return Number(row.reviews || 0) > 0;
        if (quick === 'page_adders') return Number(row.pages_added || 0) > 0;
        if (quick === 'aura_earned') return Number(row.aura_earned_range || 0) > 0;
        if (quick === 'failed_searchers') return Number(row.failed_searches || 0) > 0;
        if (quick === 'reported') return Number(row.reports_received || 0) > 0;

        return true;
    });

    const sort = sortSelect.value;

    rows.sort((a, b) => {
        if (sort === 'recent_visit') return getTimeValue(b.last_seen_at || b.last_visited_at) - getTimeValue(a.last_seen_at || a.last_visited_at);
        if (sort === 'recent_action') return getTimeValue(b.last_action_time || b.last_action_at) - getTimeValue(a.last_action_time || a.last_action_at);
        if (sort === 'newest_signup') return getTimeValue(b.first_seen) - getTimeValue(a.first_seen);
        if (sort === 'aura') return Number(b.advising_xp || 0) - Number(a.advising_xp || 0);
        if (sort === 'aura_range') return Number(b.aura_earned_range || 0) - Number(a.aura_earned_range || 0);
        if (sort === 'reviews') return Number(b.reviews || 0) - Number(a.reviews || 0);
        if (sort === 'pages') return Number(b.pages_added || 0) - Number(a.pages_added || 0);
        if (sort === 'helpful') return Number(b.helpful_received || 0) - Number(a.helpful_received || 0);
        if (sort === 'searches') return Number(b.total_searches || 0) - Number(a.total_searches || 0);
        if (sort === 'failed') return Number(b.failed_searches || 0) - Number(a.failed_searches || 0);
        return getTimeValue(b.last_seen_at || b.last_visited_at) - getTimeValue(a.last_seen_at || a.last_visited_at);
    });

    return rows;
}

function renderUsers() {
    const rows = getFilteredSortedRows();
    rowCount.textContent = `${rows.length} rows`;

    if (!rows.length) {
        userList.innerHTML = '<div class="empty-list">No users found for this filter.</div>';
        return;
    }

    userList.innerHTML = rows.map(row => {
        const rank = getAuraRank(row.advising_xp || 0);
        const lastSeen = row.last_seen_at || row.last_visited_at;
        const selected = row.username === selectedUsername;

        return `
            <button class="user-row ${selected ? 'active' : ''}" data-username="${escAttr(row.username)}">
                <div class="user-main">
                    <div class="user-name">${escHtml(row.username || 'Unknown')}</div>
                    <div class="user-email">${escHtml(row.full_email || '')}</div>
                    <div class="user-handle">${escHtml(row.anonymous_handle || 'No handle')} · Level ${rank.level} ${rank.rank}</div>

                    <div class="user-badges">
                        <span class="badge yellow">${fmtNum(row.advising_xp || 0)} Aura</span>
                        <span class="badge blue">${fmtNum(row.total_searches || 0)} searches</span>
                        <span class="badge ${Number(row.failed_searches || 0) ? 'red' : 'green'}">${fmtNum(row.failed_searches || 0)} failed</span>
                        <span class="badge green">${fmtNum(row.reviews || 0)} reviews</span>
                        <span class="badge purple">${fmtNum(row.pages_added || 0)} pages</span>
                        <span class="badge orange">${fmtNum(row.helpful_received || 0)} agrees</span>
                        <span class="badge">last ${formatTime(lastSeen)}</span>
                    </div>
                </div>

                <div class="user-side">
                    <div class="big-num">${fmtNum(row.visits || 0)}</div>
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
    const range = getCurrentRange();

    emptyDetail.style.display = 'none';
    detailContent.classList.add('show');

    detailUsername.textContent = username;
    detailEmail.textContent = 'Loading...';
    detailHandle.textContent = 'Loading profile...';
    detailRange.textContent = currentMode === 'all' ? 'All time' : `${range.start} → ${range.end}`;
    detailAuraRank.textContent = 'Aura —';

    clearDetailsLoading();

    try {
        const { data, error } = await _supabase.rpc('admin_get_user_control_room', {
            p_username: username,
            p_start_date: range.start,
            p_end_date: range.end
        });

        if (error) throw error;

        selectedUserPayload = data || {};
        renderUserDetails(selectedUserPayload, username, range);

    } catch (err) {
        console.error(err);
        tabTimeline.innerHTML = `<div class="empty-list">Failed to load user details.<br>${escHtml(err.message || '')}</div>`;
    }
}

function clearDetailsLoading() {
    detailRangeVisits.textContent = '...';
    detailLifetimeVisits.textContent = '...';
    detailAura.textContent = '...';
    detailReviewsCount.textContent = '...';
    detailPagesCount.textContent = '...';
    detailAgrees.textContent = '...';
    detailFailed.textContent = '...';
    detailReports.textContent = '...';

    [tabOverview, tabSearches, tabReviews, tabPages, tabAura, tabReactions, tabNotifications, tabVotes, tabTimeline, tabRaw]
        .forEach(tab => tab.innerHTML = '<div class="empty-list">Loading...</div>');
}

function renderUserDetails(data, username, range) {
    const profile = data.profile || {};
    const rangeStats = data.range_stats || {};
    const lifetime = data.lifetime || {};
    const rank = getAuraRank(profile.advising_xp || 0);

    detailUsername.textContent = profile.username || username;
    detailEmail.textContent = profile.full_email || '';
    detailHandle.textContent = profile.anonymous_handle || 'No anonymous handle';
    detailRange.textContent = currentMode === 'all' ? 'All time' : `${range.start} → ${range.end}`;
    detailAuraRank.textContent = `Level ${rank.level} · ${rank.rank}`;

    detailRangeVisits.textContent = fmtNum(rangeStats.visits || 0);
    detailLifetimeVisits.textContent = fmtNum(profile.total_visits || 0);
    detailAura.textContent = fmtNum(profile.advising_xp || 0);
    detailReviewsCount.textContent = fmtNum(lifetime.reviews || 0);
    detailPagesCount.textContent = fmtNum(lifetime.pages_added || 0);
    detailAgrees.textContent = fmtNum(lifetime.helpful_received || 0);
    detailFailed.textContent = fmtNum(rangeStats.failed_searches || 0);
    detailReports.textContent = fmtNum(lifetime.reports_received || 0);

    renderOverview(data);
    renderSearches(data.searches || []);
    renderReviews(data.community_reviews || [], data.legacy_reviews || []);
    renderPages(data.pages_added || []);
    renderAura(data.credit_events || []);
    renderReactions(data.reactions_made || [], data.reactions_received || []);
    renderNotifications(data.notifications || []);
    renderVotes(data.current_votes || []);
    renderTimeline(data.timeline || [], data.daily_visits || []);
    renderRaw(data);
}

function renderOverview(data) {
    const profile = data.profile || {};
    const rangeStats = data.range_stats || {};
    const lifetime = data.lifetime || {};
    const rank = getAuraRank(profile.advising_xp || 0);
    const next = getNextAuraRank(profile.advising_xp || 0);

    tabOverview.innerHTML = `
        <div class="overview-grid">
            <div class="info-card">
                <h3>Identity</h3>
                ${kv('Username', profile.username)}
                ${kv('Email', profile.full_email)}
                ${kv('Anon handle', profile.anonymous_handle)}
                ${kv('First name guess', profile.first_name_guess)}
                ${kv('Email verified', profile.is_email_verified ? 'Yes' : 'No')}
                ${kv('Public handle', profile.handle_visible_public ? 'Visible' : 'Hidden')}
            </div>
            <div class="info-card">
                <h3>Aura</h3>
                ${kv('Aura', fmtNum(profile.advising_xp || 0))}
                ${kv('Rank', `Level ${rank.level} · ${rank.rank}`)}
                ${kv('Next rank', next ? `${next.rank} at ${fmtNum(next.xp)} Aura` : 'Max rank')}
                ${kv('Aura in range', fmtNum(rangeStats.aura_earned || 0))}
                ${kv('Aura events', fmtNum(lifetime.credit_events || 0))}
            </div>
            <div class="info-card">
                <h3>Contribution</h3>
                ${kv('Reviews', fmtNum(lifetime.reviews || 0))}
                ${kv('Pages added', fmtNum(lifetime.pages_added || 0))}
                ${kv('Agrees received', fmtNum(lifetime.helpful_received || 0))}
                ${kv('Disagrees received', fmtNum(lifetime.not_useful_received || 0))}
                ${kv('Reports received', fmtNum(lifetime.reports_received || 0))}
            </div>
            <div class="info-card">
                <h3>Behavior in range</h3>
                ${kv('Visits', fmtNum(rangeStats.visits || 0))}
                ${kv('Active days', fmtNum(rangeStats.active_days || 0))}
                ${kv('Searches', fmtNum(rangeStats.searches || 0))}
                ${kv('Failed searches', fmtNum(rangeStats.failed_searches || 0))}
                ${kv('Reactions made', fmtNum(rangeStats.reactions_made || 0))}
            </div>
        </div>
    `;
}

function renderSearches(searches) {
    if (!searches.length) {
        tabSearches.innerHTML = '<div class="empty-list">No searches in this range.</div>';
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
                    · Result: <span class="badge ${matched ? 'green' : 'red'}">${matched ? 'matched' : 'failed'}</span>
                </div>
                ${renderMeta(s.metadata)}
            </div>
        `;
    }).join('');
}

function renderReviews(communityReviews, legacyReviews) {
    const communityHtml = communityReviews.map(r => `
        <div class="event-card">
            <div class="event-head">
                <div class="event-title">${escHtml(r.faculty_label || 'Unknown faculty')} · ${escHtml(r.course_code || '')}</div>
                <div class="event-time">${formatTime(r.created_at)}</div>
            </div>
            <div class="event-sub">
                Target: ${escHtml(r.target_type)} · Avg: ${safeRating(r.avg_rating)}
                · Agree ${fmtNum(r.helpful_count || 0)} · Disagree ${fmtNum(r.not_useful_count || 0)} · Reports ${fmtNum(r.report_count || 0)}
            </div>
            ${r.generated_summary ? `<div class="event-sub" style="margin-top:8px;">${escHtml(r.generated_summary)}</div>` : ''}
            ${r.personal_note ? `<div class="event-meta">Personal note: ${escHtml(r.personal_note)}</div>` : ''}
            ${renderMeta({ tags: r.tag_labels, selected_tags: r.selected_tags })}
        </div>
    `).join('');

    const legacyHtml = legacyReviews.map(r => `
        <div class="event-card">
            <div class="event-head">
                <div class="event-title">${escHtml(r.faculty_name || ('Faculty ' + r.faculty_id))} · ${escHtml(r.course_code || '')}</div>
                <div class="event-time">${formatTime(r.created_at)}</div>
            </div>
            <div class="event-sub">Legacy student review · Avg: ${safeRating(r.avg_rating)}</div>
            ${r.raw_feedback ? `<div class="event-sub" style="margin-top:8px;">${escHtml(r.raw_feedback)}</div>` : ''}
        </div>
    `).join('');

    if (!communityHtml && !legacyHtml) {
        tabReviews.innerHTML = '<div class="empty-list">No reviews submitted by this user.</div>';
        return;
    }

    tabReviews.innerHTML = `
        ${communityHtml ? `<div class="event-sub" style="margin-bottom:10px;">Community reviews</div>${communityHtml}` : ''}
        ${legacyHtml ? `<div class="event-sub" style="margin:18px 0 10px;">Legacy reviews</div>${legacyHtml}` : ''}
    `;
}

function renderPages(pages) {
    if (!pages.length) {
        tabPages.innerHTML = '<div class="empty-list">No community faculty pages added by this user.</div>';
        return;
    }

    tabPages.innerHTML = pages.map(p => `
        <div class="event-card">
            <div class="event-head">
                <div class="event-title">${escHtml(p.faculty_label || p.faculty_initial || 'Unknown faculty')}</div>
                <div class="event-time">${formatTime(p.created_at)}</div>
            </div>
            <div class="event-sub">
                Department: ${escHtml(p.department || '—')} · Courses: ${escHtml((p.course_codes || []).join(', ') || '—')}
                · Reviews: ${fmtNum(p.review_count || 0)}
            </div>
            ${renderMeta({ id: p.id, hidden: p.is_hidden })}
        </div>
    `).join('');
}

function renderAura(events) {
    if (!events.length) {
        tabAura.innerHTML = '<div class="empty-list">No Aura events in this range.</div>';
        return;
    }

    tabAura.innerHTML = events.map(e => `
        <div class="event-card">
            <div class="event-head">
                <div class="event-title">${escHtml(e.reason_label || e.reason || 'Aura event')}</div>
                <div class="event-time">${formatTime(e.created_at)}</div>
            </div>
            <div class="event-sub">
                <span class="badge ${Number(e.points || 0) >= 0 ? 'yellow' : 'red'}">${Number(e.points || 0) >= 0 ? '+' : ''}${fmtNum(e.points || 0)} Aura</span>
                · Source: ${escHtml(e.source_type || 'site')} ${e.source_id ? '· ' + escHtml(e.source_id) : ''}
            </div>
            ${renderMeta(e.metadata)}
        </div>
    `).join('');
}

function renderReactions(made, received) {
    const madeHtml = made.map(r => renderReactionCard(r, 'made')).join('');
    const receivedHtml = received.map(r => renderReactionCard(r, 'received')).join('');

    if (!madeHtml && !receivedHtml) {
        tabReactions.innerHTML = '<div class="empty-list">No reactions in this range.</div>';
        return;
    }

    tabReactions.innerHTML = `
        ${receivedHtml ? `<div class="event-sub" style="margin-bottom:10px;">Reactions received on this user’s reviews</div>${receivedHtml}` : ''}
        ${madeHtml ? `<div class="event-sub" style="margin:18px 0 10px;">Reactions made by this user</div>${madeHtml}` : ''}
    `;
}

function renderReactionCard(r, mode) {
    const cls = r.reaction_type === 'helpful' ? 'green' : r.reaction_type === 'not_useful' ? 'red' : 'yellow';
    return `
        <div class="event-card">
            <div class="event-head">
                <div class="event-title">${escHtml(r.faculty_label || 'Unknown faculty')} · ${escHtml(r.course_code || '')}</div>
                <div class="event-time">${formatTime(r.updated_at || r.created_at)}</div>
            </div>
            <div class="event-sub">
                <span class="badge ${cls}">${escHtml(r.reaction_type || '')}</span>
                ${mode === 'received' ? 'from ' + escHtml(r.reacted_by || r.username || '') : 'by this user'}
                · Review ID: ${escHtml(r.review_id)}
            </div>
        </div>
    `;
}

function renderNotifications(notifications) {
    if (!notifications.length) {
        tabNotifications.innerHTML = '<div class="empty-list">No notifications in this range.</div>';
        return;
    }

    tabNotifications.innerHTML = notifications.map(n => `
        <div class="event-card">
            <div class="event-head">
                <div class="event-title">${escHtml(n.title || 'Notification')}</div>
                <div class="event-time">${formatTime(n.created_at)}</div>
            </div>
            <div class="event-sub">${escHtml(n.message || '')}</div>
            <div class="event-sub" style="margin-top:8px;">
                <span class="badge ${Number(n.points_delta || 0) >= 0 ? 'yellow' : 'red'}">${Number(n.points_delta || 0) >= 0 ? '+' : ''}${fmtNum(n.points_delta || 0)} Aura</span>
                <span class="badge ${n.is_read ? '' : 'blue'}">${n.is_read ? 'read' : 'unread'}</span>
            </div>
        </div>
    `).join('');
}

function renderVotes(votes) {
    if (!votes.length) {
        tabVotes.innerHTML = '<div class="empty-list">No current archive votes.</div>';
        return;
    }

    tabVotes.innerHTML = votes.map(v => {
        const cls = v.vote_type === 'up' ? 'green' : v.vote_type === 'down' ? 'red' : '';
        return `
            <div class="event-card">
                <div class="event-head">
                    <div class="event-title">${escHtml(v.faculty_name || ('Faculty ' + v.faculty_id))}</div>
                    <div class="event-time">${formatTime(v.updated_at)}</div>
                </div>
                <div class="event-sub">
                    Current vote: <span class="badge ${cls}">${escHtml(v.vote_type)}</span>
                    · Faculty ID: ${escHtml(v.faculty_id)}
                </div>
            </div>
        `;
    }).join('');
}

function renderTimeline(events, dailyVisits) {
    const dailyHtml = (dailyVisits || []).map(v => `
        <div class="event-card">
            <div class="event-head">
                <div class="event-title">Daily visit · ${escHtml(v.visit_date)}</div>
                <div class="event-time">${formatTime(v.last_seen_at)}</div>
            </div>
            <div class="event-sub">Visit count: ${fmtNum(v.visit_count || 0)} · First seen: ${formatTime(v.first_seen_at)}</div>
        </div>
    `).join('');

    const eventHtml = (events || []).map(e => `
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
            ${renderMeta(e.metadata)}
        </div>
    `).join('');

    if (!dailyHtml && !eventHtml) {
        tabTimeline.innerHTML = '<div class="empty-list">No timeline events in this range.</div>';
        return;
    }

    tabTimeline.innerHTML = `${dailyHtml}${eventHtml}`;
}

function renderRaw(data) {
    tabRaw.innerHTML = `<pre class="raw-json">${escHtml(JSON.stringify(data || {}, null, 2))}</pre>`;
}

function renderMeta(obj) {
    if (!obj || (typeof obj === 'object' && !Object.keys(obj).length)) return '';
    return `<div class="event-meta">${escHtml(JSON.stringify(obj, null, 2))}</div>`;
}

function kv(key, value) {
    return `<div class="kv"><span>${escHtml(key)}</span><strong>${escHtml(value == null || value === '' ? '—' : value)}</strong></div>`;
}

function getAuraRank(xpValue) {
    const xp = Number(xpValue || 0);
    let current = AURA_RANKS[0];
    for (const rank of AURA_RANKS) {
        if (xp >= rank.xp) current = rank;
    }
    return current;
}

function getNextAuraRank(xpValue) {
    const xp = Number(xpValue || 0);
    return AURA_RANKS.find(rank => rank.xp > xp) || null;
}

function exportCurrentJson() {
    const payload = selectedUserPayload || dashboardPayload || {};
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedUserPayload ? `bracu-user-${selectedUsername || 'detail'}.json` : 'bracu-admin-dashboard.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
    return { start: toDateInputValue(monday), end: toDateInputValue(sunday), label: `${toDateInputValue(monday)} → ${toDateInputValue(sunday)}` };
}

function toDateInputValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatTime(ts) {
    if (!ts) return '—';
    const parsed = new Date(ts);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleString('en-US', {
        timeZone: 'Asia/Dhaka',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function getTimeValue(value) {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
}

function safeRating(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(1) : '—';
}

function fmtNum(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return '0';
    return new Intl.NumberFormat('en-US').format(n);
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
