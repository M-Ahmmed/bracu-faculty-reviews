// ============================================
// 1. SUPABASE CONFIGURATION
// ============================================
const supabaseUrl = 'https://mbmgmqignuqgixsabkwv.supabase.co'; 
const supabaseKey = 'sb_publishable_sUnVlxyJ0hNbb6qn6KJDwg_PVpp_39b'; 

// We will use '_supabase' everywhere to be consistent
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);



 

// ============================================
// 2. DOM ELEMENT SELECTION
// ============================================
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const courseRatingArea = document.getElementById('courseRatingArea');
const facultyReviewArea = document.getElementById('facultyReviewArea');
const spinner = document.getElementById('spinner');
const toast = document.getElementById('toast');



// Coffee support elements
const supportBackdrop = document.getElementById('supportBackdrop');
const supportCloseBtn = document.getElementById('supportCloseBtn');
const copyNumberBtn = document.getElementById('copyNumberBtn');

// Store current course code globally
let currentCourseCode = null;
let currentCourseData = null;

// ============================================
// 3. HARDCODED DARK MODE - THEME SWITCHER REMOVED
// ============================================
// Always dark mode - no localStorage or theme toggle
document.documentElement.setAttribute('data-theme', 'dark');

// ============================================
// 3.5 TYPEWRITER ANIMATION
// ============================================
const typewriterText = document.getElementById('typewriterText');
const text = "Find your faculty review";
let charIndex = 0;

function typeWriter() {
    if (charIndex < text.length) {
        typewriterText.innerHTML = text.substring(0, charIndex + 1) + '<span class="terminal-cursor"></span>';
        charIndex++;
        setTimeout(typeWriter, 50);
    } else {
        typewriterText.innerHTML = text + '<span class="terminal-cursor"></span>';
    }
}

setTimeout(typeWriter, 300);

// ============================================
// 3.6 COFFEE SUPPORT HANDLERS
// ============================================
function openSupportCard() {
    supportBackdrop.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeSupportCard() {
    supportBackdrop.classList.remove('show');
    document.body.style.overflow = '';
}

async function copyPhoneNumber() {
    try {
        await navigator.clipboard.writeText('01908341690');
        copyNumberBtn.textContent = '✓ Copied';
        copyNumberBtn.classList.add('copied');
        
        setTimeout(() => {
            copyNumberBtn.textContent = 'Copy Number';
            copyNumberBtn.classList.remove('copied');
        }, 2000);
    } catch (err) {
        console.error('Copy failed:', err);
        showToast('Failed to copy number', 'error');
    }
}

// Event listeners for coffee support
supportCloseBtn.addEventListener('click', closeSupportCard);
copyNumberBtn.addEventListener('click', copyPhoneNumber);

// Click outside to close
supportBackdrop.addEventListener('click', (e) => {
    if (e.target === supportBackdrop) {
        closeSupportCard();
    }
});

// ESC key to close
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && supportBackdrop.classList.contains('show')) {
        closeSupportCard();
    }
});

// Make openSupportCard globally accessible for onclick handlers
window.openSupportCard = openSupportCard;

// ============================================
// 4. FUZZY SEARCH WITH FUSE.JS
// ============================================
let allFaculty = [];
let fuse = null;

async function loadFacultyData() {
    try {
        const { data, error } = await _supabase
            .from('faculty_reviews')
            .select('*');
        
        if (error) throw error;
        
        allFaculty = data || [];
        
        const searchableData = allFaculty.map(faculty => {
            if (faculty.faculty_reviews) {
                const parts = faculty.faculty_reviews.split('|');
                const fullName = parts[0]?.trim() || "";
                const initial = parts[1]?.trim() || "";
                const courses = parts[3]?.trim() || "";
                
                return {
                    ...faculty,
                    fullName: fullName,
                    initial: initial,
                    courses: courses,
                    searchableText: `${fullName} ${initial} ${faculty.faculty_name || ''}`
                };
            }
            return {
                ...faculty,
                fullName: "",
                initial: "",
                courses: "",
                searchableText: faculty.faculty_name || ""
            };
        });
        
        fuse = new Fuse(searchableData, {
            keys: [
                { name: 'fullName', weight: 0.5 },
                { name: 'initial', weight: 0.3 },
                { name: 'faculty_name', weight: 0.2 }
            ],
            threshold: 0.4,
            ignoreLocation: true,
            minMatchCharLength: 2,
            useExtendedSearch: true,
            includeScore: true
        });
        
        console.log(`Loaded ${allFaculty.length} faculty records`);
    } catch (err) {
        console.error('Error loading faculty data:', err);
    }
}

