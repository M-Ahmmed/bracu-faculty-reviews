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
// 3. THEME SWITCHER FUNCTIONALITY
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
const text = "Find your faculty review in 10 seconds";
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
        
        // Extract full names and initials from faculty_reviews field
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
        
        // Initialize Fuse.js with multiple search keys
        fuse = new Fuse(searchableData, {
            keys: [
                { name: 'fullName', weight: 0.5 },
                { name: 'initial', weight: 0.3 },
                { name: 'faculty_name', weight: 0.2 }
            ],
            threshold: 0.4,
            ignoreLocation: true,
            minMatchCharLength: 2,
            useExtendedSearch: true
        });
        
        console.log(`Loaded ${allFaculty.length} faculty records`);
    } catch (err) {
        console.error('Error loading faculty data:', err);
    }
}

loadFacultyData();

// ============================================
// 5. SEARCH FUNCTIONALITY
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
        
        // First, try fuzzy search using Fuse.js
        if (fuse && allFaculty.length > 0) {
            const fuseResults = fuse.search(userInput);
            
            if (fuseResults.length > 0) {
                faculty = fuseResults[0].item;
                console.log(`Fuzzy match found: "${faculty.fullName || faculty.faculty_name}" for query "${userInput}"`);
            }
        }
        
        // If fuzzy search fails, try exact database match
        if (!faculty) {
            const { data: exactMatch, error } = await _supabase
                .from('faculty_reviews')
                .select('*')
                .ilike('faculty_name', `%${userInput}%`)
                .limit(1)
                .single();
            
            if (exactMatch && !error) {
                faculty = exactMatch;
            }
        }

        if (!faculty) {
            resultArea.innerHTML = `
                <div class="card slide-up">
                    <div class="card-content" style="padding: 2rem; text-align: center;">
                        <h3 style="color: var(--text-primary); margin-bottom: 0.5rem;">No Results Found</h3>
                        <p style="color: var(--text-secondary);">
                            We couldn't find any faculty matching "<strong>${escapeHtml(userInput)}</strong>".
                            <br><br>
                            Try checking the spelling or using a different name.
                        </p>
                    </div>
                </div>
            `;
            resultArea.style.display = 'block';
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
            <div class="card-header" style="padding: 2rem; border-bottom: 1px solid var(--border-color);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
                    <h2 class="faculty-name" style="margin: 0; font-size: 1.5rem; color: var(--text-primary); flex: 1; min-width: 200px;">
                        ${escapeHtml(fullName)}
                    </h2>
                    ${initial ? `<span class="initial-badge">${escapeHtml(initial)}</span>` : ''}
                </div>
                ${email ? `<a href="mailto:${escapeHtml(email)}" style="color: var(--text-primary); font-size: 0.875rem; text-decoration: none; display: block; margin-bottom: 1rem; opacity: 0.8; transition: opacity 0.2s; word-break: break-word;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'">${escapeHtml(email)}</a>` : ''}
                ${courseArray.length > 0 ? `<div style="margin-top: 1rem; display: flex; flex-wrap: wrap; gap: 0.5rem;">${courseTags}</div>` : ''}
            </div>
            <div class="card-body" style="padding: 2rem;">
                <div class="ratings-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 2rem;">
                    <div class="rating-box" style="background: var(--input-bg); padding: 1rem; text-align: center; border-radius: 8px;">
                        <span style="display: block; font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Teaching</span>
                        <span style="font-size: 1.5rem; font-weight: bold; color: var(--text-primary);">${escapeHtml(teaching)}</span>
                    </div>
                    <div class="rating-box" style="background: var(--input-bg); padding: 1rem; text-align: center; border-radius: 8px;">
                        <span style="display: block; font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Marking</span>
                        <span style="font-size: 1.5rem; font-weight: bold; color: var(--text-primary);">${escapeHtml(marking)}</span>
                    </div>
                    <div class="rating-box" style="background: var(--input-bg); padding: 1rem; text-align: center; border-radius: 8px;">
                        <span style="display: block; font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Behavior</span>
                        <span style="font-size: 1.5rem; font-weight: bold; color: var(--text-primary);">${escapeHtml(behavior)}</span>
                    </div>
                </div>
                
                <div class="verdict-box" style="border-left: 3px solid var(--text-primary); padding-left: 1.5rem; margin-bottom: 2rem;">
                    <span style="display: block; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem; font-weight: 600; letter-spacing: 0.5px;">Overall Review</span>
                    <p style="margin: 0; line-height: 1.6; color: var(--text-primary); font-size: 0.95rem; font-weight: 400;">${escapeHtml(overallSummary)}</p>
                </div>

                <div class="details-box">
                    <span style="display: block; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 1rem; font-weight: 600; letter-spacing: 0.5px;">Students Insight</span>
                    ${parseInsights(statisticalInsights)}
                </div>
            </div>
            
            <div class="card-footer" style="border-top: 1px solid var(--border-color);">
                <span class="footer-link" onclick="toggleAboutCard()">About this data</span>
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
            <div class="card-header" style="padding: 2rem; border-bottom: 1px solid var(--border-color);">
                <h2 style="margin: 0; font-size: 1.5rem; color: var(--text-primary); font-weight: 700; letter-spacing: -0.02em;">About this data</h2>
            </div>
            <div class="card-body" style="padding: 2rem;">
                <p style="margin: 0 0 1.5rem 0; color: var(--text-primary); font-size: 0.95rem; line-height: 1.7; font-weight: 400;">
                    The BRACU Faculty & Course Review group is a goldmine of information, but finding actual reviews means scrolling through memes, jokes, and off-topic chaos.
                </p>
                
                <div style="margin-bottom: 2rem;">
                    <h3 style="font-size: 0.875rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.75rem; letter-spacing: 0.3px;">Here's what I did:</h3>
                    <ul style="margin-left: 1.25rem; color: var(--text-primary); font-size: 0.95rem; line-height: 1.8;">
                        <li style="margin-bottom: 0.5rem;">Searched the group for each faculty</li>
                        <li style="margin-bottom: 0.5rem;">Collected recent posts with real reviews</li>
                        <li style="margin-bottom: 0.5rem;">Filtered out memes and noise</li>
                        <li style="margin-bottom: 0.5rem;">Used AI to summarize what students actually said</li>
                    </ul>
                </div>
                
                <p style="margin: 0 0 1.5rem 0; color: var(--text-primary); font-size: 0.95rem; line-height: 1.7; font-weight: 400;">
                    So you get the consensus in 10 seconds instead of 2 hours.
                </p>
                
                <div style="margin-bottom: 2rem;">
                    <h3 style="font-size: 0.875rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.75rem; letter-spacing: 0.3px;">Is this official?</h3>
                    <p style="margin: 0; color: var(--text-primary); font-size: 0.95rem; line-height: 1.7; font-weight: 400;">
                        Nope. This is real student feedback from Facebook, just organized and summarized. Take it as one input for your decisions, not the only one.
                    </p>
                </div>
                
                <div style="margin-bottom: 0;">
                    <h3 style="font-size: 0.875rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.75rem; letter-spacing: 0.3px;">Current Status:</h3>
                    <p style="margin: 0; color: var(--text-primary); font-size: 0.95rem; line-height: 1.7; font-weight: 400;">
                        This is a beta version. Right now, it only covers CSE department faculty. More departments coming soon based on demand.
                    </p>
                </div>
            </div>
            
            <div class="card-footer" style="border-top: 1px solid var(--border-color);">
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
