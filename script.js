/* ════════════════════════════════════════════════
   BRACU FACULTY REVIEWS — script.js
   ════════════════════════════════════════════════ */

// ── 1. SUPABASE CONFIG ──
const supabaseUrl = 'https://mbmgmqignuqgixsabkwv.supabase.co';
const supabaseKey = 'sb_publishable_sUnVlxyJ0hNbb6qn6KJDwg_PVpp_39b';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// ── 2. AUTH STATE ──
let currentUser = null;

// ── 3. HANDLE AUTH ──
async function handleAuth() {
    const overlay = document.getElementById('authOverlay');
    const input   = document.getElementById('authPrefixInput');
    const hint    = document.getElementById('authHint');
    const btn     = document.getElementById('authSubmitBtn');
    const preview = document.getElementById('authPreview');
    const wrap    = document.getElementById('authInputWrap');

    if (!overlay || !input || !hint || !btn) {
        console.warn('Auth elements missing. Check index.html auth card IDs.');
        return;
    }

    const saved = localStorage.getItem('bracu_user');

    if (saved) {
        try {
            const parsed = JSON.parse(saved);

            if (parsed.username && parsed.full_email) {
                currentUser = parsed;

                await upsertProfile(parsed.username, parsed.full_email);

                overlay.classList.add('hidden');
                return;
            }
        } catch (_) {
            localStorage.removeItem('bracu_user');
        }
    }

    overlay.classList.remove('hidden');

    setTimeout(() => input.focus(), 120);

    function renderAuthFeedback(forceError = false) {
        const raw = input.value;
        const prefix = normalizeAuthPrefix(raw);

        if (raw !== prefix) {
            input.value = prefix;
        }

        const result = validateBracuPrefix(prefix, { force: forceError });

        wrap?.classList.remove('is-valid', 'is-invalid');

        if (preview) {
            preview.classList.remove('is-valid', 'is-invalid');
        }

        hint.textContent = '';
        hint.className = 'auth-hint';

        if (!prefix) {
            if (preview) preview.innerHTML = '';
            return result;
        }

        if (preview) {
            preview.innerHTML =
                'Continuing as <strong>' +
                escHtml(prefix + '@g.bracu.ac.bd') +
                '</strong>';
        }

        if (result.status === 'valid') {
            wrap?.classList.add('is-valid');
            preview?.classList.add('is-valid');
            return result;
        }

        if (result.status === 'invalid') {
            wrap?.classList.add('is-invalid');
            preview?.classList.add('is-invalid');

            if (forceError) {
                hint.textContent = result.message;
            }

            return result;
        }

        return result;
    }

    input.addEventListener('input', () => {
        renderAuthFeedback(false);
    });

    async function doLogin() {
        const prefix = normalizeAuthPrefix(input.value);

        input.value = prefix;

        const result = validateBracuPrefix(prefix, { force: true });

        renderAuthFeedback(true);

        if (!result.ok) return;

        const full_email = prefix + '@g.bracu.ac.bd';
        const username   = prefix;

        btn.disabled = true;
        btn.textContent = 'Signing in…';

        try {
            await upsertProfile(username, full_email);

            currentUser = { username, full_email };

            localStorage.setItem('bracu_user', JSON.stringify(currentUser));
            localStorage.setItem('bracu_user_email', full_email);

            const isNew = !(await checkIsReturning(username));

            overlay.classList.add('hidden');

            setTimeout(() => {
                showToast(
                    isNew
                        ? 'Welcome, ' + username + '! 👋'
                        : 'Welcome back, ' + username + '!',
                    'success'
                );
            }, 350);

        } catch (err) {
            console.error('auth error:', err);

            hint.textContent = 'Something went wrong. Try again.';
            hint.className = 'auth-hint';

            wrap?.classList.add('is-invalid');
            preview?.classList.add('is-invalid');

            btn.disabled = false;
            btn.textContent = 'Continue';
        }
    }

    btn.addEventListener('click', doLogin);

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            doLogin();
        }
    });
}

function normalizeAuthPrefix(value) {
    let prefix = String(value || '').trim().toLowerCase();

    prefix = prefix.replace(/^mailto:/i, '');
    prefix = prefix.replace(/@g\.bracu\.ac\.bd$/i, '');

    return prefix;
}

