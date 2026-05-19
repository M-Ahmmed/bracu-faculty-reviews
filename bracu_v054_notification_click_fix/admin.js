/* ════════════════════════════════════════════════
   BRACU FACULTY REVIEWS — ADMIN CONTROL ROOM v0.5.2
   Stable static intelligence dashboard + smart notification pulse.
   ════════════════════════════════════════════════ */

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
let reportsPayload = null;
let notificationPayload = null;
let allRows = [];
let selectedUsername = null;
let selectedUserPayload = null;

const $ = id => document.getElementById(id);

const els = {
    adminLock: $('adminLock'), adminShell: $('adminShell'), adminPassInput: $('adminPassInput'),
    adminPassBtn: $('adminPassBtn'), adminPassError: $('adminPassError'),
    dailyModeBtn: $('dailyModeBtn'), weeklyModeBtn: $('weeklyModeBtn'), allModeBtn: $('allModeBtn'),
    dateInput: $('dateInput'), dateLabel: $('dateLabel'), userFilterInput: $('userFilterInput'),
    quickFilterSelect: $('quickFilterSelect'), sortSelect: $('sortSelect'), refreshBtn: $('refreshBtn'), exportBtn: $('exportBtn'),
    statUsers: $('statUsers'), statVisits: $('statVisits'), statSearches: $('statSearches'),
    statFailedSearches: $('statFailedSearches'), statReviews: $('statReviews'), statPages: $('statPages'),
    statAura: $('statAura'), statReports: $('statReports'),
    feedbackCount: $('feedbackCount'), feedbackList: $('feedbackList'), reviewReportCount: $('reviewReportCount'), reviewReportList: $('reviewReportList'),
    notificationCount: $('notificationCount'), notificationList: $('notificationList'),
    demandCount: $('demandCount'), topFailedSearches: $('topFailedSearches'),
    recentReviewCount: $('recentReviewCount'), recentReviews: $('recentReviews'), recentPageCount: $('recentPageCount'), recentPages: $('recentPages'),
    listTitle: $('listTitle'), listSubtitle: $('listSubtitle'), rowCount: $('rowCount'), userList: $('userList'),
    emptyDetail: $('emptyDetail'), detailContent: $('detailContent'), detailUsername: $('detailUsername'),
    detailEmail: $('detailEmail'), detailHandle: $('detailHandle'), detailRange: $('detailRange'), detailAuraRank: $('detailAuraRank'),
    detailRangeVisits: $('detailRangeVisits'), detailLifetimeVisits: $('detailLifetimeVisits'), detailAura: $('detailAura'),
    detailReviewsCount: $('detailReviewsCount'), detailPagesCount: $('detailPagesCount'), detailAgrees: $('detailAgrees'),
    detailFailed: $('detailFailed'), detailReports: $('detailReports'),
    tabOverview: $('tab-overview'), tabSearches: $('tab-searches'), tabReviews: $('tab-reviews'), tabPages: $('tab-pages'),
    tabAura: $('tab-aura'), tabReactions: $('tab-reactions'), tabNotifications: $('tab-notifications'), tabVotes: $('tab-votes'),
    tabTimeline: $('tab-timeline'), tabRaw: $('tab-raw'), toast: $('toast')
};

document.addEventListener('DOMContentLoaded', () => {
    els.dateInput.value = todayBD();
    bindEvents();

    if (localStorage.getItem('bracu_admin_ok') === 'yes') {
        unlockAdmin();
    }
});

function bindEvents() {
    els.adminPassBtn.addEventListener('click', checkPasscode);
    els.adminPassInput.addEventListener('keydown', e => { if (e.key === 'Enter') checkPasscode(); });
    els.dailyModeBtn.addEventListener('click', () => setMode('daily'));
    els.weeklyModeBtn.addEventListener('click', () => setMode('weekly'));
    els.allModeBtn.addEventListener('click', () => setMode('all'));
    els.dateInput.addEventListener('change', loadDashboard);
    els.userFilterInput.addEventListener('input', renderUsers);
    els.quickFilterSelect.addEventListener('change', renderUsers);
    els.sortSelect.addEventListener('change', renderUsers);
    els.refreshBtn.addEventListener('click', loadDashboard);
    els.exportBtn.addEventListener('click', exportCurrentJson);

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });

    document.querySelectorAll('[data-jump]').forEach(btn => {
        btn.addEventListener('click', () => jumpTo(btn.dataset.jump));
    });
}