loadFacultyData();

// ============================================
// 4.5 AUTOCOMPLETE SUGGESTIONS
// ============================================
let debounceTimer = null;
let suggestionsContainer = null;

function createSuggestionsContainer() {
    const wrapper = document.querySelector('.search-input-wrapper');
    
    if (!document.getElementById('suggestions-dropdown')) {
        suggestionsContainer = document.createElement('div');
        suggestionsContainer.id = 'suggestions-dropdown';
        suggestionsContainer.className = 'suggestions-dropdown';
        wrapper.appendChild(suggestionsContainer);
    }
}

createSuggestionsContainer();

function showSuggestions(query) {
    const cleanQuery = query.trim();
    if (!cleanQuery || cleanQuery.length < 2) {
        hideSuggestions();
        return;
    }

    const exactInitialMatch = allFaculty.filter(f => 
        (f.initial || "").toLowerCase() === cleanQuery.toLowerCase()
    );

    const hasNumber = /\d/.test(cleanQuery);
    const courseCodePattern = /^[A-Z]{3,4}\s?\d{0,3}$/i;
    
    if (hasNumber && courseCodePattern.test(cleanQuery)) {
        showCourseCodeSuggestions(cleanQuery.toUpperCase().replace(/\s/g, ''));
    } else {
        showFacultyNameSuggestions(cleanQuery, exactInitialMatch);
    }
}

function showCourseCodeSuggestions(query) {
    const allCourseCodes = new Set();
    
    allFaculty.forEach(faculty => {
        if (faculty.faculty_reviews) {
            const parts = faculty.faculty_reviews.split('|');
            const courses = parts[3]?.trim() || "";
            if (courses) {
                courses.split(',').forEach(course => {
                    const trimmed = course.trim();
                    if (trimmed) allCourseCodes.add(trimmed);
                });
            }
        }
    });
    
    const matchingCourses = Array.from(allCourseCodes)
        .filter(code => code.startsWith(query))
        .sort()
        .slice(0, 5);
    
    if (matchingCourses.length === 0) {
        hideSuggestions();
        return;
    }
    
    const suggestionsHTML = matchingCourses.map((course, index) => `
        <div class="suggestion-item course-suggestion" data-course="${escapeHtml(course)}" data-index="${index}">
            <span class="suggestion-name">${escapeHtml(course)}</span>
            <span class="suggestion-badge">COURSE</span>
        </div>
    `).join('');
    
    suggestionsContainer.innerHTML = suggestionsHTML;
    suggestionsContainer.style.display = 'block';
    
    document.querySelectorAll('.course-suggestion').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const selectedCourse = e.currentTarget.getAttribute('data-course');
            searchInput.value = selectedCourse;
            hideSuggestions();
            searchForm.dispatchEvent(new Event('submit'));
        });
    });
}

function showFacultyNameSuggestions(query, manualMatches = []) {
    const queryLower = query.toLowerCase();
    
    const results = fuse.search(queryLower);
    
    const combinedMap = new Map();
    
    manualMatches.forEach(f => {
        combinedMap.set(f.faculty_id || f.fullName, { item: f, score: 0 });
    });
    
    results.forEach(result => {
        const id = result.item.faculty_id || result.item.fullName;
        if (!combinedMap.has(id) && result.score < 0.5) {
            combinedMap.set(id, result);
        }
    });

    const finalResults = Array.from(combinedMap.values()).slice(0, 5);

    if (finalResults.length === 0) {
        hideSuggestions();
        return;
    }

    const suggestionsHTML = finalResults.map((result) => {
        const faculty = result.item;
        const fullName = faculty.fullName || faculty.faculty_name || "Unknown";
        const initial = faculty.initial || "";
        
        return `
            <div class="suggestion-item" data-name="${escapeHtml(fullName)}">
                <span class="suggestion-name">${escapeHtml(fullName)}</span>
                ${initial ? `<span class="suggestion-badge">${escapeHtml(initial)}</span>` : ''}
            </div>
        `;
    }).join('');

    suggestionsContainer.innerHTML = suggestionsHTML;
    suggestionsContainer.style.display = 'block';

    document.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const selectedName = e.currentTarget.getAttribute('data-name');
            searchInput.value = selectedName;
            hideSuggestions();
            searchForm.dispatchEvent(new Event('submit'));
        });
    });
}