function validateBracuPrefix(prefix, options = {}) {
    const p = normalizeAuthPrefix(prefix);
    const force = !!options.force;

    function result(ok, status, message = '') {
        return { ok, status, message };
    }

    if (!p) {
        return result(false, force ? 'invalid' : 'neutral', 'Enter your student email prefix.');
    }

    if (p.includes('@')) {
        return result(false, 'invalid', 'Use only the part before @g.bracu.ac.bd.');
    }

    if (/\s/.test(p)) {
        return result(false, 'invalid', 'Use your email prefix, not a full name.');
    }

    if (!/^[a-z0-9._-]+$/.test(p)) {
        return result(false, 'invalid', 'Use only valid email-prefix characters.');
    }

    // Allow short real names like ali, abby, meme.
    // Only 1–2 characters are too short.
    if (p.length < 3) {
        return result(false, force ? 'invalid' : 'neutral', 'Enter a valid student email prefix.');
    }

    if (p.length > 45) {
        return result(false, 'invalid', 'This prefix looks too long.');
    }

    if (/^\d+$/.test(p)) {
        return result(false, 'invalid', 'This does not look like a student email prefix.');
    }

    // Blocks course codes: cse220, cse110, mat120, bus101, phy111, eng101, etc.
    if (/^[a-z]{2,5}\d{2,4}$/i.test(p)) {
        return result(false, 'invalid', 'This looks like a course code, not an email prefix.');
    }

    if (p.startsWith('.') || p.endsWith('.') || p.includes('..')) {
        return result(false, 'invalid', 'Check the prefix format.');
    }

    if (p.startsWith('-') || p.endsWith('-') || p.startsWith('_') || p.endsWith('_')) {
        return result(false, 'invalid', 'Check the prefix format.');
    }

    const alphaOnly = p.replace(/[^a-z]/g, '');
    const digitOnly = p.replace(/[^0-9]/g, '');

    if (alphaOnly.length < 3) {
        return result(false, force ? 'invalid' : 'neutral', 'Enter a valid student email prefix.');
    }

    if (digitOnly.length > alphaOnly.length) {
        return result(false, 'invalid', 'This does not look like a student email prefix.');
    }

    // Reject obvious repeated spam: aaa, kkk, llll, etc.
    // But allows real names like abby, meme, mueen.
    if (/([a-z])\1\1/i.test(alphaOnly)) {
        return result(false, 'invalid', 'This does not look like a valid student email prefix.');
    }

    const blockedKeyboardPatterns = [
        'asdf', 'qwer', 'qwerty', 'zxcv', 'hjkl', 'jkl',
        'abcd', 'abcde', 'abcdef', 'xyz', 'wxyz',
        'kkkk', 'llll', 'mmmm', 'nnnn', 'aaaa', 'bbbb', 'cccc',
        'hsh', 'kkh', 'kkkl', 'klmn', 'lmno', 'mnop',
        'test', 'demo', 'admin', 'user', 'guest', 'student'
    ];

    if (blockedKeyboardPatterns.some(pattern => p.includes(pattern))) {
        return result(false, 'invalid', 'This does not look like a valid student email prefix.');
    }

    // Keyboard sequence check only for longer inputs.
    // Short real names should not be punished.
    if (alphaOnly.length >= 5) {
        const keyboardRows = [
            'qwertyuiop',
            'asdfghjkl',
            'zxcvbnm',
            'abcdefghijklmnopqrstuvwxyz'
        ];

        for (const row of keyboardRows) {
            for (let i = 0; i <= row.length - 4; i++) {
                const seq = row.slice(i, i + 4);
                const rev = seq.split('').reverse().join('');

                if (p.includes(seq) || p.includes(rev)) {
                    return result(false, 'invalid', 'This does not look like a valid student email prefix.');
                }
            }
        }
    }

    const parts = p.split(/[._-]+/).filter(Boolean);

    if (!parts.length) {
        return result(false, 'invalid', 'Enter a valid student email prefix.');
    }

    // Suspicious random-text check only for longer chunks.
    // This avoids rejecting short real names like abby, meme, eva, ari.
    const hasSuspiciousLongPart = parts.some(part => {
        const letters = part.replace(/[^a-z]/g, '');

        if (!letters) return false;

        // Long consonant blocks like klmnj, qwrty, hshkk.
        if (letters.length >= 5 && !/[aeiou]/i.test(letters)) {
            return true;
        }

        // Very low vowel ratio only for longer text.
        if (letters.length >= 7) {
            const vowels = (letters.match(/[aeiou]/gi) || []).length;
            const vowelRatio = vowels / letters.length;

            if (vowelRatio < 0.18) return true;
        }

        return false;
    });

    if (hasSuspiciousLongPart) {
        return result(false, 'invalid', 'This does not look like a valid student email prefix.');
    }

    // Vowel-count check only for longer inputs.
    // Short names can have one vowel and still be real.
    const vowelCount = (alphaOnly.match(/[aeiou]/gi) || []).length;

    if (alphaOnly.length >= 7 && vowelCount < 2) {
        return result(false, 'invalid', 'This does not look like a valid student email prefix.');
    }

    return result(true, 'valid', '');
}

// ── 4. AUTH DB HELPERS ──
async function checkIsReturning(username) {
    try {
        const { data } = await _supabase
            .from('student_profiles')
            .select('total_visits')
            .eq('username', username)
            .maybeSingle();

        return data && data.total_visits > 1;
    } catch {
        return false;
    }
}

async function upsertProfile(username, full_email) {
    await _supabase.rpc('upsert_student_profile', {
        p_username: username,
        p_full_email: full_email
    });
}

// ── 5. ACTIVITY LOGGER ──
async function logActivity(type, detail = {}) {
    if (!currentUser || !currentUser.username) return;

    try {
        let eventType = type;
        let targetType = detail.target_type || 'site';
        let targetId = detail.target_id != null ? String(detail.target_id) : null;
        let eventLabel = detail.event_label || null;
        let metadata = detail.metadata || {};

        if (type === 'search') {
            eventType = 'search';
            targetType = detail.query_type || 'unknown';
            targetId = detail.query != null ? String(detail.query) : null;
            eventLabel = detail.query != null ? String(detail.query) : null;
            metadata = { matched: !!detail.matched };
        }

        if (type === 'faculty_open') {
            eventType = 'faculty_open';
            targetType = 'faculty';
            targetId = detail.faculty_id != null ? String(detail.faculty_id) : null;
            eventLabel = detail.faculty_name || detail.event_label || null;
            metadata = detail.metadata || {};
        }

        if (type === 'review_create' || type === 'review_update') {
            eventType = type;
            targetType = 'faculty';
            targetId = detail.faculty_id != null ? String(detail.faculty_id) : null;
            eventLabel = detail.faculty_name || detail.event_label || null;
            metadata = { course_code: detail.course_code || null };
        }

        await _supabase.rpc('record_user_activity', {
            p_username: currentUser.username,
            p_event_type: eventType,
            p_target_type: targetType,
            p_target_id: targetId,
            p_event_label: eventLabel,
            p_metadata: metadata
        });

    } catch (err) {
        console.warn('logActivity error:', err);
    }
}

async function logSearch(query, type, matched) {
    await logActivity('search', {
        query,
        query_type: type,
        matched
    });
}

// ── 6. DOM REFS ──
const searchForm        = document.getElementById('searchForm');
const searchInput       = document.getElementById('searchInput');
const searchButton      = document.getElementById('searchButton');
const courseRatingArea  = document.getElementById('courseRatingArea');
const facultyReviewArea = document.getElementById('facultyReviewArea');
const toastEl           = document.getElementById('toast');

const supportBackdrop   = document.getElementById('supportBackdrop');
const supportCloseBtn   = document.getElementById('supportCloseBtn');
const copyNumberBtn     = document.getElementById('copyNumberBtn');

const reviewBackdrop    = document.getElementById('reviewBackdrop');
const emailLoginStep    = document.getElementById('emailLoginStep');
const reviewFormStep    = document.getElementById('reviewFormStep');
const reviewCloseBtn1   = document.getElementById('reviewCloseBtn1');
const reviewCloseBtn2   = document.getElementById('reviewCloseBtn2');
const emailContinueBtn  = document.getElementById('emailContinueBtn');
const reviewEmailInput  = document.getElementById('reviewEmailInput');

