// ============================================
// 1. SUPABASE CONFIGURATION
// ============================================
const supabaseUrl = 'https://mbmgmqignuqgixsabkwv.supabase.co'; 
const supabaseKey = 'sb_publishable_sUnVlxyJ0hNbb6qn6KJDwg_PVpp_39b'; 

const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// ============================================
// 2. DOM ELEMENT SELECTION
// ============================================
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const resultArea = document.getElementById('resultArea');
const spinner = document.getElementById('spinner');
const themeSwitcher = document.getElementById('themeSwitcher');
const themeText = document.getElementById('themeText');

// ============================================
// 3. THEME SWITCHER FUNCTIONALITY - DARK MODE DEFAULT
// ============================================
const currentTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', currentTheme);
themeText.textContent = currentTheme === 'dark' ? 'Light' : 'Dark';

themeSwitcher.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    themeText.textContent = newTheme === 'dark' ? 'Light' : 'Dark';
});

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
                
                return {
                    ...faculty,
                    fullName: fullName,
                    initial: initial,
                    searchableText: `${fullName} ${initial} ${faculty.faculty_name || ''}`
                };
            }
            return {
                ...faculty,
                fullName: "",
                initial: "",
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

// Create suggestions dropdown on page load
function createSuggestionsContainer() {
    suggestionsContainer = document.createElement('div');
    suggestionsContainer.id = 'suggestions-dropdown';
    suggestionsContainer.className = 'suggestions-dropdown';
    document.querySelector('.search-input-wrapper').appendChild(suggestionsContainer);
}

createSuggestionsContainer();

// Show suggestions based on user input
// Show suggestions based on user input
function showSuggestions(query) {
    if (!query || query.length < 2) {
        hideSuggestions();
        return;
    }
    
    if (!fuse || allFaculty.length === 0) {
        return;
    }
    
    const inputLength = query.length;
    
    // Apply Logic Gate: determine threshold based on input length
    const scoreThreshold = inputLength <= 6 ? 0.15 : 0.45;
    
    // Search using Fuse.js
    const results = fuse.search(query);
    
    // Filter by score threshold
    const filteredResults = results.filter(result => result.score < scoreThreshold);
    
    // Limit to top 5 matches
    const topResults = filteredResults.slice(0, 5);
    
    if (topResults.length === 0) {
        hideSuggestions();
        return;
    }
    
    console.log(`Suggestions for "${query}" (${inputLength} chars, threshold: ${scoreThreshold}):`);
    topResults.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.item.fullName || result.item.faculty_name} - Score: ${result.score.toFixed(3)}`);
    });
    
    // Build suggestions HTML as vertical list
    const suggestionsHTML = topResults.map((result, index) => {
        const faculty = result.item;
        const fullName = faculty.fullName || faculty.faculty_name || "Unknown";
        const initial = faculty.initial || "";
        
        return `
            <div class="suggestion-item" data-name="${escapeHtml(fullName)}" data-index="${index}">
                <span class="suggestion-name">${escapeHtml(fullName)}</span>
                ${initial ? `<span class="suggestion-badge">${escapeHtml(initial)}</span>` : ''}
            </div>
        `;
    }).join('');
    
    suggestionsContainer.innerHTML = suggestionsHTML;
    suggestionsContainer.style.display = 'block';
    
    // Add click event to each suggestion
    document.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const selectedName = e.currentTarget.getAttribute('data-name');
            const index = e.currentTarget.getAttribute('data-index');
            
            console.log(`✓ Suggestion clicked: "${selectedName}" (index: ${index})`);
            
            // Fill the search input
            searchInput.value = selectedName;
            
            // CRITICAL: Clear dropdown immediately
            suggestionsContainer.innerHTML = '';
            suggestionsContainer.style.display = 'none';
            
            // Trigger the search
            searchForm.dispatchEvent(new Event('submit'));
        });
    });
}

// Hide suggestions
function hideSuggestions() {
    if (suggestionsContainer) {
        suggestionsContainer.style.display = 'none';
        suggestionsContainer.innerHTML = '';
    }
}

// Debounced input handler
searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    // Clear previous timer
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    
    // Set new timer (200ms delay)
    debounceTimer = setTimeout(() => {
        showSuggestions(query);
    }, 200);
});

// Hide suggestions when clicking outside
document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
        hideSuggestions();
    }
});

// Hide suggestions on ESC key
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideSuggestions();
    }
});

// Hide suggestions when form is submitted
searchForm.addEventListener('submit', () => {
    hideSuggestions();
}, true);

// ============================================
// 5. SEARCH FUNCTIONALITY WITH LOGIC GATE
// ============================================
searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Hide suggestions when form is submitted
    hideSuggestions();
    
    const userInput = searchInput.value.trim();
    if (!userInput) {
        alert('Please enter a faculty name');
        return;
    }

    searchButton.disabled = true;
    searchButton.classList.add('loading');
    
    try {
        let faculty = null;
        const inputLength = userInput.length;
        
        // Determine threshold based on input length (Logic Gate)
        const scoreThreshold = inputLength <= 6 ? 0.15 : 0.45;
        
        if (fuse && allFaculty.length > 0) {
            const fuseResults = fuse.search(userInput);
            
            if (fuseResults.length > 0) {
                const topMatch = fuseResults[0];
                const matchScore = topMatch.score;
                
                console.log(`Query: "${userInput}" | Length: ${inputLength} | Top match: "${topMatch.item.fullName || topMatch.item.faculty_name}" | Score: ${matchScore.toFixed(3)} | Threshold: ${scoreThreshold}`);
                
                // Apply Logic Gate: only accept if score is below threshold
                if (matchScore < scoreThreshold) {
                    faculty = topMatch.item;
                    console.log(`✓ Match accepted (score ${matchScore.toFixed(3)} < ${scoreThreshold})`);
                } else {
                    console.log(`✗ Match rejected (score ${matchScore.toFixed(3)} >= ${scoreThreshold})`);
                }
            }
        }
        
        // Fallback: exact match from database
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

        // Display "Not Found" card if no valid match
        if (!faculty) {
            resultArea.innerHTML = `
                <div class="card slide-up">
                    <div class="card-content" style="padding: 2rem; text-align: center;">
                        <h3 style="color: var(--text-primary); margin-bottom: 1rem; font-size: 1.25rem; font-weight: 700;">"${escapeHtml(userInput)}" is not listed yet.</h3>
                        <p style="color: var(--text-secondary); line-height: 1.7; font-size: 0.95rem;">
                            I'm prioritizing updates based on your needs. Kindly drop the faculty name in the Facebook comments or use the <strong>Feedback</strong> button to inbox me the name. Help me to complete the archive.
                        </p>
                    </div>
                </div>
            `;
            resultArea.style.display = 'block';
            resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }

        displayFaculty(faculty);
    } catch (err) {
        console.error('Error searching faculty:', err);
        resultArea.innerHTML = `
            <div class="card slide-up">
                <div class="card-content" style="padding: 2rem; text-align: center;">
                    <h3 style="color: var(--text-primary); margin-bottom: 0.5rem;">Error</h3>
                    <p style="color: var(--text-secondary);">
                        Something went wrong. Please try again.
                    </p>
                </div>
            </div>
        `;
        resultArea.style.display = 'block';
    } finally {
        searchButton.disabled = false;
        searchButton.classList.remove('loading');
    }
});

// ============================================
// 6. DISPLAY FACULTY RESULTS
// ============================================
function displayFaculty(faculty) {
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

    resultArea.innerHTML = `
        <div class="card slide-up">
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
                </div>
            </div>
            
            <div class="card-footer">
                <span class="footer-link" onclick="toggleAboutCard()">Disclaimer & Data Notice</span>
            </div>
        </div>
    `;

    resultArea.style.display = 'block';
    resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
                <span class="footer-link" onclick="closeAboutCard()">Close</span>
            </div>
        </div>
    `;
    
    aboutArea.style.display = 'block';
}

function closeAboutCard() {
    const aboutArea = document.getElementById('aboutArea');
    aboutArea.style.display = 'none';
}