function checkPasscode() {
    const pass = els.adminPassInput.value.trim();
    if (pass !== ADMIN_PASSCODE) {
        els.adminPassError.textContent = 'Wrong passcode.';
        return;
    }
    localStorage.setItem('bracu_admin_ok', 'yes');
    unlockAdmin();
}

function unlockAdmin() {
    els.adminLock.classList.add('hidden');
    els.adminShell.classList.add('show');
    loadDashboard();
}

function setMode(mode) {
    currentMode = mode;
    selectedUsername = null;
    selectedUserPayload = null;

    els.dailyModeBtn.classList.toggle('active', mode === 'daily');
    els.weeklyModeBtn.classList.toggle('active', mode === 'weekly');
    els.allModeBtn.classList.toggle('active', mode === 'all');
    els.dateInput.disabled = mode === 'all';
    els.dateLabel.textContent = mode === 'daily' ? 'Select date' : mode === 'weekly' ? 'Select any date in week' : 'All time';
    els.emptyDetail.style.display = 'block';
    els.detailContent.classList.remove('show');
    loadDashboard();
}

function getCurrentRange() {
    const selectedDate = els.dateInput.value || todayBD();
    if (currentMode === 'weekly') return weekRange(selectedDate);
    if (currentMode === 'all') return { start: '2000-01-01', end: todayBD() };
    return { start: selectedDate, end: selectedDate };
}

async function loadDashboard() {
    skeletonDashboard();
    const { start, end } = getCurrentRange();

    try {
        const controlRes = await _supabase.rpc('admin_get_control_room', { p_start_date: start, p_end_date: end });
        if (controlRes.error) throw controlRes.error;

        dashboardPayload = controlRes.data || {};
        allRows = dashboardPayload.users || [];
        setRangeLabels(start, end);

        const [reportsRes, notificationRes] = await Promise.allSettled([
            _supabase.rpc('admin_get_reports_control_room', { p_start_date: start, p_end_date: end }),
            _supabase.rpc('admin_get_notification_pulse', { p_start_date: start, p_end_date: end })
        ]);

        reportsPayload = {};
        if (reportsRes.status === 'fulfilled' && !reportsRes.value.error) {
            reportsPayload = reportsRes.value.data || {};
        } else {
            console.warn('Reports panel unavailable:', reportsRes.reason || reportsRes.value?.error);
            els.feedbackList.innerHTML = '<div class="empty-list">Feedback/report RPC unavailable. Core dashboard is still active.</div>';
            els.reviewReportList.innerHTML = '<div class="empty-list">Reports unavailable. Run the latest admin SQL if needed.</div>';
        }

        notificationPayload = {};
        if (notificationRes.status === 'fulfilled' && !notificationRes.value.error) {
            notificationPayload = notificationRes.value.data || {};
        } else {
            console.warn('Notification pulse unavailable:', notificationRes.reason || notificationRes.value?.error);
            notificationPayload = {};
        }

        renderStats(dashboardPayload.stats || {}, reportsPayload || {}, notificationPayload || {});
        renderPulsePanels(dashboardPayload, reportsPayload, notificationPayload);
        renderUsers();

    } catch (err) {
        console.error(err);
        els.userList.innerHTML = '<div class="empty-list">Failed to load core dashboard. Run admin_update_v043.sql or the v0.5.2 SQL patch, then refresh.</div>';
        showToast('Dashboard load failed');
    }
}

function skeletonDashboard() {
    els.userList.innerHTML = '<div class="empty-list">Loading users...</div>';
    els.feedbackList.innerHTML = '<div class="empty-list">Loading feedback...</div>';
    els.reviewReportList.innerHTML = '<div class="empty-list">Loading reports...</div>';
    els.topFailedSearches.innerHTML = '<div class="empty-list">Loading demand gaps...</div>';
    if (els.notificationList) els.notificationList.innerHTML = '<div class="empty-list">Loading notification pulse...</div>';
    els.recentReviews.innerHTML = '<div class="empty-list">Loading reviews...</div>';
    els.recentPages.innerHTML = '<div class="empty-list">Loading pages...</div>';
}

function setRangeLabels(start, end) {
    els.listTitle.textContent = currentMode === 'all' ? 'All users' : currentMode === 'weekly' ? 'Weekly users' : 'Daily users';
    els.listSubtitle.textContent = currentMode === 'all' ? 'All-time activity' : start === end ? start : `${start} → ${end}`;
}