const teachingSlider    = document.getElementById('teachingSlider');
const markingSlider     = document.getElementById('markingSlider');
const behaviorSlider    = document.getElementById('behaviorSlider');

const teachingValue     = document.getElementById('teachingValue');
const markingValue      = document.getElementById('markingValue');
const behaviorValue     = document.getElementById('behaviorValue');

const reviewFeedback    = document.getElementById('reviewFeedback');
const charCounter       = document.getElementById('charCounter');
const submitReviewBtn   = document.getElementById('submitReviewBtn');
const reviewFacultyName = document.getElementById('reviewFacultyName');
const reviewCourseCode  = document.getElementById('reviewCourseCode');

let currentCourseCode       = null;
let currentFacultyForReview = null;
let currentReviewOffset     = 0;
let currentDisplayedFaculty = null;

// ── 7. TYPEWRITER ──
const typewriterEl = document.getElementById('typewriterText');
const HEADLINE = 'Find your faculty.';
let charIdx = 0;

(function typeLoop() {
    if (!typewriterEl) return;

    if (charIdx <= HEADLINE.length) {
        typewriterEl.innerHTML =
            HEADLINE.substring(0, charIdx) +
            '<span class="cursor-blink"></span>';

        charIdx++;

        setTimeout(typeLoop, charIdx === 1 ? 400 : 55);
    }
})();

// ── 8. RATING HELPERS ──
function getScoreClass(score) {
    const s = parseFloat(score);

    if (isNaN(s)) return '';
    if (s >= 8) return 'c-green';
    if (s >= 6.5) return 'c-yellow';
    if (s >= 5) return 'c-orange';

    return 'c-red';
}

function getReviewAccentColor(avg) {
    if (avg >= 8) return 'var(--green)';
    if (avg >= 6.5) return 'var(--yellow)';
    if (avg >= 5) return 'var(--orange)';

    return 'var(--red)';
}

function getVerdictInfo(teaching, marking, behavior) {
    const scores = [teaching, marking, behavior]
        .map(s => parseFloat(s))
        .filter(s => !isNaN(s) && s > 0);

    if (!scores.length) return null;

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    if (avg >= 8) {
        return { label: 'Highly Recommended', cls: 'verdict--green' };
    }

    if (avg >= 6.5) {
        return { label: 'Generally Positive', cls: 'verdict--yellow' };
    }

    if (avg >= 5) {
        return { label: 'Mixed Reviews', cls: 'verdict--orange' };
    }

    return { label: 'Proceed with Caution', cls: 'verdict--red' };
}

// ── 9. DATA LOADING ──
let allFaculty = [];
let fuse = null;

async function loadFacultyData() {
    try {
        const { data, error } = await _supabase
            .from('faculty_reviews')
            .select('*');

        if (error) throw error;

        allFaculty = data || [];

        const searchable = allFaculty.map(f => {
            if (!f.faculty_reviews) {
                return {
                    ...f,
                    fullName: '',
                    initial: '',
                    courses: ''
                };
            }

            const parts = f.faculty_reviews.split('|');

            return {
                ...f,
                fullName: parts[0]?.trim() || '',
                initial:  parts[1]?.trim() || '',
                courses:  parts[3]?.trim() || ''
            };
        });

        fuse = new Fuse(searchable, {
            keys: [
                { name: 'fullName', weight: 0.6 },
                { name: 'initial', weight: 0.3 },
                { name: 'faculty_name', weight: 0.1 }
            ],
            threshold: 0.4,
            ignoreLocation: true,
            minMatchCharLength: 2,
            includeScore: true
        });

        checkUrlParams();

    } catch (err) {
        console.error('loadFacultyData:', err);
    }
}

// ── 10. INIT ──
(async function init() {
    await handleAuth();
    loadFacultyData();
})();

// ── 11. AUTOCOMPLETE ──
const acDropdown = document.getElementById('suggestions-dropdown');
let debounceTimer = null;

searchInput?.addEventListener('input', e => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => showSuggestions(e.target.value.trim()), 200);
});

document.addEventListener('click', e => {
    if (!searchInput?.contains(e.target) && !acDropdown?.contains(e.target)) {
        hideAC();
    }
});

searchInput?.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideAC();
});

searchForm?.addEventListener('submit', () => hideAC(), true);

function showSuggestions(query) {
    if (!query || query.length < 2) {
        hideAC();
        return;
    }

    const coursePattern = /^[A-Z]{3,4}\s?\d{1,3}$/i;

    if (/\d/.test(query) && coursePattern.test(query)) {
        showCourseAC(query.toUpperCase().replace(/\s/g, ''));
    } else {
        showFacultyAC(query);
    }
}

function showCourseAC(query) {
    const codes = new Set();

    allFaculty.forEach(f => {
        if (!f.faculty_reviews) return;

        const courses = f.faculty_reviews.split('|')[3]?.trim() || '';

        courses.split(',').forEach(c => {
            const t = c.trim();

            if (t) codes.add(t);
        });
    });

    const matches = [...codes]
        .filter(c => c.startsWith(query))
        .sort()
        .slice(0, 5);

    if (!matches.length) {
        hideAC();
        return;
    }

    renderAC(matches.map(c => ({
        label: c,
        badge: 'COURSE',
        onClick: () => {
            searchInput.value = c;
            hideAC();
            searchForm.dispatchEvent(new Event('submit'));
        }
    })));
}

function showFacultyAC(query) {
    if (!fuse) return;

    const exact = allFaculty.filter(f =>
        (f.initial || '').toLowerCase() === query.toLowerCase()
    );

    const results = fuse.search(query.toLowerCase());
    const map = new Map();

    exact.forEach(f => {
        map.set(f.id, {
            item: {
                ...f,
                fullName: f.faculty_reviews?.split('|')[0]?.trim() || ''
            },
            score: 0
        });
    });

    results.forEach(r => {
        if (!map.has(r.item.id) && r.score < 0.5) {
            map.set(r.item.id, r);
        }
    });

    const final = [...map.values()].slice(0, 5);

    if (!final.length) {
        hideAC();
        return;
    }

    renderAC(final.map(r => {
        const name = r.item.fullName || r.item.faculty_name || 'Unknown';
        const init = r.item.initial || '';

        return {
            label: name,
            badge: init,
            onClick: () => {
                searchInput.value = name;
                hideAC();
                searchForm.dispatchEvent(new Event('submit'));
            }
        };
    }));
}

