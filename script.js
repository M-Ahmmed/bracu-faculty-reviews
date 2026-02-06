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
// 5. SEARCH FUNCTIONALITY WITH LOGIC GATE
// ============================================
searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
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
                <p style="margin: 0 0 1.5rem 0; color: var(--text-primary); font-size: 0.95rem; line-height: 1.7; font-weight: 400;">
                    This project is an independent, student-built tool created to help students quickly understand general patterns in faculty reviews shared within the BRACU Faculty & Course Review Facebook group.
                </p>
                
                <div style="margin-bottom: 2rem;">
                    <h3 style="font-size: 0.875rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.75rem; letter-spacing: 0.3px;">All information presented here is:</h3>
                    <ul style="margin-left: 1.25rem; color: var(--text-primary); font-size: 0.95rem; line-height: 1.8;">
                        <li style="margin-bottom: 0.5rem;">Aggregated and summarized</li>
                        <li style="margin-bottom: 0.5rem;">Based on publicly available student discussions</li>
                        <li style="margin-bottom: 0.5rem;">Non-official and non-authoritative</li>
                    </ul>
                </div>
                
             
                
                <div style="margin-bottom: 2rem;">
                   <h3 style="font-size: 0.875rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.75rem; letter-spacing: 0.3px;">Important context:</h3>
                    <p style="margin: 0; color: var(--text-primary); font-size: 0.95rem; line-height: 1.7; font-weight: 400;">
                        This platform does not represent BRAC University, any department, or any faculty member.

The content does not claim to be complete, factual evaluations, or official reviews. It reflects subjective student opinions, summarized to highlight common themes rather than individual statements.

This platform is not intended to defame, rank, or judge individuals. Any resemblance to performance evaluation systems is unintentional.

If any information appears inaccurate, outdated, or inappropriate, it can be reviewed, corrected, or removed upon request.

This project is provided for informational purposes only, and users are encouraged to verify information independently and use personal judgment.
                    </p>
                </div>
                
                <div style="margin-bottom: 0;">
                    <h3 style="font-size: 0.875rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.75rem; letter-spacing: 0.3px;">Current Status:</h3>
                    <p style="margin: 0; color: var(--text-primary); font-size: 0.95rem; line-height: 1.7; font-weight: 400;">
                        This is a beta version. Right now, it only covers CSE department faculty. More departments coming soon based on demand.
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