function renderStats(stats, reports, notifications = {}) {
    const feedbackStats = reports.feedback_stats || {};
    const reviewReports = Number(reports.review_report_count || 0);
    const feedbackUnread = Number(feedbackStats.unread || 0);
    const notificationStats = notifications.stats || {};
    const unreadNotifications = Number(notificationStats.unread || 0);

    els.statUsers.textContent = num(stats.users);
    els.statVisits.textContent = num(stats.visits);
    els.statSearches.textContent = num(stats.searches);
    els.statFailedSearches.textContent = num(stats.failed_searches);
    els.statReviews.textContent = num(stats.reviews);
    els.statPages.textContent = num(stats.pages_added);
    els.statAura.textContent = num(stats.aura_earned);
    els.statReports.textContent = num(reviewReports + feedbackUnread + unreadNotifications);
}

function renderPulsePanels(payload, reports, notifications = {}) {
    const feedback = reports.feedback_messages || [];
    const reviewReports = reports.review_reports || [];
    const failed = payload.top_failed_searches || [];
    const reviews = payload.recent_reviews || [];
    const pages = payload.recent_pages || [];
    const feedbackStats = reports.feedback_stats || {};

    els.feedbackCount.textContent = `${num(feedbackStats.unread || 0)} unread`;
    els.reviewReportCount.textContent = `${num(reports.review_report_count || 0)} reports`;
    els.demandCount.textContent = `${failed.length}`;
    els.recentReviewCount.textContent = `${reviews.length}`;
    els.recentPageCount.textContent = `${pages.length}`;

    renderFeedback(feedback);
    renderReviewReports(reviewReports);
    renderNotificationPulse(notifications);
    renderDemandGaps(failed);
    renderRecentReviews(reviews);
    renderRecentPages(pages);
}

function renderNotificationPulse(payload = {}) {
    if (!els.notificationList) return;
    const stats = payload.stats || {};
    const items = payload.recent_notifications || [];
    const watches = payload.top_watches || [];
    const countLabel = `${num(stats.unread || 0)} unread · ${num(stats.review_requests || 0)} requests`;
    if (els.notificationCount) els.notificationCount.textContent = countLabel;

    if (!items.length && !watches.length) {
        els.notificationList.innerHTML = '<div class="empty-list">No notification activity in this range yet.</div>';
        return;
    }

    const notificationHtml = items.slice(0, 6).map(n => `
        <div class="feed-item static-card">
            <div class="feed-top">
                <div class="feed-title">${escHtml(n.title || 'Notification')} ${n.source_type ? badge(labelize(n.source_type), 'purple') : ''}</div>
                <div class="feed-time">${formatTime(n.created_at)}</div>
            </div>
            <div class="feed-sub"><strong>${escHtml(n.username || 'unknown')}</strong> ${n.points_delta ? `· ${n.points_delta > 0 ? '+' : ''}${num(n.points_delta)} Aura` : ''}</div>
            ${n.message ? `<div class="notification-muted">${escHtml(n.message)}</div>` : ''}
        </div>
    `).join('');

    const watchHtml = watches.slice(0, 4).map(w => `
        <div class="feed-item static-card">
            <div class="feed-top">
                <div class="feed-title">Watching ${escHtml(w.normalized_query || '—')}</div>
                <div class="feed-time">${formatTime(w.last_seen_at)}</div>
            </div>
            <div class="feed-sub">${num(w.unique_students)} students · ${num(w.total_searches)} missing searches</div>
        </div>
    `).join('');

    els.notificationList.innerHTML = notificationHtml + (watchHtml ? `<div class="empty-list" style="padding:10px 4px 8px;">Top watches</div>${watchHtml}` : '');
}

function renderFeedback(items) {
    if (!items.length) {
        els.feedbackList.innerHTML = '<div class="empty-list">No feedback in this range.</div>';
        return;
    }

    els.feedbackList.innerHTML = items.map(f => `
        <div class="feed-item ${f.is_read ? '' : 'unread'}">
            <div class="feed-top">
                <div class="feed-title">
                    ${badge(labelize(f.feedback_type), badgeClassForFeedback(f.feedback_type))}
                    ${f.is_archived ? badge('archived') : f.is_read ? badge('read') : badge('new', 'blue')}
                </div>
                <div class="feed-time">${formatTime(f.created_at)}</div>
            </div>
            <div class="feed-sub"><strong>${escHtml(f.username || 'Unknown')}</strong> · ${escHtml(f.full_email || 'no email')}</div>
            <div class="feed-sub" style="margin-top:7px;">${escHtml(f.message)}</div>
            ${f.page_url ? `<div class="feed-sub" style="margin-top:7px;">Page: ${escHtml(f.page_url)}</div>` : ''}
            <div class="feed-actions">
                <button class="tiny-btn blue" onclick="copyText('${escAttr(f.full_email || '')}')">Copy email</button>
                <button class="tiny-btn ${f.is_read ? '' : 'green'}" onclick="markFeedbackRead(${Number(f.id)}, ${f.is_read ? 'false' : 'true'})">${f.is_read ? 'Mark unread' : 'Mark read'}</button>
                <button class="tiny-btn yellow" onclick="archiveFeedback(${Number(f.id)}, ${f.is_archived ? 'false' : 'true'})">${f.is_archived ? 'Unarchive' : 'Archive'}</button>
            </div>
        </div>
    `).join('');
}