function renderAC(items) {
    if (!acDropdown) return;

    acDropdown.innerHTML = items.map((item, i) => `
        <div class="ac-item" data-idx="${i}">
            <span class="ac-name">${escHtml(item.label)}</span>
            ${item.badge ? `<span class="ac-badge">${escHtml(item.badge)}</span>` : ''}
        </div>
    `).join('');

    acDropdown.querySelectorAll('.ac-item').forEach((el, i) => {
        el.addEventListener('click', e => {
            e.preventDefault();
            items[i].onClick();
        });
    });

    acDropdown.style.display = 'block';
}

function hideAC() {
    if (!acDropdown) return;

    acDropdown.style.display = 'none';
    acDropdown.innerHTML = '';
}

// ── 12. SEARCH FORM ──
searchForm?.addEventListener('submit', async e => {
    e.preventDefault();

    hideAC();

    const raw = searchInput.value.trim();

    if (!raw) return;

    searchButton.disabled = true;
    searchButton.classList.add('loading');

    try {
        const coursePattern = /^[A-Z]{3,4}\s?\d{3}$/i;

        if (coursePattern.test(raw)) {
            await handleCourseSearch(raw.toUpperCase().replace(/\s/g, ''));
        } else {
            await handleFacultySearch(raw);
        }

    } catch (err) {
        console.error(err);

        showResult(courseRatingArea, `
            <div class="card slide-up">
                <div class="card-body">
                    <div class="empty-state">
                        <span class="empty-icon">⚠️</span>
                        <p class="empty-title">Something went wrong</p>
                        <p class="empty-desc">Please try again in a moment.</p>
                    </div>
                </div>
            </div>
        `);

        facultyReviewArea.style.display = 'none';

    } finally {
        searchButton.disabled = false;
        searchButton.classList.remove('loading');
    }
});

// ── 13. COURSE SEARCH ──
async function handleCourseSearch(code) {
    currentCourseCode = code;

    const matching = allFaculty.filter(f => {
        if (!f.faculty_reviews) return false;

        const courses = f.faculty_reviews.split('|')[3]?.trim() || '';

        return courses
            .split(',')
            .map(c => c.trim())
            .includes(code);
    });

    await logSearch(code, 'course', matching.length > 0);

    if (!matching.length) {
        showResult(courseRatingArea, `
            <div class="card slide-up">
                <div class="card-body">
                    <div class="empty-state">
                        <span class="empty-icon">🔍</span>
                        <p class="empty-title">No faculty found for ${escHtml(code)}</p>
                        <p class="empty-desc">This course may not be in our database yet. Drop the name in the Facebook comments or hit Feedback.</p>
                    </div>
                </div>
            </div>
        `);

        facultyReviewArea.style.display = 'none';
        return;
    }

    const rows = matching.map(f => {
        const p = f.faculty_reviews.split('|');

        const name = p[0]?.trim() || 'Unknown';
        const init = p[1]?.trim() || '';

        const t = parseFloat(p[4]) || 0;
        const m = parseFloat(p[5]) || 0;
        const b = parseFloat(p[6]) || 0;

        const avg = ((t + m + b) / 3) / 10 * 100;

        return {
            name,
            init,
            avg: avg.toFixed(1),
            rawData: f
        };
    }).sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg));

    const rowsHTML = rows.map(r => `
        <div class="faculty-row" onclick="window.searchFaculty('${escHtml(r.name).replace(/'/g, "\\'")}')">
            <div class="faculty-col">
                <div class="faculty-row-head">
                    <span class="faculty-row-name">${escHtml(r.name)}</span>
                    ${r.init ? `<span class="faculty-row-badge">${escHtml(r.init)}</span>` : ''}
                </div>
                <div class="bar-track">
                    <div class="bar-fill" data-w="${r.avg}" style="width:0%"></div>
                </div>
            </div>
        </div>
    `).join('');

    showResult(courseRatingArea, `
        <div class="card slide-up">
            <div class="card-head">
                <h2 class="leaderboard-title">Faculty teaching ${escHtml(code)}</h2>
            </div>
            <div>${rowsHTML}</div>
            <div class="card-foot">
                <span class="foot-copy">Sorted by avg score · Tap to view full review</span>
            </div>
        </div>
    `);

    facultyReviewArea.style.display = 'none';

  // Animate leaderboard bars
setTimeout(() => {
    document.querySelectorAll('.bar-fill').forEach((bar, i) => {
        setTimeout(() => {
            const w = bar.getAttribute('data-w') || 0;
            bar.style.width = `${w}%`;
        }, i * 80);
    });
}, 60);
}

window.searchFaculty = name => {
    const matchedFaculty = allFaculty.find(f => {
        const fullName = f.faculty_reviews?.split('|')[0]?.trim() || f.faculty_name || '';
        return fullName.toLowerCase() === String(name).toLowerCase();
    });

    logActivity('faculty_open', {
        faculty_id: matchedFaculty?.id || null,
        faculty_name: name,
        event_label: name
    });

    handleFacultySearch(name, true);
};

// ── 14. FACULTY SEARCH ──
async function handleFacultySearch(input, keepLeaderboard = false) {
    let faculty = null;

    const len = input.length;
    const threshold = len <= 6 ? 0.15 : 0.45;

    if (fuse && allFaculty.length) {
        const results = fuse.search(input);

        if (results.length && results[0].score < threshold) {
            faculty = results[0].item;
        }
    }

    if (!faculty) {
        const { data, error } = await _supabase
            .from('faculty_reviews')
            .select('*')
            .ilike('faculty_name', `%${input}%`)
            .limit(1)
            .maybeSingle();

        if (data && !error) faculty = data;
    }

    await logSearch(input, 'faculty', faculty !== null);

    if (!faculty) {
        if (!keepLeaderboard) {
            showResult(courseRatingArea, `
                <div class="card slide-up">
                    <div class="card-body">
                        <div class="empty-state">
                            <span class="empty-icon">💔🥀</span>
                            <p class="empty-title">"${escHtml(input)}" isn't listed yet.</p>
                            <p class="empty-desc">Please send me the faculty name through the Feedback button. I’m adding entries one by one 😭 so it may take a little time — stay tuned.</p>
                        </div>
                    </div>
                </div>
            `);

            facultyReviewArea.style.display = 'none';
        }

        return;
    }

    await displayFaculty(faculty, keepLeaderboard);
}