function hideSuggestions() {
    if (suggestionsContainer) {
        suggestionsContainer.style.display = 'none';
        suggestionsContainer.innerHTML = '';
    }
}

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    
    debounceTimer = setTimeout(() => {
        showSuggestions(query);
    }, 200);
});

document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
        hideSuggestions();
    }
});

searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideSuggestions();
    }
});

searchForm.addEventListener('submit', () => {
    hideSuggestions();
}, true);

// ============================================
// 5. SEARCH FUNCTIONALITY WITH COURSE CODE DETECTION
// ============================================
searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideSuggestions();
    
    const userInput = searchInput.value.trim();
    if (!userInput) {
        alert('Please enter a faculty name or course code');
        return;
    }

    searchButton.disabled = true;
    searchButton.classList.add('loading');
    
    // INCREMENT GLOBAL SEARCH COUNT
   
    
    try {
        const courseCodePattern = /^[A-Z]{3,4}\s?\d{3}$/i;
        const isCourseCode = courseCodePattern.test(userInput);
        
        if (isCourseCode) {
            await handleCourseCodeSearch(userInput.toUpperCase().replace(/\s/g, ''));
        } else {
            await handleFacultyNameSearch(userInput);
        }
    } catch (err) {
        console.error('Error searching:', err);
        courseRatingArea.innerHTML = `
            <div class="card slide-up">
                <div class="card-content" style="padding: 2rem; text-align: center;">
                    <h3 style="color: var(--text-primary); margin-bottom: 0.5rem;">Error</h3>
                    <p style="color: var(--text-secondary);">
                        Something went wrong. Please try again.
                    </p>
                </div>
            </div>
        `;
        courseRatingArea.style.display = 'block';
        facultyReviewArea.style.display = 'none';
    } finally {
        searchButton.disabled = false;
        searchButton.classList.remove('loading');
    }
});

