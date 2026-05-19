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

    // Aura for exploration is silent: +5 once/day after a meaningful search,
    // then +1 per unique search, max +5/day. SQL enforces the anti-spam rules.
    awardAuraForSearch(query, type);
}

async function awardAuraForSearch(query, type) {
    if (!currentUser || !currentUser.username || !currentUser.full_email) return;
    try {
        const { data, error } = await _supabase.rpc('award_aura_for_search', {
            p_username: currentUser.username,
            p_full_email: currentUser.full_email,
            p_query: String(query || ''),
            p_query_type: String(type || 'faculty')
        });
        if (error) throw error;
        const total = Number(data?.total_awarded || 0);
        if (total > 0) refreshProfileChipOnly();
    } catch (err) {
        // Aura should never block search if the patch is not installed yet.
        console.warn('awardAuraForSearch:', err.message || err);
    }
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

/* ════════════════════════════════════════════════
   v0.2 COMMUNITY FACULTY LAYER
   Full additive layer. Old archive flow stays intact.
   ════════════════════════════════════════════════ */

var allCommunityFaculty = [];
var communityFuse = null;
var currentAddFacultyQuery = '';
var selectedDepartment = '';
var currentCommunityReviewTarget = null;
var selectedReviewTags = {};
var currentCommunityProfileForRefresh = null;

var COMMUNITY_REVIEW_TARGET_COUNT = 5;

var ADVISING_XP_LEVELS = [
    { level: 1, xp: 0, rank: 'Notun Scout', meaning: 'You started your private contribution trail.' },
    { level: 2, xp: 50, rank: 'Vanguard', meaning: 'You are becoming a regular map-builder.' },
    { level: 3, xp: 150, rank: 'Phoenix', meaning: 'Your activity is helping the archive become warmer and more useful.' },
    { level: 4, xp: 300, rank: 'Shikhor', meaning: 'Your reviews and searches are creating visible advising value.' },
    { level: 5, xp: 550, rank: 'Maharathi', meaning: 'Your profile is becoming a stronger trust trail.' },
    { level: 6, xp: 900, rank: 'Atlas', meaning: 'You are carrying more of the advising map.' },
    { level: 7, xp: 1400, rank: 'Titan', meaning: 'Your contribution history is becoming high-signal.' },
    { level: 8, xp: 2200, rank: 'Oracle', meaning: 'Future BRACU tools may prioritize contributors like you.' },
    { level: 9, xp: 3500, rank: 'Campus Myth', meaning: 'You are part of the rare contributor layer.' },
    { level: 10, xp: 5000, rank: 'Mythos', meaning: 'Top-tier contribution trail for future campus tools.' }
];

var missingDemandCache = {};

var COMMUNITY_TAG_GROUPS = [
    {
        id: 'overall_vibe',
        title: 'Overall Vibe',
        hint: 'overall student energy',
        chips: [
            ['goat', 'GOAT'],
            ['pookie_faculty', 'Pookie faculty'],
            ['final_boss', 'Final boss'],
            ['overhyped', 'Overhyped'],
            ['underrated_gem', 'Underrated gem'],
            ['not_for_weak', 'Not for the weak'],
            ['take_blindly', 'Take blindly'],
            ['run', 'Run']
        ]
    },
    {
        id: 'cg_impact',
        title: 'CGPA Insight',
        hint: 'CGPA reality check',
        chips: [
            ['cg_saver', 'CG saver'],
            ['cg_will_be_gg', 'CG will be GG'],
            ['four_possible', '4.0 possible'],
            ['effort_dite_hobe', 'Effort dite hobe'],
            ['not_last_minute_friendly', 'Not last-minute friendly'],
            ['cg_at_risk', 'CG at risk'],
            ['average_students_suffer', 'Average students suffer'],
            ['depends_on_grind', 'Depends on your grind']
        ]
    },
    {
        id: 'marking_reality',
        title: 'Marking Reality',
        hint: 'marking er ki obostha',
        chips: [
            ['gives_partial_mark', 'Gives partial-mark'],
            ['lenient_marking', 'Lenient marking'],
            ['strict_but_fair', 'Strict but fair'],
            ['rubric_based', 'Rubric based'],
            ['binary_marking', 'Binary marking'],
            ['random_cuts', 'Random cuts'],
            ['no_free_marks', 'No free marks'],
            ['grade_bump_possible', 'Grade bump possible']
        ]
    },
    {
        id: 'teaching_style',
        title: 'Teaching Style',
        hint: 'class e ki hoy',
        chips: [
            ['crystal_clear', 'Crystal clear'],
            ['concept_builder', 'Concept builder'],
            ['reads_slides_only', 'Reads slides only'],
            ['goes_beyond_slides', 'Goes beyond slides'],
            ['too_fast', 'Too fast'],
            ['boring_but_useful', 'Boring but useful'],
            ['interactive_class', 'Interactive class'],
            ['self_study_needed', 'Self-study needed']
        ]
    },
    {
        id: 'quiz_assignment',
        title: 'Quiz / Assignment Pattern',
        hint: 'quiz-assignment trauma meter',
        chips: [
            ['easy_quizzes', 'Easy quizzes'],
            ['tricky_quizzes', 'Tricky quizzes'],
            ['quiz_from_class', 'Quiz from class'],
            ['quiz_from_mars', 'Quiz from Mars'],
            ['assignments_chill', 'Assignments=chill'],
            ['assignments_burden', 'Assignments become burden'],
            ['deadline_flexible', 'Deadline flexible'],
            ['deadline_strict', 'Deadline strict'],
            ['mid_final_standard', 'Mid/final standard quizzes']
        ]
    },
    {
        id: 'behavior_access',
        title: 'Behavior & Access',
        hint: 'consultation/reply behavior',
        chips: [
            ['approachable', 'Approachable'],
            ['friendly', 'Friendly'],
            ['humble', 'Humble'],
            ['strict_but_okay', 'Strict but okay'],
            ['mood_swing_energy', 'Mood swing energy'],
            ['scary_consultation', 'Scary consultation'],
            ['supportive_in_problems', 'Supportive in problems'],
            ['replies_online', 'Replies online'],
            ['ghosts_emails', 'Ghosts emails'],
            ['good_consultation', 'Good consultation']
        ]
    }
];

var COMMUNITY_TAG_LABELS = COMMUNITY_TAG_GROUPS.reduce((acc, group) => {
    group.chips.forEach(([value, label]) => {
        acc[value] = label;
    });
    return acc;
}, {});

var COMMUNITY_TAG_MOODS = {
    // Positive / safe cues
    goat: 'positive',
    pookie_faculty: 'positive',
    final_boss: 'positive',
    underrated_gem: 'positive',
    take_blindly: 'positive',
    cg_saver: 'positive',
    four_possible: 'positive',
    gives_partial_mark: 'positive',
    lenient_marking: 'positive',
    grade_bump_possible: 'positive',
    crystal_clear: 'positive',
    concept_builder: 'positive',
    goes_beyond_slides: 'positive',
    interactive_class: 'positive',
    easy_quizzes: 'positive',
    quiz_from_class: 'positive',
    assignments_chill: 'positive',
    deadline_flexible: 'positive',
    approachable: 'positive',
    friendly: 'positive',
    humble: 'positive',
    supportive_in_problems: 'positive',
    replies_online: 'positive',
    good_consultation: 'positive',

    // Warning / risky cues
    overhyped: 'negative',
    run: 'negative',
    cg_will_be_gg: 'negative',
    cg_at_risk: 'negative',
    average_students_suffer: 'negative',
    binary_marking: 'negative',
    random_cuts: 'negative',
    no_free_marks: 'negative',
    reads_slides_only: 'negative',
    too_fast: 'negative',
    tricky_quizzes: 'negative',
    quiz_from_mars: 'negative',
    assignments_burden: 'negative',
    deadline_strict: 'negative',
    mood_swing_energy: 'negative',
    scary_consultation: 'negative',
    ghosts_emails: 'negative',

    // Context / depends-on-student cues
    not_for_weak: 'mixed',
    effort_dite_hobe: 'mixed',
    not_last_minute_friendly: 'mixed',
    depends_on_grind: 'mixed',
    strict_but_fair: 'mixed',
    rubric_based: 'mixed',
    boring_but_useful: 'mixed',
    self_study_needed: 'mixed',
    mid_final_standard: 'mixed',
    strict_but_okay: 'mixed'
};

function getCommunityTagMood(value) {
    return COMMUNITY_TAG_MOODS[value] || 'neutral';
}

function getXpLevelInfo(xpValue) {
    const xp = Math.max(0, Number(xpValue || 0));
    let current = ADVISING_XP_LEVELS[0];
    let next = null;

    for (let i = 0; i < ADVISING_XP_LEVELS.length; i++) {
        if (xp >= ADVISING_XP_LEVELS[i].xp) {
            current = ADVISING_XP_LEVELS[i];
            next = ADVISING_XP_LEVELS[i + 1] || null;
        }
    }

    const startXp = current.xp;
    const nextXp = next ? next.xp : current.xp;
    const span = next ? Math.max(1, nextXp - startXp) : 1;
    const progress = next ? Math.max(0, Math.min(100, ((xp - startXp) / span) * 100)) : 100;
    const toNext = next ? Math.max(0, nextXp - xp) : 0;

    return { xp, current, next, progress, toNext };
}

function xpRewardForDemand(uniqueStudents) {
    const n = Number(uniqueStudents || 0);
    if (n >= 30) return 75;
    if (n >= 20) return 55;
    if (n >= 10) return 40;
    if (n >= 5) return 25;
    if (n >= 2) return 12;
    return 0;
}

function missingDemandText(label, demand) {
    const unique = Number(demand?.unique_students || 0);
    if (unique >= 5) {
        return `${unique} students searched for ${label} and found nothing. Start the page so seniors can add reviews and juniors don’t enter advising blind.`;
    }
    if (unique >= 2) {
        return `A few students already searched for ${label}. Start the page now so the next juniors don’t hit a dead end.`;
    }
    return 'Looks like nobody documented the section trauma/blessing yet. Start the page so seniors can add reviews and juniors don’t enter advising blind.';
}

function xpBountyText(demand) {
    const bonus = xpRewardForDemand(demand?.unique_students || 0);
    return bonus
        ? `Earn +${bonus} Aura by adding this faculty page`
        : 'Add this faculty page and earn Aura';
}

var COMMUNITY_TAG_PHRASES = {
    goat: 'GOAT-level energy',
    pookie_faculty: 'a pookie-faculty vibe',
    final_boss: 'final-boss-level strong vibe',
    overhyped: 'some overhyped energy',
    underrated_gem: 'underrated-gem energy',
    not_for_weak: 'not-for-the-weak pressure',
    take_blindly: 'take-blindly confidence',
    run: 'a run-level warning',

    cg_saver: 'CG-saver potential',
    cg_will_be_gg: 'CG-will-be-GG risk',
    four_possible: '4.0-possible hope',
    effort_dite_hobe: 'effort dite hobe reality',
    not_last_minute_friendly: 'not last-minute friendly pressure',
    cg_at_risk: 'CG-at-risk warning',
    average_students_suffer: 'average-students-may-suffer warning',
    depends_on_grind: 'depends-on-your-grind condition',

    gives_partial_mark: 'partial marks are possible',
    lenient_marking: 'lenient marking',
    strict_but_fair: 'strict but fair marking',
    rubric_based: 'rubric-based checking',
    binary_marking: 'binary marking',
    random_cuts: 'random cuts',
    no_free_marks: 'no-free-marks checking',
    grade_bump_possible: 'grade-bump possibility',

    crystal_clear: 'crystal-clear explanations',
    concept_builder: 'concept-building teaching',
    reads_slides_only: 'slide-reading classes',
    goes_beyond_slides: 'going beyond slides',
    too_fast: 'fast pacing',
    boring_but_useful: 'boring but useful classes',
    interactive_class: 'interactive classes',
    self_study_needed: 'self-study needed',

    easy_quizzes: 'easy quizzes',
    tricky_quizzes: 'tricky quizzes',
    quiz_from_class: 'quizzes from class',
    quiz_from_mars: 'quiz-from-Mars surprises',
    assignments_chill: 'chill assignments',
    assignments_burden: 'assignment burden',
    deadline_flexible: 'flexible deadlines',
    deadline_strict: 'strict deadlines',
    mid_final_standard: 'standard mid/final pattern',

    approachable: 'approachable behavior',
    friendly: 'friendly attitude',
    humble: 'humble attitude',
    strict_but_okay: 'strict but okay behavior',
    mood_swing_energy: 'mood-swing energy',
    scary_consultation: 'scary consultation',
    supportive_in_problems: 'support during problems',
    replies_online: 'online replies',
    ghosts_emails: 'ghosting emails',
    good_consultation: 'good consultation'
};

var COMMUNITY_GROUP_COPY = {
    overall_vibe: { lead: 'Vibe-wise', verb: 'this student felt' },
    cg_impact: { lead: 'For CG', verb: 'the CGPA read is' },
    marking_reality: { lead: 'Marking-wise', verb: 'they noticed' },
    teaching_style: { lead: 'Teaching-wise', verb: 'the class feels like' },
    quiz_assignment: { lead: 'For quizzes and assignments', verb: 'the pattern looks like' },
    behavior_access: { lead: 'Behavior/access-wise', verb: 'they experienced' }
};


// DOM references for v0.2 sheets. These are evaluated after HTML is parsed.
var addFacultyBackdrop = document.getElementById('addFacultyBackdrop');
var addFacultyCloseBtn = document.getElementById('addFacultyCloseBtn');
var addFacultyTitle = document.getElementById('addFacultyTitle');
var addFacultySubtitle = document.getElementById('addFacultySubtitle');
var addFacultyInitial = document.getElementById('addFacultyInitial');
var addFacultyCourse = document.getElementById('addFacultyCourse');
var addFacultyName = document.getElementById('addFacultyName');
var createFacultyBtn = document.getElementById('createFacultyBtn');
var departmentChipGrid = document.getElementById('departmentChipGrid');

var communityReviewBackdrop = document.getElementById('communityReviewBackdrop');
var communityReviewCloseBtn = document.getElementById('communityReviewCloseBtn');
var communityReviewTitle = document.getElementById('communityReviewTitle');
var communityReviewCourseCode = document.getElementById('communityReviewCourseCode');
var communityTeachingSlider = document.getElementById('communityTeachingSlider');
var communityMarkingSlider = document.getElementById('communityMarkingSlider');
var communityBehaviorSlider = document.getElementById('communityBehaviorSlider');
var communityTeachingValue = document.getElementById('communityTeachingValue');
var communityMarkingValue = document.getElementById('communityMarkingValue');
var communityBehaviorValue = document.getElementById('communityBehaviorValue');
var communityChipGroupsEl = document.getElementById('communityChipGroups');
var communityPersonalNote = document.getElementById('communityPersonalNote');
var communityNoteCounter = document.getElementById('communityNoteCounter');
var submitCommunityReviewBtn = document.getElementById('submitCommunityReviewBtn');

// Override original loader: archive + community public views.
async function loadFacultyData() {
    try {
        const [{ data: archiveData, error: archiveError }, { data: communityData, error: communityError }] = await Promise.all([
            _supabase.from('faculty_reviews').select('*'),
            _supabase.from('community_faculty_profiles_public').select('*').order('created_at', { ascending: false })
        ]);

        if (archiveError) throw archiveError;
        if (communityError) {
            console.warn('community_faculty_profiles_public missing or blocked:', communityError.message || communityError);
        }

        allFaculty = archiveData || [];
        allCommunityFaculty = communityData || [];

        const archiveSearchable = allFaculty.map(f => {
            const parsed = parseArchiveFaculty(f);
            return { ...f, ...parsed, source_type: 'archive' };
        });

        fuse = new Fuse(archiveSearchable, {
            keys: [
                { name: 'fullName', weight: 0.55 },
                { name: 'initial', weight: 0.35 },
                { name: 'faculty_name', weight: 0.1 }
            ],
            threshold: 0.4,
            ignoreLocation: true,
            minMatchCharLength: 2,
            includeScore: true
        });

        const communitySearchable = allCommunityFaculty.map(f => ({
            ...f,
            fullName: f.faculty_name || '',
            initial: f.faculty_initial || '',
            courses: Array.isArray(f.course_codes) ? f.course_codes.join(', ') : ''
        }));

        communityFuse = new Fuse(communitySearchable, {
            keys: [
                { name: 'initial', weight: 0.55 },
                { name: 'fullName', weight: 0.3 },
                { name: 'courses', weight: 0.15 }
            ],
            threshold: 0.35,
            ignoreLocation: true,
            minMatchCharLength: 2,
            includeScore: true
        });

        checkUrlParams();

    } catch (err) {
        console.error('loadFacultyData v0.2:', err);
    }
}

function parseArchiveFaculty(f) {
    const parts = (f?.faculty_reviews || '').split('|');
    return {
        fullName: parts[0]?.trim() || f?.faculty_name || '',
        initial:  parts[1]?.trim() || '',
        email:    parts[2]?.trim() || '',
        courses:  parts[3]?.trim() || '',
        teaching: parts[4]?.trim() || 'N/A',
        marking:  parts[5]?.trim() || 'N/A',
        behavior: parts[6]?.trim() || 'N/A',
        summary:  parts[7]?.trim() || 'No overall review available.',
        insights: parts[8]?.trim() || ''
    };
}

function normalizeInitial(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeCourseCode(value) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function isValidCourseCode(code) {
    return /^[A-Z]{2,5}\d{2,4}$/.test(normalizeCourseCode(code));
}

function facultyDisplayNameFromCommunity(f) {
    const name = String(f?.faculty_name || '').trim();
    const initial = String(f?.faculty_initial || '').trim();
    return name || initial || 'Faculty';
}

function safeAttr(value) {
    return escHtml(String(value || '')).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

// Override autocomplete: include archive + community pages.
function showCourseAC(query) {
    const codes = new Set();

    allFaculty.forEach(f => {
        const courses = parseArchiveFaculty(f).courses;
        courses.split(',').forEach(c => {
            const t = normalizeCourseCode(c);
            if (t) codes.add(t);
        });
    });

    allCommunityFaculty.forEach(f => {
        const arr = Array.isArray(f.course_codes) ? f.course_codes : [];
        arr.forEach(c => {
            const t = normalizeCourseCode(c);
            if (t) codes.add(t);
        });
    });

    const matches = [...codes].filter(c => c.startsWith(query)).sort().slice(0, 6);

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
    const map = new Map();

    if (fuse) {
        fuse.search(query).forEach(r => {
            if (r.score < 0.5) {
                map.set('a-' + r.item.id, {
                    label: r.item.fullName || r.item.faculty_name || 'Unknown',
                    badge: r.item.initial || 'ARCHIVE',
                    source: 'ARCHIVE',
                    onClick: () => {
                        searchInput.value = r.item.fullName || r.item.faculty_name || query;
                        hideAC();
                        searchForm.dispatchEvent(new Event('submit'));
                    }
                });
            }
        });
    }

    allFaculty.forEach(f => {
        const p = parseArchiveFaculty(f);
        if (p.initial && p.initial.toLowerCase() === query.toLowerCase()) {
            map.set('a-' + f.id, {
                label: p.fullName || p.initial,
                badge: p.initial,
                source: 'ARCHIVE',
                onClick: () => {
                    searchInput.value = p.fullName || p.initial;
                    hideAC();
                    searchForm.dispatchEvent(new Event('submit'));
                }
            });
        }
    });

    if (communityFuse) {
        communityFuse.search(query).forEach(r => {
            if (r.score < 0.45) {
                map.set('c-' + r.item.id, {
                    label: facultyDisplayNameFromCommunity(r.item),
                    badge: r.item.faculty_initial || 'COMMUNITY',
                    source: 'COMMUNITY',
                    onClick: () => {
                        searchInput.value = r.item.faculty_initial || r.item.faculty_name || query;
                        hideAC();
                        displayCommunityFaculty(r.item, false);
                    }
                });
            }
        });
    }

    const final = [...map.values()].slice(0, 6);

    if (!final.length) {
        hideAC();
        return;
    }

    renderAC(final.map(item => ({
        label: item.label,
        badge: item.badge,
        onClick: item.onClick
    })));
}

// Override course search: archive + community rows.
async function handleCourseSearch(code) {
    const normalizedCode = normalizeCourseCode(code);
    currentCourseCode = normalizedCode;

    const archiveRows = allFaculty.filter(f => {
        const courses = parseArchiveFaculty(f).courses;
        return courses.split(',').map(c => normalizeCourseCode(c)).includes(normalizedCode);
    }).map(f => {
        const p = parseArchiveFaculty(f);
        const t = parseFloat(p.teaching) || 0;
        const m = parseFloat(p.marking) || 0;
        const b = parseFloat(p.behavior) || 0;
        const avg = ((t + m + b) / 3) / 10 * 100;
        return {
            source: 'archive',
            id: f.id,
            name: p.fullName || 'Unknown',
            init: p.initial || '',
            avg: avg.toFixed(1)
        };
    });

    const communityRows = allCommunityFaculty.filter(f => {
        const arr = Array.isArray(f.course_codes) ? f.course_codes.map(normalizeCourseCode) : [];
        return arr.includes(normalizedCode);
    });

    const communityRowsWithStats = await Promise.all(communityRows.map(async f => {
        const stats = await getCommunityReviewStats('community', f.id, null);
        const avg = stats.count ? ((stats.avgTeaching + stats.avgMarking + stats.avgBehavior) / 3) / 10 * 100 : 0;
        return {
            source: 'community',
            id: f.id,
            name: facultyDisplayNameFromCommunity(f),
            init: f.faculty_initial || '',
            avg: avg.toFixed(1),
            reviewCount: stats.count
        };
    }));

    const matching = [...archiveRows, ...communityRowsWithStats]
        .sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg));

    await logSearch(normalizedCode, 'course', matching.length > 0);

    if (!matching.length) {
        showMissingFacultyCard(normalizedCode, 'course');
        facultyReviewArea.style.display = 'none';
        return;
    }

    const rowsHTML = matching.map(r => {
        const click = r.source === 'archive'
            ? `window.searchFaculty('${safeAttr(r.name)}')`
            : `window.searchCommunityFacultyById(${r.id})`;
        const meta = r.source === 'community'
            ? `<span class="faculty-row-badge community-row-badge">${r.reviewCount || 0} reviews</span>`
            : (r.init ? `<span class="faculty-row-badge">${escHtml(r.init)}</span>` : '');
        return `
            <div class="faculty-row" onclick="${click}">
                <div class="faculty-col">
                    <div class="faculty-row-head">
                        <span class="faculty-row-name">${escHtml(r.name)}</span>
                        ${meta}
                    </div>
                    <div class="bar-track">
                        <div class="bar-fill" data-w="${r.avg}" style="width:0%"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    showResult(courseRatingArea, `
        <div class="card slide-up">
            <div class="card-head">
                <h2 class="leaderboard-title">Faculty teaching ${escHtml(normalizedCode)}</h2>
            </div>
            <div>${rowsHTML}</div>
            <div class="card-foot">
                <span class="foot-copy">Archive + community pages · Tap to view</span>
                <button class="foot-link foot-btn" onclick="openAddFacultyModal('${safeAttr(normalizedCode)}')">+ Add Missing Faculty</button>
            </div>
        </div>
    `);

    facultyReviewArea.style.display = 'none';

    setTimeout(() => {
        document.querySelectorAll('.bar-fill').forEach((bar, i) => {
            setTimeout(() => {
                const w = bar.getAttribute('data-w') || 0;
                bar.style.width = `${w}%`;
            }, i * 80);
        });
    }, 60);
}

// Override faculty search: archive first, then community, then add-missing card.
async function handleFacultySearch(input, keepLeaderboard = false) {
    let faculty = null;
    let communityFaculty = null;
    const rawInput = String(input || '').trim();
    const normalizedInput = normalizeInitial(rawInput);
    const len = rawInput.length;
    const threshold = len <= 6 ? 0.18 : 0.45;

    if (fuse && allFaculty.length) {
        const results = fuse.search(rawInput);
        if (results.length && results[0].score < threshold) {
            faculty = results[0].item;
        }
    }

    if (!faculty && normalizedInput) {
        faculty = allFaculty.find(f => normalizeInitial(parseArchiveFaculty(f).initial) === normalizedInput) || null;
    }

    if (!faculty) {
        try {
            const { data, error } = await _supabase
                .from('faculty_reviews')
                .select('*')
                .ilike('faculty_name', `%${rawInput}%`)
                .limit(1)
                .maybeSingle();
            if (data && !error) faculty = data;
        } catch (_) {
            // ignore fallback failures
        }
    }

    if (!faculty) {
        if (communityFuse && allCommunityFaculty.length) {
            const results = communityFuse.search(rawInput);
            if (results.length && results[0].score < 0.45) {
                communityFaculty = results[0].item;
            }
        }

        if (!communityFaculty && normalizedInput) {
            communityFaculty = allCommunityFaculty.find(f => normalizeInitial(f.faculty_initial) === normalizedInput) || null;
        }
    }

    await logSearch(rawInput, 'faculty', !!faculty || !!communityFaculty);

    if (faculty) {
        await displayFaculty(faculty, keepLeaderboard);
        return;
    }

    if (communityFaculty) {
        await displayCommunityFaculty(communityFaculty, keepLeaderboard);
        return;
    }

    if (!keepLeaderboard) {
        showMissingFacultyCard(rawInput, 'faculty');
        facultyReviewArea.style.display = 'none';
    }
}

window.searchFaculty = name => {
    const matchedFaculty = allFaculty.find(f => {
        const p = parseArchiveFaculty(f);
        return (p.fullName || p.initial).toLowerCase() === String(name).toLowerCase();
    });

    logActivity('faculty_open', {
        faculty_id: matchedFaculty?.id || null,
        faculty_name: name,
        event_label: name
    });

    handleFacultySearch(name, true);
};

window.searchCommunityFacultyById = async id => {
    const faculty = allCommunityFaculty.find(f => Number(f.id) === Number(id));
    if (!faculty) return;
    await logActivity('faculty_open', {
        faculty_id: 'community-' + id,
        faculty_name: facultyDisplayNameFromCommunity(faculty),
        event_label: facultyDisplayNameFromCommunity(faculty),
        metadata: { source: 'community' }
    });
    displayCommunityFaculty(faculty, true);
};

window.searchCourse = code => {
    const normalized = normalizeCourseCode(code);
    searchInput.value = normalized;
    handleCourseSearch(normalized);
};

function showMissingFacultyCard(query, mode = 'faculty') {
    const raw = String(query || '').trim();
    const cleaned = mode === 'course' ? normalizeCourseCode(raw) : normalizeInitial(raw) || raw.toUpperCase();
    const label = cleaned || 'THIS FACULTY';
    const possessive = label.endsWith('S') ? `${label}’ Page` : `${label}’s Page`;
    const isCourseMissing = mode === 'course';
    const demandKey = `${mode}:${label}`;
    const cachedDemand = missingDemandCache[demandKey] || null;
    const titleText = isCourseMissing ? `No faculty found for ${label} yet.` : `No review found for ${label} yet.`;
    const descText = isCourseMissing
        ? 'If you know someone who takes this course, start a community page so seniors can drop reviews and juniors can find it before advising.'
        : missingDemandText(label, cachedDemand);
    const buttonText = isCourseMissing ? `+ Add Faculty for ${label}` : `+ Add ${possessive}`;

    showResult(courseRatingArea, `
        <div class="card slide-up">
            <div class="card-body empty-action-box">
                <span class="missing-query-chip">${escHtml(label)}</span>
                <div class="empty-state" style="padding:0;">
                    <span class="empty-icon">🔍</span>
                    <p class="empty-title">${escHtml(titleText)}</p>
                    <p class="empty-desc" id="missingDemandCopy-${safeDomId(demandKey)}">${escHtml(descText)}</p>
                    <div class="signal-bounty-pill" id="missingDemandBounty-${safeDomId(demandKey)}">${escHtml(cachedDemand ? xpBountyText(cachedDemand) : 'Checking demand...')}</div>
                    <button class="pill-btn pill-btn--white" onclick="openAddFacultyModal('${safeAttr(label)}')">${escHtml(buttonText)}</button>
                </div>
            </div>
        </div>
    `);

    loadMissingSearchDemand(label, mode).then(demand => {
        missingDemandCache[demandKey] = demand;
        const copyEl = document.getElementById(`missingDemandCopy-${safeDomId(demandKey)}`);
        const bountyEl = document.getElementById(`missingDemandBounty-${safeDomId(demandKey)}`);
        if (copyEl && !isCourseMissing) copyEl.textContent = missingDemandText(label, demand);
        if (bountyEl) bountyEl.textContent = xpBountyText(demand);
        if (bountyEl && xpRewardForDemand(demand?.unique_students || 0)) bountyEl.classList.add('signal-bounty-pill--hot');
    }).catch(() => {
        const bountyEl = document.getElementById(`missingDemandBounty-${safeDomId(demandKey)}`);
        if (bountyEl) bountyEl.textContent = 'Start the page';
    });
}

function safeDomId(value) {
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function loadMissingSearchDemand(label, mode = 'faculty') {
    const key = `${mode}:${label}`;
    if (missingDemandCache[key]) return missingDemandCache[key];

    const { data, error } = await _supabase.rpc('get_missing_search_demand', {
        p_query: label,
        p_query_type: mode
    });
    if (error) throw error;

    const demand = data || { query: label, query_type: mode, total_searches: 0, unique_students: 0 };
    missingDemandCache[key] = demand;
    return demand;
}


async function getCommunityReviews(targetType, targetId, limit = 100) {
    try {
        let q = _supabase
            .from('community_faculty_reviews_public')
            .select('*')
            .eq('target_type', targetType)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (targetType === 'archive') {
            q = q.eq('archive_faculty_id', targetId);
        } else {
            q = q.eq('community_faculty_id', targetId);
        }

        const { data, error } = await q;
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.warn('getCommunityReviews:', err.message || err);
        return [];
    }
}

async function getCommunityReviewStats(targetType, communityId, archiveId) {
    const targetId = targetType === 'archive' ? archiveId : communityId;
    const reviews = await getCommunityReviews(targetType, targetId, 200);
    const nums = reviews.filter(r => r.teaching_rating && r.marking_rating && r.behavior_rating);

    if (!nums.length) {
        return { count: 0, avgTeaching: 0, avgMarking: 0, avgBehavior: 0, reviews };
    }

    const avg = key => nums.reduce((sum, r) => sum + Number(r[key] || 0), 0) / nums.length;
    return {
        count: nums.length,
        avgTeaching: avg('teaching_rating'),
        avgMarking: avg('marking_rating'),
        avgBehavior: avg('behavior_rating'),
        reviews
    };
}

// Override archive display: old archive summary stays; new structured reviews appear under same card.
async function displayFaculty(faculty, keepLeaderboard = false) {
    currentDisplayedFaculty = faculty;
    currentReviewOffset = 0;

    const p = parseArchiveFaculty(faculty);
    const fullName = p.fullName || 'Unknown Faculty';
    const initial  = p.initial || '';
    const email    = p.email || '';
    const courses  = p.courses || '';
    const teaching = p.teaching;
    const marking  = p.marking;
    const behavior = p.behavior;
    const summary  = p.summary;
    const insights = p.insights;

    const courseArr = courses ? courses.split(',').map(c => normalizeCourseCode(c)).filter(Boolean) : [];
    const verdict = getVerdictInfo(teaching, marking, behavior);
    const { reviews, total, hasMore } = await loadReviews(faculty.id, 5, 0);
    const structuredReviews = await getCommunityReviews('archive', faculty.id, 50);
    const voteCounts = await loadVoteCounts(faculty.id);

    const courseTags = courseArr.map(c =>
        `<span class="course-tag" onclick="searchCourse('${safeAttr(c)}')">${escHtml(c)}</span>`
    ).join('');

    const verdictHTML = verdict
        ? `<div class="verdict-badge ${verdict.cls}">${escHtml(verdict.label)}</div>`
        : '';

    const reviewsHTML = buildMixedReviewSection({
        legacyReviews: reviews,
        legacyTotal: total,
        legacyHasMore: hasMore,
        structuredReviews,
        archiveFacultyId: faculty.id
    });

    const defaultCourse = currentCourseCode || courseArr[0] || '';

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
                    <div class="verdict-box-label">Archive Review</div>
                    <p class="verdict-text">${escHtml(summary)}</p>
                </div>

                <div class="card-section-head">What Students Say</div>
                ${buildInsights(insights)}

                <div class="action-row">
                    <div class="vote-pill">
                        <button class="vote-btn v-up" id="vote-up-${faculty.id}" onclick="handleVote(${faculty.id},'up')">
                            <svg class="vote-arrow" viewBox="0 0 24 24"><path d="M12 4l-8 8h5v8h6v-8h5z"/></svg>
                            Agree
                            <span class="vote-count-mini" id="vote-up-count-${faculty.id}">${voteCounts.upvotes}</span>
                        </button>
                        <div class="vote-divider"></div>
                        <button class="vote-btn v-down" id="vote-down-${faculty.id}" onclick="handleVote(${faculty.id},'down')">
                            Disagree
                            <span class="vote-count-mini" id="vote-down-count-${faculty.id}">${voteCounts.downvotes}</span>
                            <svg class="vote-arrow" viewBox="0 0 24 24"><path d="M12 20l8-8h-5V4H9v8H4z"/></svg>
                        </button>
                    </div>

                    <div class="action-btns">
                        <button class="pill-btn" onclick="openCommunityReviewModal('archive', ${faculty.id}, '${safeAttr(fullName)}', '${safeAttr(defaultCourse)}')">
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

    if (!keepLeaderboard) courseRatingArea.style.display = 'none';

    setTimeout(() => {
        initVotePill(faculty.id);
        facultyReviewArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
}

async function displayCommunityFaculty(faculty, keepLeaderboard = false) {
    currentCommunityProfileForRefresh = faculty;
    const reviews = await getCommunityReviews('community', faculty.id, 100);
    const stats = await getCommunityReviewStats('community', faculty.id, null);
    const name = facultyDisplayNameFromCommunity(faculty);
    const hasFullName = !!String(faculty.faculty_name || '').trim();
    const initial = faculty.faculty_initial || '';
    const department = faculty.department || '';
    const courseArr = Array.isArray(faculty.course_codes) ? faculty.course_codes.map(normalizeCourseCode).filter(Boolean) : [];
    const defaultCourse = currentCourseCode || courseArr[0] || '';
    const verdict = stats.count ? getVerdictInfo(stats.avgTeaching, stats.avgMarking, stats.avgBehavior) : null;
    const needed = Math.max(COMMUNITY_REVIEW_TARGET_COUNT - stats.count, 0);
    const progress = Math.min((stats.count / COMMUNITY_REVIEW_TARGET_COUNT) * 100, 100);
    const signal = generateCommunityVerdict(reviews, stats);

    const courseTags = courseArr.map(c =>
        `<span class="course-tag" onclick="searchCourse('${safeAttr(c)}')">${escHtml(c)}</span>`
    ).join('');

    const verdictHTML = stats.count
        ? `<div class="verdict-badge ${verdict.cls}">${stats.count >= COMMUNITY_REVIEW_TARGET_COUNT ? 'Community Verdict' : 'Early Reviews'}</div>`
        : `<div class="community-badge">Needs Reviews</div>`;

    const reviewsHTML = buildMixedReviewSection({
        legacyReviews: [],
        legacyTotal: 0,
        legacyHasMore: false,
        structuredReviews: reviews,
        archiveFacultyId: null,
        communityFacultyId: faculty.id
    });

    const html = `
        <div class="card slide-up">
            <div class="card-head">
                ${verdictHTML}
                <h2 class="faculty-name">
                    ${escHtml(name)}
                    ${hasFullName && initial ? `<span class="faculty-initial">${escHtml(initial)}</span>` : ''}
                </h2>
                ${department ? `<span class="faculty-email community-meta-line">${escHtml(department)}</span>` : ''}
                ${courseArr.length ? `<div class="course-tags">${courseTags}</div>` : ''}
            </div>

            <div class="card-body">
                <div class="scores-row">
                    ${scoreBlock('Teaching', stats.count ? stats.avgTeaching.toFixed(1) : '—')}
                    ${scoreBlock('Marking', stats.count ? stats.avgMarking.toFixed(1) : '—')}
                    ${scoreBlock('Behavior', stats.count ? stats.avgBehavior.toFixed(1) : '—')}
                </div>

                <div class="community-signal-box">
                    <div class="community-signal-title">${escHtml(signal.title)}</div>
                    <p class="community-signal-text">${escHtml(signal.text)}</p>
                    <div class="community-progress">
                        <div class="community-progress-head">
                            <span>${stats.count} review${stats.count === 1 ? '' : 's'} collected</span>
                            <span>${needed ? `${needed} more needed` : 'verdict unlocked'}</span>
                        </div>
                        <div class="community-progress-track"><div class="community-progress-fill" style="width:${progress}%"></div></div>
                    </div>
                </div>

                <div class="action-row">
                    <div class="community-actions">
                        <button class="pill-btn pill-btn--white" onclick="openCommunityReviewModal('community', ${faculty.id}, '${safeAttr(name)}', '${safeAttr(defaultCourse)}')">+ Review</button>
                        <button class="pill-btn" onclick="handleCommunityShareLink(${faculty.id})">Copy Request Link</button>
                    </div>
                </div>

                ${reviewsHTML || `<div class="reviews-section"><div class="empty-state"><p class="empty-title">No reviews yet.</p><p class="empty-desc">Be the first one to help juniors before advising.</p></div></div>`}
            </div>

            <div class="card-foot">
                <button class="foot-link foot-btn" onclick="toggleAbout()">Disclaimer</button>
                <button class="foot-link foot-btn" onclick="openSupportCard()">☕ Coffee</button>
            </div>
        </div>
    `;

    showResult(facultyReviewArea, html);
    if (!keepLeaderboard) courseRatingArea.style.display = 'none';
}

function buildMixedReviewSection({ legacyReviews = [], legacyTotal = 0, legacyHasMore = false, structuredReviews = [], archiveFacultyId = null, communityFacultyId = null }) {
    const legacyCards = legacyReviews.map(buildReviewCard).join('');
    const structuredCards = structuredReviews.map(buildCommunityReviewCard).join('');
    const total = Number(legacyTotal || 0) + structuredReviews.length;

    if (!total && !structuredCards) return '';

    const id = archiveFacultyId || `community-${communityFacultyId}`;
    const loadMore = archiveFacultyId && legacyHasMore
        ? `<button class="load-more-btn" onclick="loadMoreReviews(${archiveFacultyId})">Load more reviews · ${legacyTotal - 5} remaining</button>`
        : '';

    return `
        <div class="reviews-section">
            <div class="reviews-header-row">
                <span class="reviews-title">Student Reviews</span>
                <span class="reviews-title">${total}</span>
            </div>
            <div id="reviews-container-${id}">${legacyCards}${structuredCards}</div>
            <div id="load-more-wrap-${id}">${loadMore}</div>
        </div>
    `;
}

function buildCommunityReviewCard(r) {
    const t = Number(r.teaching_rating || 0);
    const m = Number(r.marking_rating || 0);
    const b = Number(r.behavior_rating || 0);
    const avg = (t + m + b) / 3;
    const accent = getReviewAccentColor(avg);
    const labels = Array.isArray(r.tag_labels) ? r.tag_labels : flattenSelectedTagLabels(r.selected_tags || {});
    const shownTagItems = flattenSelectedTagItems(r.selected_tags || {}, labels).slice(0, 14);
    const personal = String(r.personal_note || '').trim();

    return `
        <div class="review-card" style="--review-accent:${accent}">
            <div class="review-meta">
                <span>Anonymous BRACU Student</span>
                ${r.course_code ? `<span class="review-course-chip">${escHtml(r.course_code)}</span>` : ''}
                <span>·</span>
                <span>${timeAgo(r.created_at)}</span>
            </div>
            <div class="review-bars">
                ${reviewBar('Teaching', t)}
                ${reviewBar('Marking', m)}
                ${reviewBar('Behavior', b)}
            </div>
            ${r.generated_summary ? `<p class="review-text generated">${escHtml(r.generated_summary)}</p>` : ''}
            ${shownTagItems.length ? `<div class="structured-tags structured-tags--proof">${shownTagItems.map(x => `<span class="structured-tag structured-tag--${escHtml(x.mood)}">${escHtml(x.label)}</span>`).join('')}</div>` : ''}
            ${personal ? `<div class="personal-note">"${escHtml(personal)}"</div>` : ''}
        </div>
    `;
}

function flattenSelectedTagLabels(selected) {
    const labels = [];
    Object.values(selected || {}).forEach(arr => {
        if (Array.isArray(arr)) {
            arr.forEach(v => labels.push(COMMUNITY_TAG_LABELS[v] || v));
        }
    });
    return [...new Set(labels)];
}

function flattenSelectedTagItems(selected, fallbackLabels = []) {
    const map = new Map();

    Object.values(selected || {}).forEach(arr => {
        if (!Array.isArray(arr)) return;

        arr.forEach(value => {
            const label = COMMUNITY_TAG_LABELS[value] || value;
            const key = String(value || label);

            if (!map.has(key)) {
                map.set(key, {
                    value,
                    label,
                    mood: getCommunityTagMood(value)
                });
            }
        });
    });

    if (!map.size && Array.isArray(fallbackLabels)) {
        fallbackLabels.forEach(label => {
            const key = String(label || '').trim();
            if (!key || map.has(key)) return;
            map.set(key, { value: key, label: key, mood: 'neutral' });
        });
    }

    return [...map.values()];
}

function openAddFacultyModal(prefill = '') {
    currentAddFacultyQuery = String(prefill || '').trim();
    selectedDepartment = '';

    const initialGuess = normalizeInitial(currentAddFacultyQuery);
    const courseGuess = isValidCourseCode(currentAddFacultyQuery) ? normalizeCourseCode(currentAddFacultyQuery) : (currentCourseCode || '');

    if (addFacultyTitle) {
        addFacultyTitle.textContent = initialGuess && !isValidCourseCode(currentAddFacultyQuery)
            ? `+ ${initialGuess}’s Page`
            : '+ Add Missing Faculty';
    }
    if (addFacultySubtitle) {
        addFacultySubtitle.textContent = isValidCourseCode(normalizeCourseCode(currentAddFacultyQuery || '')) ? 'Add the basics first. Reviews can come after.' : 'Start with the basics. The community can fill the rest.';
    }

    if (addFacultyInitial) addFacultyInitial.value = isValidCourseCode(currentAddFacultyQuery) ? '' : initialGuess;
    if (addFacultyCourse) addFacultyCourse.value = courseGuess;
    if (addFacultyName) addFacultyName.value = '';

    departmentChipGrid?.querySelectorAll('.choice-chip').forEach(btn => btn.classList.remove('active'));
    openSheet(addFacultyBackdrop);
    setTimeout(() => (addFacultyInitial?.value ? addFacultyCourse?.focus() : addFacultyInitial?.focus()), 80);
}

function closeAddFacultyModal() {
    closeSheet(addFacultyBackdrop);
}

window.openAddFacultyModal = openAddFacultyModal;

addFacultyCloseBtn?.addEventListener('click', closeAddFacultyModal);
addFacultyBackdrop?.addEventListener('click', e => {
    if (e.target === addFacultyBackdrop) closeAddFacultyModal();
});

departmentChipGrid?.addEventListener('click', e => {
    const btn = e.target.closest('.choice-chip');
    if (!btn) return;
    departmentChipGrid.querySelectorAll('.choice-chip').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    selectedDepartment = btn.dataset.dept || '';
});

createFacultyBtn?.addEventListener('click', async () => {
    const email = currentUser?.full_email || localStorage.getItem('bracu_user_email');
    const username = currentUser?.username || (email ? email.split('@')[0] : null);
    const initial = normalizeInitial(addFacultyInitial?.value || '');
    const course = normalizeCourseCode(addFacultyCourse?.value || '');
    const name = String(addFacultyName?.value || '').trim() || null;

    if (!email || !username) {
        showToast('Session expired. Sign in again.', 'error');
        return;
    }

    if (initial.length < 2 || initial.length > 12) {
        showToast('Enter a clean faculty initial.', 'error');
        return;
    }

    if (!isValidCourseCode(course)) {
        showToast('Enter a valid course code like CSE220.', 'error');
        return;
    }

    // If archive already has this initial, guide to archive page instead of duplicate community page.
    const archiveMatch = allFaculty.find(f => normalizeInitial(parseArchiveFaculty(f).initial) === initial);
    if (archiveMatch) {
        closeAddFacultyModal();
        showToast('Already in archive. Opening faculty page.', 'success');
        displayFaculty(archiveMatch, false);
        return;
    }

    createFacultyBtn.disabled = true;
    createFacultyBtn.textContent = 'Creating...';

    try {
        const { data, error } = await _supabase.rpc('create_community_faculty_profile', {
            p_faculty_initial: initial,
            p_course_code: course,
            p_faculty_name: name,
            p_department: selectedDepartment || null,
            p_username: username,
            p_student_email: email
        });

        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;

        await loadFacultyData();
        const profile = allCommunityFaculty.find(f => Number(f.id) === Number(row?.id)) || row;

        const demand = await loadMissingSearchDemand(initial, 'faculty').catch(() => missingDemandCache[`faculty:${initial}`] || null);
        const demandBonus = xpRewardForDemand(demand?.unique_students || 0);

        closeAddFacultyModal();
        showImpactReceipt({
            title: demandBonus ? 'High-demand page started.' : 'Page started.',
            eyebrow: 'Faculty page added',
            message: demand?.unique_students >= 2
                ? `${demand.unique_students} lost searches now have a page for ${initial}.`
                : `${initial} is now in the community archive.`,
            xpLines: [
                { label: 'Page added', points: 15 },
                ...(demandBonus ? [{ label: 'Demand bonus', points: demandBonus }] : [])
            ],
            footer: 'First review bonus is waiting.'
        });
        refreshProfileChipOnly();

        await logActivity('community_faculty_create', {
            target_type: 'community_faculty',
            target_id: profile?.id || initial,
            event_label: initial,
            metadata: { course_code: course, demand_unique_students: demand?.unique_students || 0 }
        });

        if (profile) displayCommunityFaculty(profile, false);

    } catch (err) {
        console.error('createFaculty error:', err);
        showToast(err.message || 'Could not create page.', 'error');
    } finally {
        createFacultyBtn.disabled = false;
        createFacultyBtn.textContent = 'Create Page';
    }
});

function setupCommunityReviewUI() {
    if (!communityChipGroupsEl) return;
    communityChipGroupsEl.innerHTML = COMMUNITY_TAG_GROUPS.map(group => `
        <div class="community-chip-group" data-group="${group.id}">
            <div class="community-chip-title">
                <span>${escHtml(group.title)}</span>
                <span>${escHtml(group.hint)}</span>
            </div>
            <div class="community-chip-list">
                ${group.chips.map(([value, label]) => `<button type="button" class="choice-chip" data-group="${group.id}" data-value="${value}" data-mood="${getCommunityTagMood(value)}">${escHtml(label)}</button>`).join('')}
            </div>
        </div>
    `).join('');
}

setupCommunityReviewUI();

communityChipGroupsEl?.addEventListener('click', e => {
    const btn = e.target.closest('.choice-chip');
    if (!btn) return;
    const group = btn.dataset.group;
    const value = btn.dataset.value;
    selectedReviewTags[group] = selectedReviewTags[group] || [];

    if (selectedReviewTags[group].includes(value)) {
        selectedReviewTags[group] = selectedReviewTags[group].filter(v => v !== value);
        btn.classList.remove('active');
    } else {
        selectedReviewTags[group].push(value);
        btn.classList.add('active');
    }
});

function openCommunityReviewModal(targetType, targetId, facultyName, courseCode = '') {
    const email = currentUser?.full_email || localStorage.getItem('bracu_user_email');
    if (!email) {
        showToast('Sign in with your G-Suite email first.', 'error');
        return;
    }

    currentCommunityReviewTarget = {
        targetType,
        targetId: Number(targetId),
        facultyName: facultyName || 'Faculty'
    };

    selectedReviewTags = {};
    communityChipGroupsEl?.querySelectorAll('.choice-chip').forEach(btn => btn.classList.remove('active'));

    if (communityReviewTitle) communityReviewTitle.textContent = `Review ${facultyName || 'Faculty'}`;
    if (communityReviewCourseCode) communityReviewCourseCode.value = normalizeCourseCode(courseCode || currentCourseCode || '');

    [communityTeachingSlider, communityMarkingSlider, communityBehaviorSlider].forEach(slider => {
        if (slider) slider.value = 5;
    });
    updateCommunitySliderLabels();

    if (communityPersonalNote) communityPersonalNote.value = '';
    if (communityNoteCounter) {
        communityNoteCounter.textContent = '0 / 500';
        communityNoteCounter.className = 'char-count';
    }

    openSheet(communityReviewBackdrop);
}

window.openCommunityReviewModal = openCommunityReviewModal;

function closeCommunityReviewModal() {
    closeSheet(communityReviewBackdrop);
    currentCommunityReviewTarget = null;
}

communityReviewCloseBtn?.addEventListener('click', closeCommunityReviewModal);
communityReviewBackdrop?.addEventListener('click', e => {
    if (e.target === communityReviewBackdrop) closeCommunityReviewModal();
});

function updateCommunitySliderLabels() {
    if (communityTeachingValue && communityTeachingSlider) communityTeachingValue.textContent = parseFloat(communityTeachingSlider.value).toFixed(1);
    if (communityMarkingValue && communityMarkingSlider) communityMarkingValue.textContent = parseFloat(communityMarkingSlider.value).toFixed(1);
    if (communityBehaviorValue && communityBehaviorSlider) communityBehaviorValue.textContent = parseFloat(communityBehaviorSlider.value).toFixed(1);
}

[communityTeachingSlider, communityMarkingSlider, communityBehaviorSlider].forEach(slider => {
    slider?.addEventListener('input', updateCommunitySliderLabels);
});

communityPersonalNote?.addEventListener('input', e => {
    const len = e.target.value.length;
    if (communityNoteCounter) {
        communityNoteCounter.textContent = `${len} / 500`;
        communityNoteCounter.className = 'char-count' + (len > 500 ? ' err' : len > 0 ? ' ok' : '');
    }
});

submitCommunityReviewBtn?.addEventListener('click', async () => {
    const email = currentUser?.full_email || localStorage.getItem('bracu_user_email');
    const username = currentUser?.username || (email ? email.split('@')[0] : null);

    if (!email || !username || !currentCommunityReviewTarget) {
        showToast('Session expired. Try again.', 'error');
        closeCommunityReviewModal();
        return;
    }

    const code = normalizeCourseCode(communityReviewCourseCode?.value || '');
    if (!isValidCourseCode(code)) {
        showToast('Enter course code like CSE220.', 'error');
        return;
    }

    const teaching = parseFloat(communityTeachingSlider?.value || 5);
    const marking = parseFloat(communityMarkingSlider?.value || 5);
    const behavior = parseFloat(communityBehaviorSlider?.value || 5);
    const note = String(communityPersonalNote?.value || '').trim();

    if (note.length > 500) {
        showToast('Personal note is too long.', 'error');
        return;
    }

    const labels = flattenSelectedTagLabels(selectedReviewTags);
    const generated = generateCommunitySummary({ selected: selectedReviewTags, labels, teaching, marking, behavior, note });

    submitCommunityReviewBtn.disabled = true;
    submitCommunityReviewBtn.textContent = 'Submitting...';

    const target = currentCommunityReviewTarget;
    const beforeStats = target?.targetType === 'community'
        ? await getCommunityReviewStats('community', target.targetId, null).catch(() => ({ count: 0 }))
        : await getCommunityReviewStats('archive', null, target?.targetId).catch(() => ({ count: 0 }));

    try {
        const { error } = await _supabase.rpc('submit_community_faculty_review', {
            p_target_type: target.targetType,
            p_community_faculty_id: target.targetType === 'community' ? target.targetId : null,
            p_archive_faculty_id: target.targetType === 'archive' ? target.targetId : null,
            p_student_email: email,
            p_username: username,
            p_course_code: code,
            p_teaching_rating: teaching,
            p_marking_rating: marking,
            p_behavior_rating: behavior,
            p_selected_tags: selectedReviewTags,
            p_tag_labels: labels,
            p_generated_summary: generated,
            p_personal_note: note || null
        });

        if (error) throw error;

        await logActivity('community_review_create', {
            target_type: target.targetType === 'archive' ? 'faculty' : 'community_faculty',
            target_id: target.targetId,
            event_label: target.facultyName,
            metadata: { course_code: code, source: 'community_review' }
        });

        const afterStats = target.targetType === 'community'
            ? await getCommunityReviewStats('community', target.targetId, null).catch(() => ({ count: Number(beforeStats?.count || 0) + 1 }))
            : await getCommunityReviewStats('archive', null, target.targetId).catch(() => ({ count: Number(beforeStats?.count || 0) + 1 }));
        const beforeCount = Number(beforeStats?.count || 0);
        const afterCount = Number(afterStats?.count || beforeCount + 1);
        const firstReview = beforeCount === 0;
        const verdictUnlocked = target.targetType === 'community' && beforeCount < COMMUNITY_REVIEW_TARGET_COUNT && afterCount >= COMMUNITY_REVIEW_TARGET_COUNT;
        const noteBonus = !!note;
        const xpLines = [
            { label: 'Review submitted', points: 10 },
            ...(noteBonus ? [{ label: 'Personal note bonus', points: 3 }] : []),
            ...(target.targetType === 'community' && firstReview ? [{ label: 'First review bonus', points: 25 }] : []),
            ...(verdictUnlocked ? [{ label: 'Community Verdict unlock', points: 50 }] : [])
        ];

        const remainingReviews = Math.max(COMMUNITY_REVIEW_TARGET_COUNT - afterCount, 0);
        let receiptTitle = 'Review added.';
        let receiptMessage = `Your review is now live under ${target.facultyName || 'this faculty'}.`;
        if (target.targetType === 'community') {
            receiptTitle = verdictUnlocked ? 'Community Verdict unlocked.' : firstReview ? 'First review added.' : 'Review added.';
            receiptMessage = verdictUnlocked
                ? `Your review completed the ${COMMUNITY_REVIEW_TARGET_COUNT}-review threshold. Overall review is now unlocked.`
                : `${target.facultyName || 'This page'} now has ${afterCount}/${COMMUNITY_REVIEW_TARGET_COUNT} reviews. ${remainingReviews ? `${remainingReviews} more unlock Community Verdict.` : 'Community Verdict is ready.'}`;
        }

        closeCommunityReviewModal();
        showImpactReceipt({
            title: receiptTitle,
            eyebrow: target.facultyName || 'Review submitted',
            message: receiptMessage,
            xpLines,
            footer: 'You helped juniors choose with less confusion.'
        });
        refreshProfileChipOnly();

        if (target.targetType === 'archive') {
            const f = allFaculty.find(x => Number(x.id) === Number(target.targetId));
            if (f) setTimeout(() => displayFaculty(f, true), 350);
        } else {
            await loadFacultyData();
            const f = allCommunityFaculty.find(x => Number(x.id) === Number(target.targetId));
            if (f) setTimeout(() => displayCommunityFaculty(f, true), 350);
        }

    } catch (err) {
        console.error('community review error:', err);
        showToast(err.message || 'Failed. Try again.', 'error');
    } finally {
        submitCommunityReviewBtn.disabled = false;
        submitCommunityReviewBtn.textContent = 'Submit Review';
    }
});

function valuesForGroup(selected, group) {
    return Array.isArray(selected?.[group]) ? selected[group] : [];
}

function phrasesForGroup(selected, group, limit = 3) {
    return valuesForGroup(selected, group)
        .map(v => COMMUNITY_TAG_PHRASES[v] || (COMMUNITY_TAG_LABELS[v] || v).toLowerCase())
        .filter(Boolean)
        .slice(0, limit);
}

function humanJoin(items) {
    const arr = (items || []).filter(Boolean);
    if (!arr.length) return '';
    if (arr.length === 1) return arr[0];
    if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
    return `${arr.slice(0, -1).join(', ')}, and ${arr[arr.length - 1]}`;
}

function generateCommunitySummary({ selected, labels, teaching: teachingRating, marking: markingRating, behavior: behaviorRating }) {
    const parts = [];
    const avg = (Number(teachingRating) + Number(markingRating) + Number(behaviorRating)) / 3;

    if (avg >= 8) {
        parts.push('Overall, this review gives a strong positive signal.');
    } else if (avg >= 6.5) {
        parts.push('Overall, this review sounds mostly positive with some context needed.');
    } else if (avg >= 5) {
        parts.push('Overall, this review feels mixed — not a blind yes, not a hard no.');
    } else {
        parts.push('Overall, this review sends a risky signal for students choosing before advising.');
    }

    const vibe = humanJoin(phrasesForGroup(selected, 'overall_vibe', 2));
    const cg = humanJoin(phrasesForGroup(selected, 'cg_impact', 2));
    const markingSignal = humanJoin(phrasesForGroup(selected, 'marking_reality', 2));
    const teachingStyle = humanJoin(phrasesForGroup(selected, 'teaching_style', 2));
    const quiz = humanJoin(phrasesForGroup(selected, 'quiz_assignment', 2));
    const behaviorSignal = humanJoin(phrasesForGroup(selected, 'behavior_access', 2));

    if (vibe) parts.push(`Vibe-wise, the student felt ${vibe}.`);
    if (cg || markingSignal) {
        const chunks = [];
        if (cg) chunks.push(`CG-wise, the CGPA read is ${cg}`);
        if (markingSignal) chunks.push(`marking-wise, they noticed ${markingSignal}`);
        parts.push(`${chunks.join('; ')}.`);
    }
    if (teachingStyle || quiz) {
        const chunks = [];
        if (teachingStyle) chunks.push(`Teaching feels like ${teachingStyle}`);
        if (quiz) chunks.push(`quiz/assignment pattern looks like ${quiz}`);
        parts.push(`${chunks.join('; ')}.`);
    }
    if (behaviorSignal) parts.push(`Behavior/access-wise, they experienced ${behaviorSignal}.`);

    if (!labels.length) {
        parts.push('No chips were selected, so this review mainly reflects the three ratings.');
    }

    return parts.slice(0, 5).join(' ');
}

function summarizeTopGroup(reviews, groupId, limit = 3) {
    const counts = {};
    (reviews || []).forEach(r => {
        const values = valuesForGroup(r.selected_tags || {}, groupId);
        values.forEach(v => {
            counts[v] = (counts[v] || 0) + 1;
        });
    });

    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
        .slice(0, limit)
        .map(([value, count]) => ({
            value,
            count,
            label: COMMUNITY_TAG_LABELS[value] || value,
            phrase: COMMUNITY_TAG_PHRASES[value] || (COMMUNITY_TAG_LABELS[value] || value).toLowerCase()
        }));
}

function generateCommunityVerdict(reviews, stats) {
    const count = Number(stats?.count || reviews?.length || 0);

    if (count < COMMUNITY_REVIEW_TARGET_COUNT) {
        return {
            title: 'Community Review',
            text: 'Ei page ta old archive e chilo na. 5 ta student review collect hole ekhaneo overall review unlock hobe.'
        };
    }

    const vibe = summarizeTopGroup(reviews, 'overall_vibe', 2);
    const cg = summarizeTopGroup(reviews, 'cg_impact', 2);
    const marking = summarizeTopGroup(reviews, 'marking_reality', 2);
    const teaching = summarizeTopGroup(reviews, 'teaching_style', 2);
    const quiz = summarizeTopGroup(reviews, 'quiz_assignment', 2);
    const behavior = summarizeTopGroup(reviews, 'behavior_access', 2);

    const sentences = [];
    const avgTeaching = Number(stats?.avgTeaching || 0);
    const avgMarking = Number(stats?.avgMarking || 0);
    const avgBehavior = Number(stats?.avgBehavior || 0);
    const overallAvg = (avgTeaching + avgMarking + avgBehavior) / 3;

    let opening = `Based on ${count} BRACU student reviews, `;
    if (overallAvg >= 8) opening += 'the community verdict looks strongly positive.';
    else if (overallAvg >= 6.5) opening += 'the community signal looks mostly positive, with some context.';
    else if (overallAvg >= 5) opening += 'the community signal looks mixed, so students should read the details.';
    else opening += 'the community signal looks risky for students choosing before advising.';
    sentences.push(opening);

    const vibeText = humanJoin(vibe.map(x => x.phrase));
    const cgText = humanJoin(cg.map(x => x.phrase));
    if (vibeText || cgText) {
        const parts = [];
        if (vibeText) parts.push(`overall vibe leans toward ${vibeText}`);
        if (cgText) parts.push(`CG-wise, students repeatedly signal ${cgText}`);
        sentences.push(parts.join('; ') + '.');
    }

    const markingText = humanJoin(marking.map(x => x.phrase));
    const teachingText = humanJoin(teaching.map(x => x.phrase));
    if (markingText || teachingText) {
        const parts = [];
        if (markingText) parts.push(`Marking pattern points to ${markingText}`);
        if (teachingText) parts.push(`teaching pattern points to ${teachingText}`);
        sentences.push(parts.join('; ') + '.');
    }

    const quizText = humanJoin(quiz.map(x => x.phrase));
    const behaviorText = humanJoin(behavior.map(x => x.phrase));
    if (quizText || behaviorText) {
        const parts = [];
        if (quizText) parts.push(`For quizzes/assignments, students mention ${quizText}`);
        if (behaviorText) parts.push(`behavior/access-wise, students mention ${behaviorText}`);
        sentences.push(parts.join('; ') + '.');
    }

    if (sentences.length < 2) {
        sentences.push('The ratings are available, but students have not selected enough detailed chips yet to build a deeper pattern.');
    }

    return {
        title: 'Community Verdict',
        text: sentences.slice(0, 4).join(' ')
    };
}

async function handleCommunityShareLink(id) {
    const url = `${location.origin}${location.pathname}?communityFaculty=${id}`;
    try {
        await navigator.clipboard.writeText(url);
        showToast('Request link copied!', 'success');
        await logActivity('share_link', {
            target_type: 'community_faculty',
            target_id: id,
            event_label: 'community faculty ' + id,
            metadata: { url }
        });
    } catch {
        showToast('Copy failed', 'error');
    }
}

window.handleCommunityShareLink = handleCommunityShareLink;

// Override URL params: support old archive links and new community links.
function checkUrlParams() {
    const params = new URLSearchParams(location.search);
    const archiveId = params.get('reviewFaculty');
    const communityId = params.get('communityFaculty');

    if (!archiveId && !communityId) return;

    const checkInterval = setInterval(() => {
        if (archiveId) {
            if (!allFaculty.length) return;
            const f = allFaculty.find(x => Number(x.id) === Number(archiveId));
            if (f) {
                clearInterval(checkInterval);
                displayFaculty(f, false);
            }
        }

        if (communityId) {
            if (!allCommunityFaculty.length) return;
            const f = allCommunityFaculty.find(x => Number(x.id) === Number(communityId));
            if (f) {
                clearInterval(checkInterval);
                displayCommunityFaculty(f, false);
            }
        }
    }, 100);

    setTimeout(() => clearInterval(checkInterval), 6000);
}

document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeSheet(addFacultyBackdrop);
    closeSheet(communityReviewBackdrop);
});

/* ════════════════════════════════════════════════
   v0.3 PRIVATE CONTRIBUTOR PROFILE + AURA
   Reddit-like identity layer, kept private and product-focused.
   ════════════════════════════════════════════════ */

var currentContributorProfile = null;
var currentProfilePayload = null;
var myCommunityReviewReactions = {};
var myProfileReviewMap = {};

// Override the original profile upsert so every soft-login also creates/refreshes
// the private contributor profile. Function declarations are hoisted, so handleAuth()
// will use this version even though it appears later in the file.
async function upsertProfile(username, full_email) {
    await _supabase.rpc('upsert_student_profile', {
        p_username: username,
        p_full_email: full_email
    });

    try {
        await ensureContributorProfile(username, full_email);
    } catch (err) {
        console.warn('ensureContributorProfile failed:', err.message || err);
    }
}

async function ensureContributorProfile(username, fullEmail) {
    if (!username || !fullEmail) return null;

    const { data, error } = await _supabase.rpc('ensure_student_contributor_profile', {
        p_username: username,
        p_full_email: fullEmail
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
        currentContributorProfile = row;
        updateProfileChip(row);
    }

    return row || null;
}

function getCurrentEmailAndUsername() {
    const email = currentUser?.full_email || localStorage.getItem('bracu_user_email') || '';
    const username = currentUser?.username || (email ? email.split('@')[0] : '') || '';
    return { email, username };
}

function stableAvatarIndex(seed) {
    const value = String(seed || 'bracu-student');
    let hash = 0;

    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }

    return Math.abs(hash % 7) + 1;
}

function updateProfileChip(profile) {
    const chip = document.getElementById('profileChip');
    const avatar = document.getElementById('profileAvatar');
    const badge = document.getElementById('profileUnreadBadge');

    if (!chip) return;

    if (!profile) {
        chip.style.display = 'none';
        return;
    }

    const handle = profile.anonymous_handle || 'Your profile';
    const avatarIndex = stableAvatarIndex(handle || profile.username || profile.full_email);

    chip.style.display = 'inline-flex';
    chip.title = handle;
    chip.setAttribute('aria-label', `Open your profile: ${handle}`);

    if (avatar) {
        avatar.src = `assets/profile-avatars/avatar-${avatarIndex}.svg`;
    }

    const unread = Number(profile.unread_notifications || 0);
    if (badge) {
        badge.textContent = unread > 9 ? '9+' : String(unread);
        badge.style.display = unread > 0 ? 'inline-flex' : 'none';
    }
}

async function refreshProfileChipOnly() {
    const { email, username } = getCurrentEmailAndUsername();
    if (!email || !username) return;
    try {
        await ensureContributorProfile(username, email);
    } catch (err) {
        console.warn('refreshProfileChipOnly:', err.message || err);
    }
}

async function loadContributorProfile() {
    const { email, username } = getCurrentEmailAndUsername();
    if (!email || !username) throw new Error('Session expired. Sign in again.');

    const { data, error } = await _supabase.rpc('get_my_contributor_profile', {
        p_username: username,
        p_full_email: email
    });

    if (error) throw error;

    currentProfilePayload = data || {};
    currentContributorProfile = currentProfilePayload.profile || currentContributorProfile;
    updateProfileChip({
        ...(currentContributorProfile || {}),
        unread_notifications: currentProfilePayload?.stats?.unread_notifications || 0
    });
    buildProfileReviewMap();
    return currentProfilePayload;
}

function buildProfileReviewMap() {
    myProfileReviewMap = {};
    const reviews = currentProfilePayload?.reviews || [];
    reviews.forEach(r => {
        myProfileReviewMap[Number(r.id)] = r;
    });
}

function showImpactReceipt({ title, eyebrow, message, xpLines = [], footer = '' }) {
    let el = document.getElementById('impactReceipt');
    if (!el) {
        el = document.createElement('div');
        el.id = 'impactReceipt';
        el.className = 'impact-receipt-wrap';
        document.body.appendChild(el);
    }

    const total = xpLines.reduce((sum, x) => sum + Number(x.points || 0), 0);
    el.innerHTML = `
        <div class="impact-receipt-card" role="status" aria-live="polite">
            <button type="button" class="impact-close" aria-label="Close" onclick="closeImpactReceipt()">×</button>
            <div class="impact-orb"><span>Aura</span></div>
            <div class="impact-content">
                ${eyebrow ? `<div class="impact-eyebrow">${escHtml(eyebrow)}</div>` : ''}
                <div class="impact-title">${escHtml(title || 'Update saved.')}</div>
                ${message ? `<div class="impact-message">${escHtml(message)}</div>` : ''}
                ${xpLines.length ? `
                    <div class="impact-xp-list">
                        ${xpLines.map(x => `
                            <div class="impact-xp-row">
                                <span>${escHtml(x.label || 'XP')}</span>
                                <strong>+${Number(x.points || 0)} Aura</strong>
                            </div>
                        `).join('')}
                    </div>
                    <div class="impact-total">+${total} Aura</div>
                ` : ''}
                ${footer ? `<div class="impact-footer">${escHtml(footer)}</div>` : ''}
            </div>
        </div>
    `;
    requestAnimationFrame(() => el.classList.add('show'));

    clearTimeout(window.__impactReceiptTimer);
    window.__impactReceiptTimer = setTimeout(closeImpactReceipt, 7600);
}

function closeImpactReceipt() {
    const el = document.getElementById('impactReceipt');
    if (!el) return;
    el.classList.remove('show');
}

window.closeImpactReceipt = closeImpactReceipt;

function profileLoadingHTML() {
    return `
        <div class="profile-loading profile-loading--premium">
            <div class="profile-loader-avatar">
                <span></span>
                <i></i>
            </div>
            <div class="profile-loader-copy">Opening your profile</div>
            <div class="profile-loader-sub">Loading your private stats, pages, and notifications...</div>
            <div class="profile-loader-bars">
                <b></b><b></b><b></b>
            </div>
        </div>
    `;
}

function openProfileSheet() {
    const backdrop = document.getElementById('profileBackdrop');
    const body = document.getElementById('profileSheetBody');
    if (!backdrop || !body) return;

    if (currentProfilePayload) {
        renderProfileSheet(currentProfilePayload);
    } else {
        body.innerHTML = profileLoadingHTML();
    }
    openSheet(backdrop);

    loadContributorProfile()
        .then(payload => {
            renderProfileSheet(payload);
            markNotificationsReadSoon();
        })
        .catch(err => {
            body.innerHTML = `<div class="profile-empty-mini">${escHtml(err.message || 'Could not load profile.')}</div>`;
        });
}

window.openProfileSheet = openProfileSheet;

document.getElementById('profileChip')?.addEventListener('click', openProfileSheet);
document.getElementById('profileCloseBtn')?.addEventListener('click', () => closeSheet(document.getElementById('profileBackdrop')));
document.getElementById('profileBackdrop')?.addEventListener('click', e => {
    if (e.target === document.getElementById('profileBackdrop')) {
        closeSheet(document.getElementById('profileBackdrop'));
    }
});

function profileXpCard(xp) {
    const info = getXpLevelInfo(xp);
    const nextLine = info.next ? `${info.toNext} Aura to ${info.next.rank}` : 'Max rank reached';
    return `
        <button type="button" class="profile-xp-card profile-xp-card--button" aria-label="Open Aura details" onclick="openAdvisingXpDetails()">
            <div class="profile-xp-ring" style="--xp-progress:${info.progress}%">
                <span>${info.xp}</span>
            </div>
            <div class="profile-xp-info">
                <div class="profile-xp-label">Aura</div>
                <div class="profile-xp-rank">Level ${info.current.level} · ${escHtml(info.current.rank)}</div>
                <div class="profile-xp-level">${escHtml(nextLine)}</div>
                <div class="profile-xp-mini-track"><i style="width:${info.progress}%"></i></div>
            </div>
            <span class="profile-xp-open">→</span>
        </button>
    `;
}

function openAdvisingXpDetails() {
    const area = document.getElementById('profileDrilldownArea');
    if (!area || !currentProfilePayload) return;

    const profile = currentProfilePayload.profile || {};
    const stats = currentProfilePayload.stats || {};
    const info = getXpLevelInfo(profile.advising_xp || 0);

    area.innerHTML = `
        <div class="profile-section profile-drilldown-card xp-detail-card aura-detail-card">
            <div class="profile-section-head">
                <div>
                    <div class="profile-section-title">Aura</div>
                    <div class="xp-detail-sub">Your private contribution trail</div>
                </div>
                <button type="button" class="profile-mini-action" onclick="closeProfileDrilldown()">Hide</button>
            </div>

            <div class="xp-rank-hero">
                <div class="xp-rank-orb">${info.current.level}</div>
                <div class="xp-rank-copy">
                    <div class="xp-rank-title">${escHtml(info.current.rank)}</div>
                    <div class="xp-rank-meta">${info.xp} Aura · ${info.next ? `${info.toNext} Aura to ${escHtml(info.next.rank)}` : 'Max rank reached'}</div>
                    <div class="xp-rank-track"><i style="width:${info.progress}%"></i></div>
                </div>
            </div>

            <div class="xp-next-unlock aura-meaning-box">
                <span>What Aura means</span>
                <strong>Aura tracks how much you have helped the BRACU advising map — reviews, missing pages, useful searches, and community feedback all add to your trail.</strong>
            </div>

            <div class="xp-next-unlock aura-future-box">
                <span>Future use</span>
                <strong>As this grows beyond faculty reviews, higher Aura may help unlock early access and trust privileges for upcoming BRACU tools like course planning and teammate discovery.</strong>
            </div>

            <div class="xp-next-unlock aura-current-box">
                <span>Current rank meaning</span>
                <strong>${escHtml(info.current.meaning || 'Your contribution profile is growing.')}</strong>
            </div>

            <div class="xp-level-path">
                ${ADVISING_XP_LEVELS.map(l => `
                    <div class="xp-level-node ${l.level === info.current.level ? 'active' : ''} ${info.xp >= l.xp ? 'done' : ''}">
                        <span>${l.level}</span>
                        <b>${escHtml(l.rank)}</b>
                        <em>${l.xp} Aura</em>
                    </div>
                `).join('')}
            </div>

            <div class="xp-impact-grid">
                <div><strong>${Number(stats.community_reviews || 0)}</strong><span>reviews added</span></div>
                <div><strong>${Number(stats.faculty_pages_added || 0)}</strong><span>pages started</span></div>
                <div><strong>${Number(stats.helpful_received || 0)}</strong><span>agrees received</span></div>
                <div><strong>${Number(stats.verdicts_unlocked || 0)}</strong><span>verdicts unlocked</span></div>
            </div>
        </div>
    `;
}

function profileBountyItem(b) {
    const title = b.faculty_label || b.query || 'Faculty';
    const progress = Math.min(100, (Number(b.review_count || 0) / COMMUNITY_REVIEW_TARGET_COUNT) * 100);
    const line = b.type === 'almost_unlocked'
        ? `${Number(b.review_count || 0)}/${COMMUNITY_REVIEW_TARGET_COUNT} signals · almost unlocked`
        : `${Number(b.unique_students || 0)} lost search${Number(b.unique_students || 0) === 1 ? '' : 'es'} · missing page`;
    return `
        <button type="button" class="xp-bounty-item" onclick="openBountyTarget('${safeAttr(b.type || '')}', '${safeAttr(title)}', ${Number(b.community_faculty_id || 0)})">
            <div>
                <strong>${escHtml(title)}</strong>
                <span>${escHtml(line)}</span>
                <i style="width:${progress}%"></i>
            </div>
            <b>+${Number(b.xp_reward || 0)} Aura</b>
        </button>
    `;
}

function profileXpHistoryItem(e) {
    return `
        <div class="xp-history-item">
            <div>
                <strong>${escHtml(e.reason_label || e.reason || 'Aura update')}</strong>
                <span>${escHtml(timeAgo(e.created_at))}</span>
            </div>
            <b>${Number(e.points || 0) > 0 ? '+' : ''}${Number(e.points || 0)} Aura</b>
        </div>
    `;
}

function openBountyTarget(type, label, communityId) {
    if (type === 'almost_unlocked' && communityId) {
        openAddedPageFromProfile(Number(communityId));
        return;
    }
    closeSheet(document.getElementById('profileBackdrop'));
    searchInput.value = label;
    handleFacultySearch(label);
}

window.openAdvisingXpDetails = openAdvisingXpDetails;
window.openBountyTarget = openBountyTarget;


function renderProfileSheet(payload) {
    const body = document.getElementById('profileSheetBody');
    if (!body) return;

    const profile = payload?.profile || {};
    const stats = payload?.stats || {};
    const notifications = Array.isArray(payload?.notifications) ? payload.notifications : [];

    const completion = Number(profile.profile_completion || (profile.is_email_verified ? 100 : 50));
    const firstName = profile.first_name_guess || 'there';
    const xp = Number(profile.advising_xp || 0);
    const visible = !!profile.handle_visible_public;

    body.innerHTML = `
        <div class="profile-hero">
            <div class="profile-kicker">Hi ${escHtml(firstName)} · private profile</div>
            <div class="profile-handle-row">
                <div>
                    <div class="profile-handle">${escHtml(profile.anonymous_handle || 'Anonymous Student')}</div>
                    <div class="profile-email">${escHtml(profile.full_email || '')}</div>
                </div>
                ${profileXpCard(xp)}
            </div>

            <div class="profile-safety">
                <div class="profile-safety-head">
                    <span>Profile Safety</span>
                    <span>${completion}%</span>
                </div>
                <div class="profile-safety-track"><div class="profile-safety-fill" style="width:${Math.max(0, Math.min(completion, 100))}%"></div></div>
                <div class="profile-safety-copy">
                    ${profile.is_email_verified
                        ? 'Verified BRACU contributor. Your reviews are secured under this profile.'
                        : 'Your profile is private now. Gmail code verification will arrive in the next update — no action needed.'}
                </div>
                ${profile.is_email_verified ? '' : `
                    <div class="verify-soon-box">
                        <strong>Verification coming next.</strong><br>
                        You are safe for now: reviews stay anonymous, and your Gmail is only visible to you.
                    </div>
                `}
            </div>
        </div>

        <div class="profile-stat-grid profile-stat-grid--clickable">
            ${profileStat(stats.community_reviews || 0, 'Reviews', 'reviews')}
            ${profileStat(stats.helpful_received || 0, 'Agrees', 'helpful')}
            ${profileStat(stats.faculty_pages_added || 0, 'Pages Added', 'pages')}
        </div>

        <div id="profileDrilldownArea" class="profile-drilldown-area">
            <div class="profile-empty-mini profile-tap-hint">Tap Reviews, Agrees, Pages Added, or Aura to see the actual history.</div>
        </div>

        <div class="profile-switch-row">
            <div>
                <div class="profile-switch-title">Show anonymous handle on reviews</div>
                <div class="profile-switch-sub">Default is private. Turn this on only if you want reviews to show ${escHtml(profile.anonymous_handle || 'your handle')} instead of Anonymous BRACU Student.</div>
            </div>
            <button type="button" class="tiny-switch ${visible ? 'active' : ''}" id="handleVisibilitySwitch" aria-label="Toggle handle visibility"></button>
        </div>

        <div class="profile-section">
            <div class="profile-section-head">
                <div class="profile-section-title">Notifications</div>
                <div class="profile-section-actions">
                    <div class="profile-section-title">${notifications.length}</div>
                    ${notifications.length ? `<button type="button" class="profile-mini-action" onclick="clearProfileNotifications()">Clear</button>` : ''}
                </div>
            </div>
            <div class="profile-list" id="profileNotificationList">
                ${notifications.length ? notifications.map(profileNotificationItem).join('') : `<div class="profile-empty-mini">No notifications yet. Agree reactions and Aura updates will appear here.</div>`}
            </div>
        </div>
    `;

    document.getElementById('handleVisibilitySwitch')?.addEventListener('click', toggleHandleVisibility);
}

function profileStat(num, label, kind) {
    return `
        <button type="button" class="profile-stat-card profile-stat-card--button" onclick="openProfileDrilldown('${escHtml(kind)}')">
            <div class="profile-stat-num">${escHtml(String(num))}</div>
            <div class="profile-stat-label">${escHtml(label)}</div>
        </button>
    `;
}

async function loadMyAddedPagesFallback() {
    const { email, username } = getCurrentEmailAndUsername();
    if (!email || !username) return [];

    try {
        const { data, error } = await _supabase.rpc('get_my_added_pages', {
            p_username: username,
            p_full_email: email
        });
        if (error) throw error;
        const pages = Array.isArray(data) ? data : [];
        if (currentProfilePayload) currentProfilePayload.pages_added = pages;
        return pages;
    } catch (err) {
        console.warn('loadMyAddedPagesFallback:', err.message || err);
        return [];
    }
}

function renderProfileDrilldown(kind, pagesOverride = null) {
    const area = document.getElementById('profileDrilldownArea');
    if (!area) return;

    const reviews = Array.isArray(currentProfilePayload?.reviews) ? currentProfilePayload.reviews : [];
    const pages = Array.isArray(pagesOverride)
        ? pagesOverride
        : Array.isArray(currentProfilePayload?.pages_added) ? currentProfilePayload.pages_added : [];
    const helpfulReviews = Array.isArray(currentProfilePayload?.helpful_reviews)
        ? currentProfilePayload.helpful_reviews
        : reviews.filter(r => Number(r.helpful_count || 0) > 0);

    let title = 'Details';
    let count = 0;
    let content = '';

    if (kind === 'reviews') {
        title = 'Your Reviews';
        count = reviews.length;
        content = reviews.length
            ? reviews.map(profileReviewItem).join('')
            : `<div class="profile-empty-mini">No community reviews yet. Add one review and this becomes your contribution history.</div>`;
    } else if (kind === 'helpful') {
        title = 'Reviews People Agreed With';
        count = helpfulReviews.length;
        content = helpfulReviews.length
            ? helpfulReviews.map(profileHelpfulItem).join('')
            : `<div class="profile-empty-mini">No agree reactions yet. When students agree with your reviews, those reviews will appear here.</div>`;
    } else if (kind === 'pages') {
        title = 'Pages You Added';
        count = pages.length;
        content = pages.length
            ? pages.map(profilePageItem).join('')
            : `<div class="profile-empty-mini">No faculty pages added yet. Add a missing faculty and it will appear here.</div>`;
    }

    area.innerHTML = `
        <div class="profile-section profile-drilldown-card">
            <div class="profile-section-head">
                <div class="profile-section-title">${escHtml(title)}</div>
                <div class="profile-section-actions">
                    <div class="profile-section-title">${count}</div>
                    <button type="button" class="profile-mini-action" onclick="closeProfileDrilldown()">Hide</button>
                </div>
            </div>
            <div class="profile-list">${content}</div>
        </div>
    `;
}

async function openProfileDrilldown(kind) {
    const area = document.getElementById('profileDrilldownArea');
    if (!area) return;

    if (kind === 'pages') {
        const existingPages = Array.isArray(currentProfilePayload?.pages_added) ? currentProfilePayload.pages_added : [];
        const expectedCount = Number(currentProfilePayload?.stats?.faculty_pages_added || 0);

        if (expectedCount > 0 && existingPages.length === 0) {
            area.innerHTML = `
                <div class="profile-section profile-drilldown-card">
                    <div class="profile-section-head">
                        <div class="profile-section-title">Pages You Added</div>
                        <button type="button" class="profile-mini-action" onclick="closeProfileDrilldown()">Hide</button>
                    </div>
                    <div class="profile-empty-mini">Finding the pages you started...</div>
                </div>
            `;
            const pages = await loadMyAddedPagesFallback();
            renderProfileDrilldown(kind, pages);
            return;
        }
    }

    renderProfileDrilldown(kind);
}

function closeProfileDrilldown() {
    const area = document.getElementById('profileDrilldownArea');
    if (!area) return;
    area.innerHTML = `<div class="profile-empty-mini profile-tap-hint">Tap Reviews, Agrees, Pages Added, or Aura to see the actual history.</div>`;
}

window.openProfileDrilldown = openProfileDrilldown;
window.closeProfileDrilldown = closeProfileDrilldown;

function profileReviewItem(r) {
    const title = r.faculty_label || r.faculty_initial || 'Faculty';
    const helpful = Number(r.helpful_count || 0);
    const notUseful = Number(r.not_useful_count || 0);
    const summary = r.generated_summary || r.personal_note || 'Structured review saved.';

    return `
        <div class="profile-review-item profile-history-item">
            <button type="button" class="profile-history-main" onclick="openReviewTargetFromProfile(${Number(r.id)})">
                <div class="profile-review-top">
                    <div class="profile-review-title">${escHtml(title)} ${r.course_code ? `· ${escHtml(r.course_code)}` : ''}</div>
                    <span class="profile-history-arrow">→</span>
                </div>
                <div class="profile-review-meta">${helpful} agree · ${notUseful} disagree · updated ${escHtml(timeAgo(r.updated_at || r.created_at))}</div>
                <div class="profile-review-summary">${escHtml(summary).slice(0, 180)}${summary.length > 180 ? '...' : ''}</div>
            </button>
            <div class="profile-item-actions">
                <button class="pill-btn" style="padding:6px 10px;font-size:11px;" onclick="editMyCommunityReview(${Number(r.id)})">Edit Review</button>
            </div>
        </div>
    `;
}

function profileHelpfulItem(r) {
    const title = r.faculty_label || r.faculty_initial || 'Faculty';
    const helpful = Number(r.helpful_count || 0);
    const summary = r.generated_summary || r.personal_note || 'Structured review saved.';

    return `
        <div class="profile-review-item profile-history-item">
            <button type="button" class="profile-history-main" onclick="openReviewTargetFromProfile(${Number(r.id)})">
                <div class="profile-review-top">
                    <div class="profile-review-title">${escHtml(title)} ${r.course_code ? `· ${escHtml(r.course_code)}` : ''}</div>
                    <span class="profile-history-arrow">→</span>
                </div>
                <div class="profile-review-meta">${helpful} student${helpful === 1 ? '' : 's'} agreed with this review</div>
                <div class="profile-review-summary">${escHtml(summary).slice(0, 180)}${summary.length > 180 ? '...' : ''}</div>
            </button>
        </div>
    `;
}

function profilePageItem(page) {
    const name = page.faculty_name || page.faculty_initial || 'Faculty';
    const courses = Array.isArray(page.course_codes) ? page.course_codes.join(', ') : '';
    const reviews = Number(page.review_count || 0);

    return `
        <button type="button" class="profile-page-item profile-history-main" onclick="openAddedPageFromProfile(${Number(page.id)})">
            <div class="profile-review-top">
                <div class="profile-review-title">${escHtml(name)} ${page.faculty_initial ? `<span class="profile-mini-badge">${escHtml(page.faculty_initial)}</span>` : ''}</div>
                <span class="profile-history-arrow">→</span>
            </div>
            <div class="profile-review-meta">${courses ? escHtml(courses) + ' · ' : ''}${reviews} review${reviews === 1 ? '' : 's'} collected</div>
            ${page.department ? `<div class="profile-review-summary">${escHtml(page.department)}</div>` : ''}
        </button>
    `;
}

function profileNotificationItem(n) {
    const points = Number(n.points_delta || 0);
    return `
        <div class="profile-notification-item" data-notification-id="${Number(n.id)}" style="${n.is_read ? '' : 'border-color:var(--b3);'}">
            <div class="profile-notification-top">
                <div class="profile-notification-title">${escHtml(n.title || 'Update')}</div>
                <div class="profile-notification-actions">
                    ${points ? `<div class="profile-xp-delta">${points > 0 ? '+' : ''}${points} Aura</div>` : ''}
                    <button type="button" class="profile-delete-btn" aria-label="Delete notification" onclick="deleteProfileNotification(${Number(n.id)})">×</button>
                </div>
            </div>
            ${n.message ? `<div class="profile-notification-msg">${escHtml(n.message)}</div>` : ''}
            <div class="profile-notification-meta">${escHtml(timeAgo(n.created_at))}</div>
        </div>
    `;
}

async function deleteProfileNotification(notificationId) {
    const { email, username } = getCurrentEmailAndUsername();
    if (!email || !username) return;

    try {
        const { error } = await _supabase.rpc('delete_my_notification', {
            p_username: username,
            p_full_email: email,
            p_notification_id: Number(notificationId)
        });
        if (error) throw error;

        if (currentProfilePayload?.notifications) {
            currentProfilePayload.notifications = currentProfilePayload.notifications.filter(n => Number(n.id) !== Number(notificationId));
        }
        renderProfileSheet(currentProfilePayload);
        showToast('Notification deleted.', 'success');
        refreshProfileChipOnly();
    } catch (err) {
        showToast(err.message || 'Could not delete notification.', 'error');
    }
}

async function clearProfileNotifications() {
    const { email, username } = getCurrentEmailAndUsername();
    if (!email || !username) return;

    try {
        const { error } = await _supabase.rpc('clear_my_notifications', {
            p_username: username,
            p_full_email: email
        });
        if (error) throw error;

        if (currentProfilePayload) currentProfilePayload.notifications = [];
        renderProfileSheet(currentProfilePayload);
        showToast('Notifications cleared.', 'success');
        refreshProfileChipOnly();
    } catch (err) {
        showToast(err.message || 'Could not clear notifications.', 'error');
    }
}

window.deleteProfileNotification = deleteProfileNotification;
window.clearProfileNotifications = clearProfileNotifications;

function findProfileReview(reviewId) {
    const reviews = Array.isArray(currentProfilePayload?.reviews) ? currentProfilePayload.reviews : [];
    return reviews.find(r => Number(r.id) === Number(reviewId)) || myProfileReviewMap[Number(reviewId)] || null;
}

function openReviewTargetFromProfile(reviewId) {
    const r = findProfileReview(reviewId);
    if (!r) return;

    closeSheet(document.getElementById('profileBackdrop'));

    setTimeout(() => {
        if (r.target_type === 'archive') {
            const f = allFaculty.find(x => Number(x.id) === Number(r.archive_faculty_id));
            if (f) displayFaculty(f, false);
        } else {
            const f = allCommunityFaculty.find(x => Number(x.id) === Number(r.community_faculty_id));
            if (f) displayCommunityFaculty(f, false);
        }
    }, 220);
}

async function openAddedPageFromProfile(pageId) {
    closeSheet(document.getElementById('profileBackdrop'));

    setTimeout(async () => {
        let f = allCommunityFaculty.find(x => Number(x.id) === Number(pageId));
        if (!f) {
            try {
                const { data, error } = await _supabase
                    .from('community_faculty_profiles_public')
                    .select('*')
                    .eq('id', Number(pageId))
                    .maybeSingle();
                if (error) throw error;
                f = data;
            } catch (err) {
                console.warn('openAddedPageFromProfile:', err.message || err);
            }
        }

        if (f) {
            displayCommunityFaculty(f, false);
        } else {
            showToast('Could not open this page.', 'error');
        }
    }, 220);
}

window.openReviewTargetFromProfile = openReviewTargetFromProfile;
window.openAddedPageFromProfile = openAddedPageFromProfile;

async function markNotificationsReadSoon() {
    const { email, username } = getCurrentEmailAndUsername();
    if (!email || !username) return;

    setTimeout(async () => {
        try {
            await _supabase.rpc('mark_my_notifications_read', {
                p_username: username,
                p_full_email: email
            });
            if (currentContributorProfile) {
                currentContributorProfile.unread_notifications = 0;
                updateProfileChip(currentContributorProfile);
            }
        } catch (err) {
            console.warn('markNotificationsReadSoon:', err.message || err);
        }
    }, 900);
}

async function toggleHandleVisibility() {
    const { email, username } = getCurrentEmailAndUsername();
    if (!email || !username || !currentProfilePayload?.profile) return;

    const next = !currentProfilePayload.profile.handle_visible_public;
    const btn = document.getElementById('handleVisibilitySwitch');
    btn?.classList.toggle('active', next);

    try {
        const { error } = await _supabase.rpc('set_my_handle_visibility', {
            p_username: username,
            p_full_email: email,
            p_visible: next
        });
        if (error) throw error;
        currentProfilePayload.profile.handle_visible_public = next;
        showToast(next ? 'Anonymous handle can now appear on your reviews.' : 'Reviews are fully anonymous again.', 'success');
    } catch (err) {
        btn?.classList.toggle('active', !next);
        showToast(err.message || 'Could not update profile.', 'error');
    }
}

function editMyCommunityReview(reviewId) {
    const r = myProfileReviewMap[Number(reviewId)];
    if (!r) {
        showToast('Review not found in profile.', 'error');
        return;
    }

    const backdrop = document.getElementById('profileBackdrop');
    closeSheet(backdrop);

    const targetId = r.target_type === 'archive' ? r.archive_faculty_id : r.community_faculty_id;
    const facultyName = r.faculty_label || r.faculty_initial || 'Faculty';

    setTimeout(() => {
        openCommunityReviewModal(r.target_type, targetId, facultyName, r.course_code || '');

        setTimeout(() => {
            if (communityTeachingSlider) communityTeachingSlider.value = r.teaching_rating || 5;
            if (communityMarkingSlider) communityMarkingSlider.value = r.marking_rating || 5;
            if (communityBehaviorSlider) communityBehaviorSlider.value = r.behavior_rating || 5;
            updateCommunitySliderLabels();

            if (communityPersonalNote) communityPersonalNote.value = r.personal_note || '';
            if (communityNoteCounter) {
                const len = (r.personal_note || '').length;
                communityNoteCounter.textContent = `${len} / 500`;
                communityNoteCounter.className = 'char-count' + (len > 0 ? ' ok' : '');
            }

            selectedReviewTags = r.selected_tags || {};
            communityChipGroupsEl?.querySelectorAll('.choice-chip').forEach(btn => {
                const group = btn.dataset.group;
                const value = btn.dataset.value;
                if ((selectedReviewTags[group] || []).includes(value)) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }, 80);
    }, 250);
}

window.editMyCommunityReview = editMyCommunityReview;

// Override getCommunityReviews so public reviews include the user's own reaction state.
async function getCommunityReviews(targetType, targetId, limit = 100) {
    try {
        let q = _supabase
            .from('community_faculty_reviews_public')
            .select('*')
            .eq('target_type', targetType)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (targetType === 'archive') {
            q = q.eq('archive_faculty_id', targetId);
        } else {
            q = q.eq('community_faculty_id', targetId);
        }

        const { data, error } = await q;
        if (error) throw error;

        await hydrateMyCommunityReviewReactions();
        return data || [];
    } catch (err) {
        console.warn('getCommunityReviews:', err.message || err);
        return [];
    }
}

async function hydrateMyCommunityReviewReactions() {
    const { email, username } = getCurrentEmailAndUsername();
    if (!email || !username) return;

    try {
        const { data, error } = await _supabase.rpc('get_my_community_review_reactions', {
            p_username: username,
            p_full_email: email
        });
        if (error) throw error;

        myCommunityReviewReactions = {};
        (data || []).forEach(r => {
            myCommunityReviewReactions[Number(r.review_id)] = r.reaction_type;
        });
    } catch (err) {
        console.warn('hydrateMyCommunityReviewReactions:', err.message || err);
    }
}

// Override review card renderer to include Helpful / Not useful / Report.
function buildCommunityReviewCard(r) {
    const t = Number(r.teaching_rating || 0);
    const m = Number(r.marking_rating || 0);
    const b = Number(r.behavior_rating || 0);
    const avg = (t + m + b) / 3;
    const accent = getReviewAccentColor(avg);
    const labels = Array.isArray(r.tag_labels) ? r.tag_labels : flattenSelectedTagLabels(r.selected_tags || {});
    const shownTagItems = flattenSelectedTagItems(r.selected_tags || {}, labels).slice(0, 14);
    const personal = String(r.personal_note || '').trim();
    const reviewer = r.reviewer_label || 'Anonymous BRACU Student';
    const myReaction = myCommunityReviewReactions[Number(r.id)] || '';

    return `
        <div class="review-card" style="--review-accent:${accent}" data-community-review-id="${Number(r.id)}">
            <div class="review-meta">
                <span>${escHtml(reviewer)}</span>
                ${r.course_code ? `<span class="review-course-chip">${escHtml(r.course_code)}</span>` : ''}
                <span>·</span>
                <span>${timeAgo(r.created_at)}</span>
            </div>
            <div class="review-bars">
                ${reviewBar('Teaching', t)}
                ${reviewBar('Marking', m)}
                ${reviewBar('Behavior', b)}
            </div>
            ${r.generated_summary ? `<p class="review-text generated">${escHtml(r.generated_summary)}</p>` : ''}
            ${shownTagItems.length ? `<div class="structured-tags structured-tags--proof">${shownTagItems.map(x => `<span class="structured-tag structured-tag--${escHtml(x.mood)}">${escHtml(x.label)}</span>`).join('')}</div>` : ''}
            ${personal ? `<div class="personal-note">"${escHtml(personal)}"</div>` : ''}
            <div class="review-reaction-row">
                <div class="review-signal-pill">
                    ${reviewReactionButton(r.id, 'helpful', 'Agree', r.helpful_count, myReaction)}
                    <div class="vote-divider"></div>
                    ${reviewReactionButton(r.id, 'not_useful', 'Disagree', r.not_useful_count, myReaction)}
                </div>
                ${reviewReactionButton(r.id, 'report', 'Report', r.report_count, myReaction)}
            </div>
        </div>
    `;
}

function reviewReactionButton(reviewId, type, label, count, myReaction) {
    const activeCls = myReaction === type ? `active-${type}` : '';

    if (type === 'report') {
        const reportCount = Number(count || 0);
        return `
            <button class="review-report-btn ${activeCls}" data-reaction-type="${type}" onclick="handleCommunityReviewReaction(${Number(reviewId)}, '${type}')">
                Report${reportCount > 0 ? ` · ${reportCount}` : ''}
            </button>
        `;
    }

    const isUp = type === 'helpful';
    const displayLabel = isUp ? 'Agree' : 'Disagree';
    const directionClass = isUp ? 'signal-up' : 'signal-down';
    const arrowPath = isUp
        ? 'M12 4l-8 8h5v8h6v-8h5z'
        : 'M12 20l8-8h-5V4H9v8H4z';

    return `
        <button class="review-signal-btn ${directionClass} ${activeCls}" data-reaction-type="${type}" onclick="handleCommunityReviewReaction(${Number(reviewId)}, '${type}')">
            ${isUp ? `<svg class="vote-arrow" viewBox="0 0 24 24"><path d="${arrowPath}"/></svg>` : ''}
            <span>${displayLabel}</span>
            <span data-reaction-count="${type}">${Number(count || 0)}</span>
            ${!isUp ? `<svg class="vote-arrow" viewBox="0 0 24 24"><path d="${arrowPath}"/></svg>` : ''}
        </button>
    `;
}

async function handleCommunityReviewReaction(reviewId, reactionType) {
    const { email, username } = getCurrentEmailAndUsername();
    if (!email || !username) {
        showToast('Sign in first.', 'error');
        return;
    }

    try {
        const { data, error } = await _supabase.rpc('set_community_review_reaction', {
            p_review_id: Number(reviewId),
            p_reaction_type: reactionType,
            p_username: username,
            p_full_email: email
        });

        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
            updateReviewReactionUI(Number(reviewId), row);
            myCommunityReviewReactions[Number(reviewId)] = row.my_reaction;
        }

        if (reactionType === 'helpful') {
            showToast('Marked agree. The reviewer gains Aura.', 'success');
        } else if (reactionType === 'not_useful') {
            showToast('Feedback saved.', 'success');
        } else {
            showToast('Report recorded.', 'success');
        }

        refreshProfileChipOnly();
    } catch (err) {
        showToast(err.message || 'Reaction failed.', 'error');
    }
}

window.handleCommunityReviewReaction = handleCommunityReviewReaction;

function updateReviewReactionUI(reviewId, row) {
    const card = document.querySelector(`[data-community-review-id="${Number(reviewId)}"]`);
    if (!card) return;

    const counts = {
        helpful: row.helpful_count,
        not_useful: row.not_useful_count,
        report: row.report_count
    };

    card.querySelectorAll('.review-signal-btn, .review-report-btn').forEach(btn => {
        const type = btn.dataset.reactionType;
        btn.classList.remove('active-helpful', 'active-not_useful', 'active-report');
        if (type === row.my_reaction) btn.classList.add(`active-${type}`);

        const countEl = btn.querySelector(`[data-reaction-count="${type}"]`);
        if (countEl) countEl.textContent = Number(counts[type] || 0);

        if (type === 'report') {
            const reportCount = Number(counts.report || 0);
            btn.textContent = `Report${reportCount > 0 ? ` · ${reportCount}` : ''}`;
        }
    });
}

// Slightly stronger dopamine copy for existing v0.2 submit/create flows.
// SQL handles exact Aura awarding privately; this is just the immediate feedback layer.
var originalShowToast = showToast;
showToast = function(message, type = '') {
    if (message === 'Review submitted. You helped juniors!') {
        message = 'Review saved. Aura updated privately.';
    }
    if (message === 'Community page ready!' || message === 'Community page created!') {
        message = 'Page created. Aura updated privately.';
    }
    return originalShowToast(message, type);
};

// Try to light up the profile chip if the user was already saved before this update.
setTimeout(refreshProfileChipOnly, 500);

// Escape key should close profile too.
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeSheet(document.getElementById('profileBackdrop'));
});