// ── 15. VOTE SYSTEM ──

async function loadVoteCounts(facultyId) {
    try {
        const { data, error } = await _supabase.rpc('get_faculty_vote_counts', {
            p_faculty_id: facultyId
        });

        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : data;

        return {
            upvotes: Number(row?.upvotes || 0),
            downvotes: Number(row?.downvotes || 0)
        };

    } catch (err) {
        console.warn('loadVoteCounts error:', err);

        return {
            upvotes: 0,
            downvotes: 0
        };
    }
}

function applyVoteCountsToUI(facultyId, counts) {
    const upCountEl = document.getElementById(`vote-up-count-${facultyId}`);
    const downCountEl = document.getElementById(`vote-down-count-${facultyId}`);

    if (upCountEl) upCountEl.textContent = counts.upvotes;
    if (downCountEl) downCountEl.textContent = counts.downvotes;
}

async function getCurrentUserVote(facultyId) {
    if (!currentUser || !currentUser.username) {
        return localStorage.getItem(`vote_${facultyId}`);
    }

    try {
        const { data, error } = await _supabase
            .from('user_vote_state')
            .select('vote_type')
            .eq('username', currentUser.username)
            .eq('faculty_id', facultyId)
            .maybeSingle();

        if (error) throw error;

        if (!data || data.vote_type === 'none') {
            localStorage.removeItem(`vote_${facultyId}`);
            return null;
        }

        localStorage.setItem(`vote_${facultyId}`, data.vote_type);

        return data.vote_type;

    } catch (err) {
        console.warn('getCurrentUserVote fallback:', err);
        return localStorage.getItem(`vote_${facultyId}`);
    }
}

async function handleVote(id, type) {
    const key = `vote_${id}`;

    const current = await getCurrentUserVote(id);

    const upEl   = document.querySelector(`#vote-up-${id}`);
    const downEl = document.querySelector(`#vote-down-${id}`);

    let next = null;

    if (type === 'up') {
        if (current === 'up') {
            next = null;
            upEl?.classList.remove('active');
        } else {
            next = 'up';
            downEl?.classList.remove('active');
            upEl?.classList.add('active');
        }
    } else {
        if (current === 'down') {
            next = null;
            downEl?.classList.remove('active');
        } else {
            next = 'down';
            upEl?.classList.remove('active');
            downEl?.classList.add('active');
        }
    }

    if (next) {
        localStorage.setItem(key, next);
    } else {
        localStorage.removeItem(key);
    }

    try {
        if (currentUser && currentUser.username) {
            const { error } = await _supabase.rpc('set_user_vote_state', {
                p_username: currentUser.username,
                p_faculty_id: id,
                p_vote_type: next || 'none'
            });

            if (error) throw error;
        }

        const counts = await loadVoteCounts(id);
        applyVoteCountsToUI(id, counts);

    } catch (err) {
        console.error('handleVote error:', err);

        showToast('Vote failed. Try again.', 'error');

        upEl?.classList.remove('active');
        downEl?.classList.remove('active');

        if (current === 'up') {
            upEl?.classList.add('active');
            localStorage.setItem(key, 'up');
        } else if (current === 'down') {
            downEl?.classList.add('active');
            localStorage.setItem(key, 'down');
        } else {
            localStorage.removeItem(key);
        }
    }
}

async function initVotePill(id) {
    const upEl   = document.querySelector(`#vote-up-${id}`);
    const downEl = document.querySelector(`#vote-down-${id}`);

    upEl?.classList.remove('active');
    downEl?.classList.remove('active');

    const saved = await getCurrentUserVote(id);

    if (saved === 'up') {
        upEl?.classList.add('active');
    }

    if (saved === 'down') {
        downEl?.classList.add('active');
    }
}

window.handleVote = handleVote;

// ── 16. DISPLAY FACULTY ──
async function displayFaculty(faculty, keepLeaderboard = false) {
    currentDisplayedFaculty = faculty;
    currentReviewOffset = 0;

    const parts    = (faculty.faculty_reviews || '').split('|');
    const fullName = parts[0]?.trim() || 'Unknown Faculty';
    const initial  = parts[1]?.trim() || '';
    const email    = parts[2]?.trim() || '';
    const courses  = parts[3]?.trim() || '';
    const teaching = parts[4]?.trim() || 'N/A';
    const marking  = parts[5]?.trim() || 'N/A';
    const behavior = parts[6]?.trim() || 'N/A';
    const summary  = parts[7]?.trim() || 'No overall review available.';
    const insights = parts[8]?.trim() || '';

    const courseArr = courses
        ? courses.split(',').map(c => c.trim()).filter(Boolean)
        : [];

    const verdict = getVerdictInfo(teaching, marking, behavior);

    const { reviews, total, hasMore } = await loadReviews(faculty.id, 5, 0);
    
    const voteCounts = await loadVoteCounts(faculty.id);

    const courseTags = courseArr.map(c =>
        `<span class="course-tag" onclick="searchCourse('${escHtml(c)}')">${escHtml(c)}</span>`
    ).join('');

    const verdictHTML = verdict
        ? `<div class="verdict-badge ${verdict.cls}">${escHtml(verdict.label)}</div>`
        : '';

    const reviewsHTML = (reviews.length || total)
        ? buildReviewsHTML(faculty.id, reviews, total, hasMore)
        : '';

    const html = `
        <div class="card slide-up">
            <div class="card-head">
                ${verdictHTML}
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
                    <h2 class="faculty-name">
                        ${escHtml(fullName)}
                        ${initial ? `<span class="faculty-initial">${escHtml(initial)}</span>` : ''}
                    </h2>
                </div>

                ${email ? `<a class="faculty-email" href="mailto:${escHtml(email)}">${escHtml(email)}</a>` : ''}

                ${courseArr.length ? `<div class="course-tags">${courseTags}</div>` : ''}
            </div>

            <div class="card-body">
                <div class="scores-row">
                    ${scoreBlock('Teaching', teaching)}
                    ${scoreBlock('Marking', marking)}
                    ${scoreBlock('Behavior', behavior)}
                </div>

                <div class="verdict-box">
                    <div class="verdict-box-label">Overall Review</div>
                    <p class="verdict-text">${escHtml(summary)}</p>
                </div>

                <div class="card-section-head">What Students Say</div>
                ${buildInsights(insights)}

                <div class="action-row">
<div class="vote-pill">
    <button class="vote-btn v-up" id="vote-up-${faculty.id}" onclick="handleVote(${faculty.id},'up')">
        <svg class="vote-arrow" viewBox="0 0 24 24">
            <path d="M12 4l-8 8h5v8h6v-8h5z"/>
        </svg>
        Agree
        <span class="vote-count-mini" id="vote-up-count-${faculty.id}">${voteCounts.upvotes}</span>
    </button>

    <div class="vote-divider"></div>

    <button class="vote-btn v-down" id="vote-down-${faculty.id}" onclick="handleVote(${faculty.id},'down')">
        Disagree
        <span class="vote-count-mini" id="vote-down-count-${faculty.id}">${voteCounts.downvotes}</span>
        <svg class="vote-arrow" viewBox="0 0 24 24">
            <path d="M12 20l8-8h-5V4H9v8H4z"/>
        </svg>
    </button>
</div>

                    <div class="action-btns">
                        <button class="pill-btn" onclick="openReviewModal(${faculty.id},'${escHtml(fullName).replace(/'/g, "\\'")}')">
                            + Review
                        </button>

                        <button class="pill-btn" onclick="handleShareLink(${faculty.id})">
                            Invite
                        </button>
                    </div>
                </div>

                ${reviewsHTML}
            </div>

            <div class="card-foot">
                <button class="foot-link foot-btn" onclick="toggleAbout()">Disclaimer</button>
                <button class="foot-link foot-btn" onclick="openSupportCard()">☕ Coffee</button>
            </div>
        </div>
    `;

    showResult(facultyReviewArea, html);

    if (!keepLeaderboard) {
        courseRatingArea.style.display = 'none';
    }

    setTimeout(() => {
        initVotePill(faculty.id);
        facultyReviewArea.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }, 80);
}