function renderReviewReports(items) {
    if (!items.length) {
        els.reviewReportList.innerHTML = '<div class="empty-list">No review reports in this range.</div>';
        return;
    }

    els.reviewReportList.innerHTML = items.map(r => `
        <div class="feed-item">
            <div class="feed-top">
                <div class="feed-title">${escHtml(r.faculty_label || 'Unknown faculty')} ${r.course_code ? badge(r.course_code, 'blue') : ''}</div>
                <div class="feed-time">${formatTime(r.updated_at)}</div>
            </div>
            <div class="feed-sub">
                Reported by <strong>${escHtml(r.reported_by || 'unknown')}</strong> · owner <strong>${escHtml(r.review_owner || 'unknown')}</strong>
            </div>
            <div class="feed-sub" style="margin-top:7px;">
                ${badge(`${num(r.total_reports_for_review)} reports`, 'red')}
                ${badge(`${num(r.helpful_count)} agree`, 'green')}
                ${badge(`${num(r.not_useful_count)} disagree`, 'yellow')}
                ${r.is_hidden ? badge('hidden', 'red') : badge('visible')}
            </div>
            <div class="event-meta">${escHtml((r.personal_note || r.generated_summary || '').slice(0, 420) || 'No text preview')}</div>
            <div class="feed-actions">
                <button class="tiny-btn blue" onclick="selectUser('${escAttr(r.review_owner || '')}')">Open owner</button>
                <button class="tiny-btn" onclick="selectUser('${escAttr(r.reported_by || '')}')">Open reporter</button>
                <button class="tiny-btn red" onclick="copyText('review_id: ${Number(r.review_id)}')">Copy review ID</button>
            </div>
        </div>
    `).join('');
}

function renderDemandGaps(items) {
    if (!items.length) {
        els.topFailedSearches.innerHTML = '<div class="empty-list">No failed search patterns yet.</div>';
        return;
    }
    els.topFailedSearches.innerHTML = items.slice(0, 10).map(x => `
        <div class="feed-item">
            <div class="feed-top"><div class="feed-title">${escHtml(x.query || 'Unknown')}</div><div class="feed-time">${formatTime(x.last_searched_at)}</div></div>
            <div class="feed-sub">${num(x.unique_students)} students · ${num(x.total_searches)} searches</div>
        </div>
    `).join('');
}

function renderRecentReviews(items) {
    if (!items.length) {
        els.recentReviews.innerHTML = '<div class="empty-list">No recent reviews.</div>';
        return;
    }
    els.recentReviews.innerHTML = items.slice(0, 8).map(r => `
        <div class="feed-item">
            <div class="feed-top"><div class="feed-title">${escHtml(r.faculty_label || 'Unknown')}</div><div class="feed-time">${formatTime(r.created_at)}</div></div>
            <div class="feed-sub">${escHtml(r.username || 'unknown')} · ${escHtml(r.course_code || 'N/A')} · avg ${escHtml(r.avg_rating || '—')}</div>
        </div>
    `).join('');
}

function renderRecentPages(items) {
    if (!items.length) {
        els.recentPages.innerHTML = '<div class="empty-list">No recent pages.</div>';
        return;
    }
    els.recentPages.innerHTML = items.slice(0, 8).map(p => `
        <div class="feed-item">
            <div class="feed-top"><div class="feed-title">${escHtml(p.faculty_label || p.faculty_initial || 'Unknown')}</div><div class="feed-time">${formatTime(p.created_at)}</div></div>
            <div class="feed-sub">${escHtml(p.added_by_username || 'unknown')} · ${num(p.review_count)} reviews</div>
        </div>
    `).join('');
}