// ============================================
// 5.1 COURSE CODE SEARCH HANDLER
// ============================================
async function handleCourseCodeSearch(courseCode) {
    console.log(`Searching for course code: ${courseCode}`);
    
    currentCourseCode = courseCode;
    
    const facultyWithCourse = allFaculty.filter(faculty => {
        if (faculty.faculty_reviews) {
            const parts = faculty.faculty_reviews.split('|');
            const courses = parts[3]?.trim() || "";
            return courses.includes(courseCode);
        }
        return false;
    });
    
    if (facultyWithCourse.length === 0) {
        courseRatingArea.innerHTML = `
            <div class="card slide-up">
                <div class="card-content" style="padding: 2rem; text-align: center;">
                    <h3 style="color: var(--text-primary); margin-bottom: 1rem; font-size: 1.25rem; font-weight: 700;">No faculty found for "${escapeHtml(courseCode)}"</h3>
                    <p style="color: var(--text-secondary); line-height: 1.7; font-size: 0.95rem;">
                        This course might not be in our database yet, or no faculty reviews are available for it.
                    </p>
                </div>
            </div>
        `;
        courseRatingArea.style.display = 'block';
        facultyReviewArea.style.display = 'none';
        courseRatingArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }
    
    const facultyWithRatings = facultyWithCourse.map(faculty => {
        const parts = faculty.faculty_reviews.split('|');
        const fullName = parts[0]?.trim() || "Unknown";
        const initial = parts[1]?.trim() || "";
        const teaching = parseFloat(parts[4]) || 0;
        const marking = parseFloat(parts[5]) || 0;
        const behavior = parseFloat(parts[6]) || 0;
        
        const avgRating = ((teaching + marking + behavior) / 3) / 10 * 100;
        
        return {
            fullName,
            initial,
            avgRating: avgRating.toFixed(1),
            rawData: faculty
        };
    });
    
    facultyWithRatings.sort((a, b) => parseFloat(b.avgRating) - parseFloat(a.avgRating));
    
    currentCourseData = facultyWithRatings;
    
    const facultyRowsHTML = facultyWithRatings.map((faculty, index) => `
        <div class="faculty-row" onclick="searchFaculty('${escapeHtml(faculty.fullName)}')" data-index="${index}">
            <div class="faculty-column">
                <div class="faculty-header-inline">
                    <span class="faculty-name-top">${escapeHtml(faculty.fullName)}</span>
                    <div class="faculty-initial-badge-inline">${escapeHtml(faculty.initial)}</div>
                </div>
                <div class="rating-bar-wrapper">
                    <div class="rating-bar-container">
                        <div class="rating-bar-fill" data-rating="${faculty.avgRating}"></div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
    courseRatingArea.innerHTML = `
        <div class="card slide-up course-results-card">
            <div class="card-header">
                <h2>Faculty Teaching ${escapeHtml(courseCode)}</h2>
            </div>
            <div class="faculty-list">
                ${facultyRowsHTML}
            </div>
            <div class="card-footer">
                <span class="footer-text">Click any faculty to view full review</span>
            </div>
        </div>
    `;
    
    courseRatingArea.style.display = 'block';
    facultyReviewArea.style.display = 'none';
    courseRatingArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    setTimeout(() => {
        document.querySelectorAll('.rating-bar-fill').forEach((bar, index) => {
            setTimeout(() => {
                const rating = bar.getAttribute('data-rating');
                bar.style.setProperty('--target-width', `${rating}%`);
                bar.classList.add('animate');
            }, index * 100);
        });
    }, 50);
}

window.searchFaculty = function(facultyName) {
    handleFacultyNameSearch(facultyName, true);
};

// ============================================
// 5.2 FACULTY NAME SEARCH HANDLER
// ============================================
async function handleFacultyNameSearch(userInput, keepRatingCard = false) {
    let faculty = null;
    const inputLength = userInput.length;
    const scoreThreshold = inputLength <= 6 ? 0.15 : 0.45;
    
    if (fuse && allFaculty.length > 0) {
        const fuseResults = fuse.search(userInput);
        
        if (fuseResults.length > 0) {
            const topMatch = fuseResults[0];
            const matchScore = topMatch.score;
            
            console.log(`Query: "${userInput}" | Length: ${inputLength} | Top match: "${topMatch.item.fullName || topMatch.item.faculty_name}" | Score: ${matchScore.toFixed(3)} | Threshold: ${scoreThreshold}`);
            
            if (matchScore < scoreThreshold) {
                faculty = topMatch.item;
                console.log(`✓ Match accepted (score ${matchScore.toFixed(3)} < ${scoreThreshold})`);
            } else {
                console.log(`✗ Match rejected (score ${matchScore.toFixed(3)} >= ${scoreThreshold})`);
            }
        }
    }
    
    if (!faculty) {
        const { data: exactMatch, error } = await _supabase
            .from('faculty_reviews')
            .select('*')
            .ilike('faculty_name', `%${userInput}%`)
            .limit(1)
            .single();
        
        if (exactMatch && !error) {
            faculty = exactMatch;
            console.log(`Database fallback match found: "${faculty.faculty_name}"`);
        }
    }

    if (!faculty) {
        if (!keepRatingCard) {
            courseRatingArea.innerHTML = `
                <div class="card slide-up">
                    <div class="card-content" style="padding: 2rem; text-align: center;">
                        <h3 style="color: var(--text-primary); margin-bottom: 1rem; font-size: 1.25rem; font-weight: 700;">"${escapeHtml(userInput)}" is not listed yet.</h3>
                        <p style="color: var(--text-secondary); line-height: 1.7; font-size: 0.95rem;">
                            I'm prioritizing updates based on your needs. Kindly drop the faculty name in the Facebook comments or use the <strong>Feedback</strong> button to inbox me the name. Help me to complete the archive.
                        </p>
                    </div>
                </div>
            `;
            courseRatingArea.style.display = 'block';
            facultyReviewArea.style.display = 'none';
            courseRatingArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
    }

    displayFaculty(faculty, keepRatingCard);
}

// ============================================
// CONSENSUS PILL VOTE HANDLER
// ============================================
async function handleVote(reviewId, voteType) {
    const storageKey = `vote_status_${reviewId}`;
    const currentVote = localStorage.getItem(storageKey);
    
    const upSection = document.querySelector(`#vote-up-${reviewId}`);
    const downSection = document.querySelector(`#vote-down-${reviewId}`);
    const counter = document.querySelector(`#vote-counter-${reviewId}`);
    
    let voteChange = 0;
    let newVoteStatus = null;
    
    if (voteType === 'up') {
        if (currentVote === 'up') {
            voteChange = -1;
            newVoteStatus = null;
            upSection.classList.remove('up-active');
        } else if (currentVote === 'down') {
            voteChange = 2;
            newVoteStatus = 'up';
            downSection.classList.remove('down-active');
            upSection.classList.add('up-active');
        } else {
            voteChange = 1;
            newVoteStatus = 'up';
            upSection.classList.add('up-active');
        }
    } else if (voteType === 'down') {
        if (currentVote === 'down') {
            voteChange = 1;
            newVoteStatus = null;
            downSection.classList.remove('down-active');
        } else if (currentVote === 'up') {
            voteChange = -2;
            newVoteStatus = 'down';
            upSection.classList.remove('up-active');
            downSection.classList.add('down-active');
        } else {
            voteChange = -1;
            newVoteStatus = 'down';
            downSection.classList.add('down-active');
        }
    }
    
    const clickedSection = voteType === 'up' ? upSection : downSection;
    clickedSection.classList.add('clicked');
    setTimeout(() => clickedSection.classList.remove('clicked'), 300);
    
    if (newVoteStatus) {
        localStorage.setItem(storageKey, newVoteStatus);
    } else {
        localStorage.removeItem(storageKey);
    }
    
    try {
        const { data, error } = await _supabase.rpc('increment_vote', {
            review_id: reviewId,
            vote_change: voteChange
        });
        
        if (error) throw error;
        
        counter.textContent = data || 0;
    } catch (err) {
        console.error('Vote error:', err);
        
        if (newVoteStatus === 'up') {
            upSection.classList.remove('up-active');
        } else if (newVoteStatus === 'down') {
            downSection.classList.remove('down-active');
        }
        
        if (currentVote) {
            localStorage.setItem(storageKey, currentVote);
        } else {
            localStorage.removeItem(storageKey);
        }
        
        showToast('Vote failed. Please try again.', 'error');
    }
}

function initializeVotePill(reviewId, currentScore) {
    const storageKey = `vote_status_${reviewId}`;
    const savedVote = localStorage.getItem(storageKey);
    
    const upSection = document.querySelector(`#vote-up-${reviewId}`);
    const downSection = document.querySelector(`#vote-down-${reviewId}`);
    
    if (savedVote === 'up') {
        upSection.classList.add('up-active');
    } else if (savedVote === 'down') {
        downSection.classList.add('down-active');
    }
}

// Make handleVote globally accessible
window.handleVote = handleVote;

// ============================================
// 6. DISPLAY FACULTY RESULTS
// ============================================
function displayFaculty(faculty, keepRatingCard = false) {
    let fullName, initial, email, courses, teaching, marking, behavior, overallSummary, statisticalInsights;
    
    if (faculty.faculty_reviews) {
        const parts = faculty.faculty_reviews.split('|');
        fullName = parts[0]?.trim() || "Unknown Faculty";
        initial = parts[1]?.trim() || "";
        email = parts[2]?.trim() || "";
        courses = parts[3]?.trim() || "";
        teaching = parts[4]?.trim() || "N/A";
        marking = parts[5]?.trim() || "N/A";
        behavior = parts[6]?.trim() || "N/A";
        overallSummary = parts[7]?.trim() || "No overall verdict available.";
        statisticalInsights = parts[8]?.trim() || "No student insights available.";
    } else {
        fullName = "Unknown Faculty";
        initial = "";
        email = "";
        courses = "";
        teaching = "N/A";
        marking = "N/A";
        behavior = "N/A";
        overallSummary = "No overall verdict available.";
        statisticalInsights = "No student insights available.";
    }
    
    const courseArray = courses ? courses.split(',').map(c => c.trim()).filter(c => c) : [];
    const courseTags = courseArray.map(course => 
        `<span style="display: inline-block; background: var(--input-bg); padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.75rem; margin-right: 0.5rem; margin-bottom: 0.5rem; color: var(--text-primary); font-weight: 500;">${escapeHtml(course)}</span>`
    ).join('');

    facultyReviewArea.innerHTML = `
        <div class="card slide-up" style="z-index: 1 !important;">
            <div class="card-header">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
                    <h2 class="result-card-headline">
                        ${escapeHtml(fullName)}
                    </h2>
                    ${initial ? `<span class="initial-badge">${escapeHtml(initial)}</span>` : ''}
                </div>
                ${email ? `<a href="mailto:${escapeHtml(email)}" style="color: var(--text-primary); font-size: 0.875rem; text-decoration: none; display: block; margin-bottom: 1rem; opacity: 0.8; transition: opacity 0.2s; word-break: break-word;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'">${escapeHtml(email)}</a>` : ''}
                ${courseArray.length > 0 ? `<div style="margin-top: 1rem; display: flex; flex-wrap: wrap; gap: 0.5rem;">${courseTags}</div>` : ''}
            </div>
            <div class="card-body">
                <div class="ratings-grid">
                    <div style="background: var(--input-bg); padding: 1rem; text-align: center; border-radius: 8px;">
                        <span style="display: block; font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Teaching</span>
                        <span style="font-size: 1.5rem; font-weight: bold; color: var(--text-primary);">${escapeHtml(teaching)}</span>
                    </div>
                    <div style="background: var(--input-bg); padding: 1rem; text-align: center; border-radius: 8px;">
                        <span style="display: block; font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Marking</span>
                        <span style="font-size: 1.5rem; font-weight: bold; color: var(--text-primary);">${escapeHtml(marking)}</span>
                    </div>
                    <div style="background: var(--input-bg); padding: 1rem; text-align: center; border-radius: 8px;">
                        <span style="display: block; font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Behavior</span>
                        <span style="font-size: 1.5rem; font-weight: bold; color: var(--text-primary);">${escapeHtml(behavior)}</span>
                    </div>
                </div>
                
                <div class="verdict-box">
                    <span style="display: block; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem; font-weight: 600; letter-spacing: 0.5px;">Overall Review</span>
                    <p style="margin: 0; line-height: 1.6; color: var(--text-primary); font-size: 0.95rem; font-weight: 400;">${escapeHtml(overallSummary)}</p>
                </div>

                <div>
                    <span style="display: block; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 1rem; font-weight: 600; letter-spacing: 0.5px;">What Students Say</span>
                    ${parseInsights(statisticalInsights)}
                    
                    <div class="consensus-pill-wrapper">
                        <div class="vote-pill">
                            <div class="vote-section" id="vote-up-${faculty.id}" onclick="handleVote(${faculty.id}, 'up')">
                                <span class="vote-text">Agree</span>
                                <svg class="arrow-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 4l-8 8h5v8h6v-8h5z"/>
                                </svg>
                            </div>
                            
                            <span class="vote-counter" id="vote-counter-${faculty.id}">${faculty.vote_score || 0}</span>
                            
                            <div class="vote-divider"></div>
                            
                            <div class="vote-section" id="vote-down-${faculty.id}" onclick="handleVote(${faculty.id}, 'down')">
                                <svg class="arrow-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 20l8-8h-5V4H9v8H4z"/>
                                </svg>
                                <span class="vote-text">Disagree</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="card-footer">
                <div>
                    <span class="footer-link" onclick="toggleAboutCard()">Disclaimer & Data Notice</span>
                </div>
                <div class="coffee-trigger" onclick="openSupportCard()">
                    <span class="coffee-icon">☕</span>
                    
                </div>
            </div>
        </div>
    `;

    facultyReviewArea.style.display = 'block';
    
    if (!keepRatingCard) {
        courseRatingArea.style.display = 'none';
        facultyReviewArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        setTimeout(() => {
            facultyReviewArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
    
    setTimeout(() => {
        initializeVotePill(faculty.id, faculty.vote_score || 0);
    }, 100);
}

// ============================================
// 7. UTILITY FUNCTIONS
// ============================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function parseInsights(text) {
    if (!text) return '<div class="insight-point">No student insights available.</div>';
    
    const sentences = text
        .split(/\.(?:\s+|\n+)|(?:\n+)/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
    
    if (sentences.length === 1) {
        const formatted = formatInsightText(sentences[0]);
        return `<div class="insight-point">${formatted}</div>`;
    }
    
    return sentences
        .map(sentence => {
            const formatted = formatInsightText(sentence);
            return `<div class="insight-point">${formatted}</div>`;
        })
        .join('');
}

function formatInsightText(text) {
    const escaped = escapeHtml(text);
    return escaped.replace(/(\d+%)/g, '<span class="percentage">$1</span>');
}

// ============================================
// 8. ABOUT CARD FUNCTIONS
// ============================================
function toggleAboutCard() {
    const aboutArea = document.getElementById('aboutArea');
    
    if (aboutArea.style.display === 'none' || !aboutArea.style.display) {
        renderAboutCard();
        aboutArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        aboutArea.style.display = 'none';
    }
}

function renderAboutCard() {
    const aboutArea = document.getElementById('aboutArea');
    
    aboutArea.innerHTML = `
        <div class="card slide-up">
            <div class="card-header">
                <h2 style="margin: 0; font-size: 1.5rem; color: var(--text-primary); font-weight: 700; letter-spacing: -0.02em;">Disclaimer & Data Notice</h2>
            </div>
            <div class="card-body">
                <div style="margin-bottom: 2rem;">
                    <h3 style="font-size: 0.875rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.75rem; letter-spacing: 0.3px;">What is this?</h3>
                    <p style="margin: 0; color: var(--text-primary); font-size: 0.95rem; line-height: 1.7; font-weight: 400;">
                        I built this independent tool to help students instantly find patterns in thousands of faculty reviews shared within our BRACU community. It's designed to save you hours of scrolling through group archives.
                    </p>
                </div>
                
                <div style="margin-bottom: 2rem;">
                    <h3 style="font-size: 0.875rem; font-weight: 700; color: var(--text-primary); margin-bottom: 1rem; letter-spacing: 0.3px;">The Methodology</h3>
                    <div class="insight-point">I tracked down 12 to 20+ dedicated review posts for every faculty member.</div>
                    <div class="insight-point">I analyzed hundreds of student comments per faculty member.</div>
                    <div class="insight-point">I used AI to find consistent patterns among students review.</div>
                </div>
                
                <div style="margin-bottom: 2rem;">
                    <h3 style="font-size: 0.875rem; font-weight: 700; color: var(--text-primary); margin-bottom: 1rem; letter-spacing: 0.3px;">Important Context</h3>
                    <div class="insight-point">This is not an official university tool and is not affiliated with any department.</div>
                    <div class="insight-point">These are peer experiences, not factual evaluations. Please use your own judgment.</div>
                    <div class="insight-point">I built this to help, not to judge. If any data is inaccurate or needs removal, please reach out via the Feedback button.</div>
                </div>
                
                <div style="margin-bottom: 0;">
                    <h3 style="font-size: 0.875rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.75rem; letter-spacing: 0.3px;">Current Status</h3>
                    <p style="margin: 0; color: var(--text-primary); font-size: 0.95rem; line-height: 1.7; font-weight: 400;">
                        Currently, I am doing it for CSE Department. Because each entry requires deep research and manual verification, I am adding more faculties and departments in weekly waves.
                    </p>
                </div>
            </div>
            
            <div class="card-footer">
                <div><span class="footer-link" onclick="toggleAboutCard()">Disclaimer & Data Notice</span></div>
                <div class="coffee-trigger" onclick="openSupportCard()"><span class="coffee-icon">☕</span>
            </div>
        </div>
    `;
    
    aboutArea.style.display = 'block';
}

function closeAboutCard() {
    const aboutArea = document.getElementById('aboutArea');
    aboutArea.style.display = 'none';
}

// Make toggleAboutCard globally accessible
window.toggleAboutCard = toggleAboutCard;

// ============================================
// 12. TOAST NOTIFICATIONS
// ============================================
function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}