function scoreBlock(label, value) {
    const cls = getScoreClass(value);

    return `
        <div class="score-block">
            <span class="score-lbl">${label}</span>
            <span class="score-num ${cls}">${escHtml(value)}</span>
        </div>
    `;
}

function buildInsights(text) {
    if (!text) {
        return `
            <div class="insights-list">
                <div class="insight-item">
                    <span class="insight-text" style="color:var(--t3)">No student insights available yet.</span>
                </div>
            </div>
        `;
    }

    const sentences = text
        .split(/\.(?:\s+|\n+)|(?:\n+)/)
        .map(s => s.trim())
        .filter(s => s.length > 2);

    return `
        <div class="insights-list">
            ${sentences.map((s, i) => `
                <div class="insight-item">
                    <span class="insight-num">${String(i + 1).padStart(2, '0')}</span>
                    <span class="insight-text">${escHtml(s).replace(/(\d+%)/g, '<span class="highlight-pct">$1</span>')}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function buildReviewsHTML(facultyId, reviews, total, hasMore) {
    const cards = reviews.map(buildReviewCard).join('');

    const loadMore = hasMore
        ? `
            <button class="load-more-btn" onclick="loadMoreReviews(${facultyId})">
                Load more reviews · ${total - 5} remaining
            </button>
        `
        : '';

    return `
        <div class="reviews-section">
            <div class="reviews-header-row">
                <span class="reviews-title">Student Reviews</span>
                <span class="reviews-title">${total}</span>
            </div>

            <div id="reviews-container-${facultyId}">${cards}</div>

            <div id="load-more-wrap-${facultyId}">${loadMore}</div>
        </div>
    `;
}

function buildReviewCard(r) {
    const avg = (r.teaching_rating + r.marking_rating + r.behavior_rating) / 3;
    const accent = getReviewAccentColor(avg);

    return `
        <div class="review-card" style="--review-accent:${accent}">
            <div class="review-meta">
                <span>Anonymous</span>
                ${r.course_code ? `<span class="review-course-chip">${escHtml(r.course_code)}</span>` : ''}
                <span>·</span>
                <span>${timeAgo(r.created_at)}</span>
            </div>

            <div class="review-bars">
                ${reviewBar('Teaching', r.teaching_rating)}
                ${reviewBar('Marking', r.marking_rating)}
                ${reviewBar('Behavior', r.behavior_rating)}
            </div>

            <p class="review-text">"${escHtml(r.raw_feedback)}"</p>
        </div>
    `;
}

function reviewBar(label, val) {
    return `
        <div class="review-bar-item">
            <div class="review-bar-head">
                <span class="rbl">${label}</span>
                <span class="rbn">${parseFloat(val).toFixed(1)}</span>
            </div>

            <div class="prog-bar">
                <div class="prog-fill" style="width:${(val / 10) * 100}%"></div>
            </div>
        </div>
    `;
}

async function loadMoreReviews(facultyId) {
    currentReviewOffset += 5;

    const { reviews, total, hasMore } = await loadReviews(facultyId, 5, currentReviewOffset);

    const container = document.getElementById(`reviews-container-${facultyId}`);
    const wrap      = document.getElementById(`load-more-wrap-${facultyId}`);

    if (container && reviews.length) {
        container.insertAdjacentHTML(
            'beforeend',
            reviews.map(buildReviewCard).join('')
        );

        const remaining = total - (currentReviewOffset + 5);

        wrap.innerHTML = hasMore
            ? `<button class="load-more-btn" onclick="loadMoreReviews(${facultyId})">Load more · ${remaining} remaining</button>`
            : `<p style="text-align:center;font-size:12px;color:var(--t3);padding-top:12px;">All reviews loaded</p>`;
    }
}

window.loadMoreReviews = loadMoreReviews;

// ── 17. STUDENT REVIEWS DB ──
async function loadReviews(facultyId, limit = 5, offset = 0) {
    try {
        const { count } = await _supabase
            .from('student_reviews')
            .select('*', {
                count: 'exact',
                head: true
            })
            .eq('faculty_id', facultyId);

        const { data, error } = await _supabase
            .from('student_reviews')
            .select('*')
            .eq('faculty_id', facultyId)
            .order('created_at', {
                ascending: false
            })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        return {
            reviews: data || [],
            total: count || 0,
            hasMore: (offset + limit) < (count || 0)
        };

    } catch {
        return {
            reviews: [],
            total: 0,
            hasMore: false
        };
    }
}

// ── 18. REVIEW MODAL ──
function openReviewModal(facultyId, facultyName) {
    currentFacultyForReview = {
        id: facultyId,
        name: facultyName
    };

    const email = currentUser?.full_email || localStorage.getItem('bracu_user_email');

    if (email) {
        emailLoginStep.style.display = 'none';
        reviewFormStep.style.display = 'block';
        reviewFacultyName.textContent = facultyName;
        checkExistingReview(facultyId, email);
    } else {
        emailLoginStep.style.display = 'block';
        reviewFormStep.style.display = 'none';
        reviewEmailInput.value = '';
    }

    openSheet(reviewBackdrop);
}

function closeReviewModal() {
    closeSheet(reviewBackdrop);

    setTimeout(() => {
        emailLoginStep.style.display = 'block';
        reviewFormStep.style.display = 'none';
        reviewEmailInput.value = '';
        reviewCourseCode.value = '';

        [teachingSlider, markingSlider, behaviorSlider].forEach(s => {
            s.value = 5;
        });

        [teachingValue, markingValue, behaviorValue].forEach(v => {
            v.textContent = '5.0';
        });

        reviewFeedback.value = '';
        charCounter.textContent = '0 / 500';
        charCounter.className = 'char-count';
        submitReviewBtn.textContent = 'Submit Review';

        currentFacultyForReview = null;
    }, 350);
}

async function checkExistingReview(facultyId, email) {
    try {
        const { data } = await _supabase
            .from('student_reviews')
            .select('*')
            .eq('faculty_id', facultyId)
            .eq('student_email', email)
            .maybeSingle();

        if (data) {
            reviewCourseCode.value = data.course_code || '';

            teachingSlider.value = data.teaching_rating || 5;
            markingSlider.value  = data.marking_rating  || 5;
            behaviorSlider.value = data.behavior_rating || 5;

            teachingValue.textContent = (data.teaching_rating || 5).toFixed(1);
            markingValue.textContent  = (data.marking_rating  || 5).toFixed(1);
            behaviorValue.textContent = (data.behavior_rating || 5).toFixed(1);

            reviewFeedback.value = data.raw_feedback || '';

            updateCharCount(reviewFeedback.value.length);

            submitReviewBtn.textContent = 'Update Review';
        }

    } catch {
        // ignore
    }
}

emailContinueBtn?.addEventListener('click', async () => {
    const email = reviewEmailInput.value.trim();

    if (!email) {
        showToast('Please enter your email', 'error');
        return;
    }

    if (!/^[a-z0-9._%+-]+@g\.bracu\.ac\.bd$/i.test(email)) {
        showToast('Must be a @g.bracu.ac.bd email', 'error');
        return;
    }

    localStorage.setItem('bracu_user_email', email);

    emailLoginStep.style.display = 'none';
    reviewFormStep.style.display = 'block';
    reviewFacultyName.textContent = currentFacultyForReview?.name || 'Faculty';

    await checkExistingReview(currentFacultyForReview.id, email);
});

// Sliders
teachingSlider?.addEventListener('input', e => {
    teachingValue.textContent = parseFloat(e.target.value).toFixed(1);
});

markingSlider?.addEventListener('input', e => {
    markingValue.textContent = parseFloat(e.target.value).toFixed(1);
});

behaviorSlider?.addEventListener('input', e => {
    behaviorValue.textContent = parseFloat(e.target.value).toFixed(1);
});

// Char counter
reviewFeedback?.addEventListener('input', e => {
    updateCharCount(e.target.value.length);
});

function updateCharCount(len) {
    charCounter.textContent = `${len} / 500`;
    charCounter.className = 'char-count' + (len < 3 ? ' err' : len >= 3 ? ' ok' : '');
}

// Submit review
submitReviewBtn?.addEventListener('click', async () => {
    const email    = currentUser?.full_email || localStorage.getItem('bracu_user_email');
    const username = currentUser?.username || (email ? email.split('@')[0] : null);

    if (!email || !currentFacultyForReview) {
        showToast('Session expired', 'error');
        closeReviewModal();
        return;
    }

    const code     = reviewCourseCode.value.trim().toUpperCase() || null;
    const teaching = parseFloat(teachingSlider.value);
    const marking  = parseFloat(markingSlider.value);
    const behavior = parseFloat(behaviorSlider.value);
    const feedback = reviewFeedback.value.trim();

    if (feedback.length < 3) {
        showToast(`${3 - feedback.length} more characters needed`, 'error');
        return;
    }

    if (feedback.length > 500) {
        showToast('Too long (max 500 chars)', 'error');
        return;
    }

    submitReviewBtn.disabled = true;
    submitReviewBtn.textContent = 'Submitting…';

    try {
        const { data: existing, error: existingError } = await _supabase
            .from('student_reviews')
            .select('id')
            .eq('faculty_id', currentFacultyForReview.id)
            .eq('student_email', email)
            .maybeSingle();

        if (existingError) throw existingError;

        if (existing) {
            const { error } = await _supabase
                .from('student_reviews')
                .update({
                    course_code: code,
                    teaching_rating: teaching,
                    marking_rating: marking,
                    behavior_rating: behavior,
                    raw_feedback: feedback,
                    username: username,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id)
                .select();

            if (error) throw error;

            showToast('Review updated!', 'success');

            await logActivity('review_update', {
                faculty_id: currentFacultyForReview.id,
                faculty_name: currentFacultyForReview.name,
                course_code: code
            });

        } else {
            const { error } = await _supabase
                .from('student_reviews')
                .insert({
                    faculty_id: currentFacultyForReview.id,
                    student_email: email,
                    username: username,
                    course_code: code,
                    teaching_rating: teaching,
                    marking_rating: marking,
                    behavior_rating: behavior,
                    raw_feedback: feedback
                })
                .select();

            if (error) throw error;

            showToast('Review submitted!', 'success');

            await logActivity('review_create', {
                faculty_id: currentFacultyForReview.id,
                faculty_name: currentFacultyForReview.name,
                course_code: code
            });
        }

        const savedFacultyId = currentFacultyForReview.id;

        closeReviewModal();

        const f = allFaculty.find(x => x.id === savedFacultyId);

        if (f) {
            setTimeout(() => displayFaculty(f, true), 600);
        }

    } catch (err) {
        console.error('submitReview error:', err);
        showToast(err.message || 'Failed. Try again.', 'error');

    } finally {
        submitReviewBtn.disabled = false;
        submitReviewBtn.textContent = 'Submit Review';
    }
});

// Modal close listeners
reviewCloseBtn1?.addEventListener('click', closeReviewModal);
reviewCloseBtn2?.addEventListener('click', closeReviewModal);

reviewBackdrop?.addEventListener('click', e => {
    if (e.target === reviewBackdrop) closeReviewModal();
});

window.openReviewModal = openReviewModal;

// ── 19. SHARE LINK ──
async function handleShareLink(facultyId) {
    const url = `${location.origin}${location.pathname}?reviewFaculty=${facultyId}`;

    try {
        await navigator.clipboard.writeText(url);

        showToast('Link copied — share with classmates!', 'success');

        await logActivity('share_link', {
            target_type: 'faculty',
            target_id: facultyId,
            event_label: 'faculty_id ' + facultyId,
            metadata: { url }
        });

    } catch {
        showToast('Copy failed', 'error');
    }
}

window.handleShareLink = handleShareLink;

// ── 20. URL PARAMS ──
function checkUrlParams() {
    const id = new URLSearchParams(location.search).get('reviewFaculty');

    if (!id) return;

    const checkInterval = setInterval(() => {
        if (!allFaculty.length) return;

        clearInterval(checkInterval);

        const f = allFaculty.find(x => x.id === parseInt(id));

        if (f) {
            const name = f.faculty_reviews?.split('|')[0]?.trim() || 'Faculty';

            setTimeout(() => openReviewModal(f.id, name), 600);
        }
    }, 100);

    setTimeout(() => clearInterval(checkInterval), 6000);
}

// ── 21. COFFEE SUPPORT ──
function openSupportCard() {
    openSheet(supportBackdrop);
}

function closeSupportCard() {
    closeSheet(supportBackdrop);
}

supportCloseBtn?.addEventListener('click', closeSupportCard);

supportBackdrop?.addEventListener('click', e => {
    if (e.target === supportBackdrop) closeSupportCard();
});

copyNumberBtn?.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText('01908341690');

        copyNumberBtn.textContent = '✓ Copied!';

        setTimeout(() => {
            copyNumberBtn.textContent = 'Copy Number';
        }, 2200);

    } catch {
        showToast('Copy failed', 'error');
    }
});