function getFilteredSortedRows() {
    const q = els.userFilterInput.value.trim().toLowerCase();
    const focus = els.quickFilterSelect.value;

    let rows = (allRows || []).filter(row => {
        const queryOk = !q || [row.username, row.full_email, row.anonymous_handle, row.first_name_guess]
            .some(v => String(v || '').toLowerCase().includes(q));
        if (!queryOk) return false;

        if (focus === 'reviewers') return Number(row.reviews || 0) > 0;
        if (focus === 'page_adders') return Number(row.pages_added || 0) > 0;
        if (focus === 'aura_earned') return Number(row.aura_earned_range || 0) !== 0 || Number(row.advising_xp || 0) > 0;
        if (focus === 'failed_searchers') return Number(row.failed_searches || 0) > 0;
        if (focus === 'reported') return Number(row.reports_received || 0) > 0 || Number(row.reports_made || 0) > 0;
        return true;
    });

    const sort = els.sortSelect.value;
    rows.sort((a, b) => {
        if (sort === 'recent_visit') return timeVal(b.last_seen_at || b.last_visited_at) - timeVal(a.last_seen_at || a.last_visited_at);
        if (sort === 'recent_action') return timeVal(b.last_action_time || b.last_action_at) - timeVal(a.last_action_time || a.last_action_at);
        if (sort === 'aura') return numRaw(b.advising_xp) - numRaw(a.advising_xp);
        if (sort === 'aura_range') return numRaw(b.aura_earned_range) - numRaw(a.aura_earned_range);
        if (sort === 'reviews') return numRaw(b.reviews) - numRaw(a.reviews);
        if (sort === 'pages') return numRaw(b.pages_added) - numRaw(a.pages_added);
        if (sort === 'helpful') return numRaw(b.helpful_received) - numRaw(a.helpful_received);
        if (sort === 'searches') return numRaw(b.total_searches) - numRaw(a.total_searches);
        if (sort === 'failed') return numRaw(b.failed_searches) - numRaw(a.failed_searches);
        if (sort === 'newest_signup') return timeVal(b.first_seen) - timeVal(a.first_seen);
        return 0;
    });
    return rows;
}

function renderUsers() {
    const rows = getFilteredSortedRows();
    els.rowCount.textContent = `${rows.length} rows`;

    if (!rows.length) {
        els.userList.innerHTML = '<div class="empty-list">No users match this view.</div>';
        return;
    }

    els.userList.innerHTML = rows.map(row => {
        const rank = getAuraRank(row.advising_xp || 0);
        return `
            <button class="user-row ${row.username === selectedUsername ? 'active' : ''}" data-username="${escAttr(row.username)}">
                <div class="user-main">
                    <div class="user-name">${escHtml(row.username || 'Unknown')}</div>
                    <div class="user-email">${escHtml(row.full_email || '')}</div>
                    <div class="user-badges">
                        ${badge(rank.rank, 'purple')}
                        ${badge(`${num(row.total_searches)} searches`, 'blue')}
                        ${badge(`${num(row.failed_searches)} failed`, row.failed_searches ? 'red' : 'green')}
                        ${badge(`${num(row.reviews)} reviews`, 'green')}
                        ${badge(`${num(row.pages_added)} pages`, 'yellow')}
                        ${row.reports_received ? badge(`${num(row.reports_received)} reports`, 'red') : ''}
                    </div>
                </div>
                <div class="user-side">
                    <div class="big-num">${num(row.advising_xp || 0)}</div>
                    <span class="small-label">Aura</span>
                </div>
            </button>
        `;
    }).join('');

    els.userList.querySelectorAll('.user-row').forEach(btn => {
        btn.addEventListener('click', () => selectUser(btn.dataset.username));
    });
}