window.openSupportCard  = openSupportCard;
window.closeSupportCard = closeSupportCard;

// ── 22. ABOUT/DISCLAIMER ──
function toggleAbout() {
    const area = document.getElementById('aboutArea');

    if (!area) return;

    if (area.style.display === 'none' || !area.style.display) {
        area.innerHTML = `
            <div class="card slide-up">
                <div class="card-head">
                    <h2 style="font-size:18px;font-weight:800;letter-spacing:-0.02em;color:var(--t1)">Disclaimer & Data Notice</h2>
                </div>

                <div class="card-body">
                    <div class="disclaimer-section">
                        <div class="disclaimer-heading">What is this?</div>
                        <p class="disclaimer-text">An independent tool to help BRACU students find patterns in thousands of faculty reviews from Facebook groups — saving you hours of scrolling.</p>
                    </div>

                    <div class="disclaimer-section">
                        <div class="disclaimer-heading">Methodology</div>
                        <div class="insights-list">
                            <div class="insight-item">
                                <span class="insight-num">01</span>
                                <span class="insight-text">12–20+ review posts tracked per faculty member</span>
                            </div>

                            <div class="insight-item">
                                <span class="insight-num">02</span>
                                <span class="insight-text">Hundreds of student comments analyzed per faculty</span>
                            </div>

                            <div class="insight-item">
                                <span class="insight-num">03</span>
                                <span class="insight-text">AI used to identify consistent patterns, not generate opinions</span>
                            </div>
                        </div>
                    </div>

                    <div class="disclaimer-section">
                        <div class="disclaimer-heading">Important</div>
                        <div class="insights-list">
                            <div class="insight-item">
                                <span class="insight-num">→</span>
                                <span class="insight-text">Not affiliated with BRACU or any department</span>
                            </div>

                            <div class="insight-item">
                                <span class="insight-num">→</span>
                                <span class="insight-text">These are peer experiences, not official evaluations</span>
                            </div>

                            <div class="insight-item">
                                <span class="insight-num">→</span>
                                <span class="insight-text">Contact via Feedback to report inaccuracies</span>
                            </div>
                        </div>
                    </div>

                    <div class="disclaimer-section">
                        <div class="disclaimer-heading">Status</div>
                        <p class="disclaimer-text">Currently covering CSE Department. Adding more faculty and departments in weekly waves — each entry requires deep research and manual verification.</p>
                    </div>
                </div>

                <div class="card-foot">
                    <button class="foot-link foot-btn" onclick="toggleAbout()">Close</button>
                    <button class="foot-link foot-btn" onclick="openSupportCard()">☕ Coffee</button>
                </div>
            </div>
        `;

        area.style.display = 'block';

        area.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });

    } else {
        area.style.display = 'none';
    }
}