async function selectUser(username) {
    if (!username) return;
    selectedUsername = username;
    renderUsers();
    await loadUserDetails(username);
    document.getElementById('usersSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.selectUser = selectUser;

async function loadUserDetails(username) {
    const { start, end } = getCurrentRange();
    els.emptyDetail.style.display = 'none';
    els.detailContent.classList.add('show');
    clearDetailsLoading();
    els.detailUsername.textContent = username;
    els.detailEmail.textContent = 'Loading...';
    els.detailRange.textContent = start === end ? start : `${start} → ${end}`;

    try {
        const { data, error } = await _supabase.rpc('admin_get_user_control_room', {
            p_username: username,
            p_start_date: start,
            p_end_date: end
        });
        if (error) throw error;
        selectedUserPayload = data || {};
        renderUserDetails(selectedUserPayload, username, start, end);
    } catch (err) {
        console.error(err);
        els.tabOverview.innerHTML = '<div class="empty-list">Failed to load selected user.</div>';
    }
}

function clearDetailsLoading() {
    ['detailRangeVisits','detailLifetimeVisits','detailAura','detailReviewsCount','detailPagesCount','detailAgrees','detailFailed','detailReports'].forEach(id => $(id).textContent = '...');
    [els.tabOverview, els.tabSearches, els.tabReviews, els.tabPages, els.tabAura, els.tabReactions, els.tabNotifications, els.tabVotes, els.tabTimeline, els.tabRaw]
        .forEach(el => el.innerHTML = '<div class="empty-list">Loading...</div>');
}

function renderUserDetails(data, username, start, end) {
    const profile = data.profile || {};
    const range = data.range_stats || {};
    const life = data.lifetime || {};
    const rank = getAuraRank(profile.advising_xp || 0);

    els.detailUsername.textContent = profile.username || username;
    els.detailEmail.textContent = profile.full_email || '';
    els.detailHandle.textContent = profile.anonymous_handle || 'No handle';
    els.detailRange.textContent = start === end ? start : `${start} → ${end}`;
    els.detailAuraRank.textContent = `L${rank.level} · ${rank.rank}`;

    els.detailRangeVisits.textContent = num(range.visits);
    els.detailLifetimeVisits.textContent = num(profile.total_visits);
    els.detailAura.textContent = num(profile.advising_xp);
    els.detailReviewsCount.textContent = num(life.reviews);
    els.detailPagesCount.textContent = num(life.pages_added);
    els.detailAgrees.textContent = num(life.helpful_received);
    els.detailFailed.textContent = num(range.failed_searches);
    els.detailReports.textContent = num(life.reports_received);

    renderOverview(data, rank);
    renderSearches(data.searches || []);
    renderReviews([...(data.community_reviews || []), ...(data.legacy_reviews || [])]);
    renderPages(data.pages_added || []);
    renderAura(data.credit_events || []);
    renderReactions(data.reactions_made || [], data.reactions_received || []);
    renderNotifications(data.notifications || []);
    renderVotes(data.current_votes || []);
    renderTimeline(data.timeline || []);
    els.tabRaw.innerHTML = `<div class="event-meta">${escHtml(JSON.stringify(data, null, 2))}</div>`;
}

function renderOverview(data, rank) {
    const p = data.profile || {};
    const r = data.range_stats || {};
    const l = data.lifetime || {};
    els.tabOverview.innerHTML = `
        <div class="grid-2">
            ${overviewCard('Identity', `
                ${line('Username', p.username)}
                ${line('Email', p.full_email)}
                ${line('Handle', p.anonymous_handle)}
                ${line('Verified', p.is_email_verified ? 'yes' : 'no')}
            `)}
            ${overviewCard('Aura', `
                ${line('Total Aura', num(p.advising_xp))}
                ${line('Rank', `Level ${rank.level} · ${rank.rank}`)}
                ${line('Range earned', num(r.aura_earned))}
                ${line('Credit events', num(l.credit_events))}
            `)}
            ${overviewCard('Contribution', `
                ${line('Reviews', num(l.reviews))}
                ${line('Community reviews', num(l.community_reviews))}
                ${line('Legacy reviews', num(l.legacy_reviews))}
                ${line('Pages added', num(l.pages_added))}
            `)}
            ${overviewCard('Trust / moderation', `
                ${line('Agrees received', num(l.helpful_received))}
                ${line('Disagrees received', num(l.not_useful_received))}
                ${line('Reports received', num(l.reports_received))}
                ${line('Range failed searches', num(r.failed_searches))}
            `)}
        </div>
    `;
}

function overviewCard(title, body) {
    return `<div class="event-card"><div class="event-title">${escHtml(title)}</div><div class="event-sub" style="margin-top:10px;">${body}</div></div>`;
}

function line(label, value) {
    return `<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="color:var(--t3)">${escHtml(label)}</span><strong style="color:var(--t1);text-align:right">${escHtml(value ?? '—')}</strong></div>`;
}

function renderSearches(items) {
    if (!items.length) return els.tabSearches.innerHTML = '<div class="empty-list">No searches in this range.</div>';
    els.tabSearches.innerHTML = items.map(s => `
        <div class="event-card">
            <div class="event-head"><div class="event-title">${escHtml(s.search_query || s.event_label || 'Unknown search')}</div><div class="event-time">${formatTime(s.created_at)}</div></div>
            <div class="event-sub">Type: ${escHtml(s.search_type || 'unknown')} · ${badge(s.matched ? 'matched' : 'failed', s.matched ? 'green' : 'red')}</div>
            <div class="event-meta">${escHtml(JSON.stringify(s.metadata || {}, null, 2))}</div>
        </div>
    `).join('');
}

function renderReviews(items) {
    if (!items.length) return els.tabReviews.innerHTML = '<div class="empty-list">No reviews by this user in this range.</div>';
    items.sort((a, b) => timeVal(b.updated_at || b.created_at) - timeVal(a.updated_at || a.created_at));
    els.tabReviews.innerHTML = items.map(r => `
        <div class="event-card">
            <div class="event-head"><div class="event-title">${escHtml(r.faculty_label || r.faculty_name || 'Unknown faculty')} ${r.course_code ? badge(r.course_code, 'blue') : ''}</div><div class="event-time">${formatTime(r.updated_at || r.created_at)}</div></div>
            <div class="event-sub">Avg: ${escHtml(r.avg_rating || avgRating(r.teaching_rating, r.marking_rating, r.behavior_rating))} · ${badge(`${num(r.helpful_count)} agree`, 'green')} ${badge(`${num(r.not_useful_count)} disagree`, 'yellow')} ${r.report_count ? badge(`${num(r.report_count)} reports`, 'red') : ''}</div>
            <div class="event-meta">${escHtml(r.personal_note || r.raw_feedback || r.generated_summary || 'No text')}</div>
        </div>
    `).join('');
}

function renderPages(items) {
    if (!items.length) return els.tabPages.innerHTML = '<div class="empty-list">No pages added in this range.</div>';
    els.tabPages.innerHTML = items.map(p => `
        <div class="event-card">
            <div class="event-head"><div class="event-title">${escHtml(p.faculty_label || p.faculty_initial || 'Unknown')}</div><div class="event-time">${formatTime(p.created_at)}</div></div>
            <div class="event-sub">${escHtml(p.department || 'No dept')} · ${(p.course_codes || []).map(c => badge(c, 'blue')).join(' ')} · ${num(p.review_count)} reviews</div>
        </div>
    `).join('');
}

function renderAura(items) {
    if (!items.length) return els.tabAura.innerHTML = '<div class="empty-list">No Aura events in this range.</div>';
    els.tabAura.innerHTML = items.map(e => `
        <div class="event-card">
            <div class="event-head"><div class="event-title">${Number(e.points) >= 0 ? '+' : ''}${num(e.points)} Aura · ${escHtml(e.reason_label || e.reason)}</div><div class="event-time">${formatTime(e.created_at)}</div></div>
            <div class="event-sub">${escHtml(e.source_type || '')} ${e.source_id ? '· ' + escHtml(e.source_id) : ''}</div>
            <div class="event-meta">${escHtml(JSON.stringify(e.metadata || {}, null, 2))}</div>
        </div>
    `).join('');
}

function renderReactions(made, received) {
    const all = [
        ...made.map(x => ({ ...x, direction: 'made' })),
        ...received.map(x => ({ ...x, direction: 'received' }))
    ].sort((a, b) => timeVal(b.updated_at || b.created_at) - timeVal(a.updated_at || a.created_at));
    if (!all.length) return els.tabReactions.innerHTML = '<div class="empty-list">No reaction activity in this range.</div>';
    els.tabReactions.innerHTML = all.map(r => `
        <div class="event-card">
            <div class="event-head"><div class="event-title">${escHtml(r.direction)} · ${escHtml(r.reaction_type)}</div><div class="event-time">${formatTime(r.updated_at || r.created_at)}</div></div>
            <div class="event-sub">${escHtml(r.faculty_label || 'Unknown faculty')} ${r.course_code ? '· ' + escHtml(r.course_code) : ''} ${r.reacted_by ? '· by ' + escHtml(r.reacted_by) : ''}</div>
        </div>
    `).join('');
}

function renderNotifications(items) {
    if (!items.length) return els.tabNotifications.innerHTML = '<div class="empty-list">No notifications in this range.</div>';
    els.tabNotifications.innerHTML = items.map(n => `
        <div class="event-card">
            <div class="event-head"><div class="event-title">${escHtml(n.title || 'Notification')} ${n.points_delta ? badge(`${Number(n.points_delta) > 0 ? '+' : ''}${n.points_delta} Aura`, 'purple') : ''}</div><div class="event-time">${formatTime(n.created_at)}</div></div>
            <div class="event-sub">${escHtml(n.message || '')}</div>
        </div>
    `).join('');
}

function renderVotes(items) {
    if (!items.length) return els.tabVotes.innerHTML = '<div class="empty-list">No current archive votes.</div>';
    els.tabVotes.innerHTML = items.map(v => `
        <div class="event-card">
            <div class="event-head"><div class="event-title">${escHtml(v.faculty_name || 'Faculty ' + v.faculty_id)}</div><div class="event-time">${formatTime(v.updated_at)}</div></div>
            <div class="event-sub">${badge(v.vote_type, v.vote_type === 'up' ? 'green' : 'red')} · Faculty ID ${escHtml(v.faculty_id)}</div>
        </div>
    `).join('');
}

function renderTimeline(items) {
    if (!items.length) return els.tabTimeline.innerHTML = '<div class="empty-list">No raw events in this range.</div>';
    els.tabTimeline.innerHTML = items.map(e => `
        <div class="event-card">
            <div class="event-head"><div class="event-title">${escHtml(e.event_type || 'event')}</div><div class="event-time">${formatTime(e.created_at)}</div></div>
            <div class="event-sub">Target: ${escHtml(e.target_type || '—')} ${e.target_id ? '· ID ' + escHtml(e.target_id) : ''} ${e.event_label ? '· ' + escHtml(e.event_label) : ''}</div>
            <div class="event-meta">${escHtml(JSON.stringify(e.metadata || {}, null, 2))}</div>
        </div>
    `).join('');
}

async function markFeedbackRead(id, isRead) {
    try {
        const { error } = await _supabase.rpc('admin_mark_feedback_read', { p_feedback_id: id, p_is_read: isRead });
        if (error) throw error;
        showToast(isRead ? 'Marked read' : 'Marked unread');
        await loadDashboard();
    } catch (err) {
        console.error(err);
        showToast('Could not update feedback');
    }
}
window.markFeedbackRead = markFeedbackRead;

async function archiveFeedback(id, isArchived) {
    try {
        const { error } = await _supabase.rpc('admin_archive_feedback', { p_feedback_id: id, p_is_archived: isArchived });
        if (error) throw error;
        showToast(isArchived ? 'Archived' : 'Unarchived');
        await loadDashboard();
    } catch (err) {
        console.error(err);
        showToast('Could not archive feedback');
    }
}
window.archiveFeedback = archiveFeedback;

async function copyText(value) {
    if (!value) return showToast('Nothing to copy');
    try {
        await navigator.clipboard.writeText(String(value));
        showToast('Copied');
    } catch {
        showToast('Copy failed');
    }
}
window.copyText = copyText;

function activateTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-body').forEach(b => b.classList.remove('active'));
    $(`tab-${tab}`)?.classList.add('active');
}

function jumpTo(target) {
    const map = {
        users: 'usersSection', demand: 'demandPanel', reports: 'reportPanel', reviews: 'reviewsPanel'
    };
    document.getElementById(map[target] || 'usersSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exportCurrentJson() {
    const payload = selectedUserPayload || { dashboard: dashboardPayload, reports: reportsPayload };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedUserPayload ? `bracu-user-${selectedUsername}.json` : `bracu-dashboard-${todayBD()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function getAuraRank(xp) {
    const n = Number(xp || 0);
    let current = AURA_RANKS[0];
    for (const rank of AURA_RANKS) {
        if (n >= rank.xp) current = rank;
    }
    return current;
}

function labelize(value) {
    return String(value || 'other').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
}

function badgeClassForFeedback(type) {
    if (type === 'bug' || type === 'wrong_info') return 'red';
    if (type === 'missing_faculty') return 'yellow';
    if (type === 'idea') return 'blue';
    return '';
}

function badge(text, cls = '') {
    return `<span class="badge ${cls}">${escHtml(text)}</span>`;
}

function num(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function numRaw(value) {
    return Number(value || 0);
}

function timeVal(value) {
    if (!value) return 0;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? 0 : t;
}

function avgRating(a, b, c) {
    const nums = [a, b, c].map(Number).filter(n => !Number.isNaN(n));
    if (!nums.length) return 'N/A';
    return (nums.reduce((x, y) => x + y, 0) / nums.length).toFixed(1);
}

function todayBD() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit'
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
    return { start: toDateInputValue(monday), end: toDateInputValue(sunday) };
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
        timeZone: 'Asia/Dhaka', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
}

function escHtml(value) {
    if (value == null) return '';
    const div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
}

function escAttr(value) {
    return escHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let toastTimer;
function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2400);
}