window.toggleAbout = toggleAbout;

// ── 23. COURSE TAG CLICK ──
window.searchCourse = code => {
    searchInput.value = code;
    handleCourseSearch(code);
};

// ── 24. ESC KEY ──
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;

    closeSheet(supportBackdrop);
    closeSheet(reviewBackdrop);
    closeReviewModal();
});

// ── 25. UTILS ──
function showResult(el, html) {
    if (!el) return;

    el.innerHTML = html;
    el.style.display = 'block';

    el.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
}

function openSheet(backdrop) {
    if (!backdrop) return;

    backdrop.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeSheet(backdrop) {
    if (!backdrop) return;

    backdrop.classList.remove('show');
    document.body.style.overflow = '';
}

let toastTimer;

function showToast(msg, type = 'success') {
    if (!toastEl) return;

    toastEl.textContent = msg;
    toastEl.className = `toast ${type} show`;

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toastEl.classList.remove('show');
    }, 3800);
}

function timeAgo(ts) {
    const s = Math.floor((Date.now() - new Date(ts)) / 1000);

    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;

    return `${Math.floor(s / 2592000)}mo ago`;
}

function escHtml(str) {
    if (str == null) return '';

    const d = document.createElement('div');
    d.textContent = String(str);

    return d.innerHTML;
}
