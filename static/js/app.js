/**
 * ═══════════════════════════════════════════════
 *  AI Code Review & Rewrite Agent — Frontend v2
 *  D3.js graph, Explain, Dark/Light, Download
 * ═══════════════════════════════════════════════
 */

// ── Configure Markdown ──
marked.setOptions({
    highlight: function (code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
    },
    breaks: true,
    gfm: true,
});

// ── State ──
let currentTab = 'review';
let lastReviewData = null;
let lastRewriteData = null;
let lastVisualizeData = null;
let lastExplainData = null;
let isDark = true;

// ── DOM Helpers ──
const $ = (id) => document.getElementById(id);
const getCode = () => $('codeInput').value;
const getLanguage = () => $('languageSelect').value;
const getFocusAreas = () =>
    [...document.querySelectorAll('.focus-checkbox:checked')].map(cb => cb.value);

// ──────────────────────────────────────────────
// DARK / LIGHT MODE
// ──────────────────────────────────────────────
function toggleTheme() {
    isDark = !isDark;
    document.documentElement.classList.toggle('dark', isDark);
    $('themeIcon').className = isDark ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    // Switch highlight.js theme
    const hljsLink = document.getElementById('hljs-theme');
    hljsLink.href = isDark
        ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css'
        : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// Restore saved theme
(function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
        isDark = false;
        document.documentElement.classList.remove('dark');
        $('themeIcon').className = 'fa-solid fa-sun';
        const hljsLink = document.getElementById('hljs-theme');
        hljsLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css';
    }
})();

// ──────────────────────────────────────────────
// TAB SWITCHING
// ──────────────────────────────────────────────
function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    $(`tab${cap(tab)}`).classList.add('tab-active');
    $(`panel${cap(tab)}`).classList.add('active');

    const hasContent = tab === 'review' ? lastReviewData
        : tab === 'rewrite' ? lastRewriteData
            : tab === 'visualize' ? lastVisualizeData
                : lastExplainData;
    $('copyBtn').classList.toggle('hidden', !hasContent);
    $('downloadBtn').classList.toggle('hidden', !(tab === 'rewrite' && lastRewriteData));
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ──────────────────────────────────────────────
// LOADING / TOAST
// ──────────────────────────────────────────────
function showLoading(title, subtitle) {
    $('loadingTitle').textContent = title;
    $('loadingSubtitle').textContent = subtitle;
    $('loadingOverlay').classList.remove('hidden');
    setDisabled(true);
}
function hideLoading() {
    $('loadingOverlay').classList.add('hidden');
    setDisabled(false);
}
function setDisabled(d) {
    ['reviewBtn', 'rewriteBtn', 'visualizeBtn', 'explainBtn'].forEach(id => $(id).disabled = d);
}
function showToast(msg) {
    $('toastMessage').textContent = msg;
    $('toast').classList.remove('hidden');
    setTimeout(() => $('toast').classList.add('hidden'), 3000);
}

// ──────────────────────────────────────────────
// QUALITY SCORE GAUGE
// ──────────────────────────────────────────────
function animateScore(score) {
    $('scoreCard').classList.remove('hidden');
    const arc = $('scoreArc');
    const valEl = $('scoreValue');
    const lbl = $('scoreLabel');

    setTimeout(() => arc.setAttribute('stroke-dasharray', `${score}, 100`), 100);

    let cur = 0;
    const step = Math.max(1, Math.ceil(score / 40));
    const iv = setInterval(() => {
        cur = Math.min(cur + step, score);
        valEl.textContent = cur;
        if (cur >= score) clearInterval(iv);
    }, 30);

    if (score >= 90) lbl.textContent = '🏆 Excellent — Production ready';
    else if (score >= 75) lbl.textContent = '✅ Good — Minor improvements needed';
    else if (score >= 60) lbl.textContent = '⚠️ Fair — Several issues to address';
    else if (score >= 40) lbl.textContent = '🔶 Needs Work — Significant issues';
    else lbl.textContent = '🔴 Poor — Major refactoring required';

    const grad = document.querySelector('#scoreGradient');
    if (score >= 75) { grad.children[0].setAttribute('stop-color', '#10b981'); grad.children[1].setAttribute('stop-color', '#06b6d4'); }
    else if (score >= 50) { grad.children[0].setAttribute('stop-color', '#f59e0b'); grad.children[1].setAttribute('stop-color', '#eab308'); }
    else { grad.children[0].setAttribute('stop-color', '#ef4444'); grad.children[1].setAttribute('stop-color', '#f59e0b'); }
}

function renderSeverityPills(counts) {
    const c = $('severityPills');
    c.innerHTML = '';
    [
        { key: 'critical', label: 'Critical', cls: 'severity-critical', icon: 'fa-circle-exclamation' },
        { key: 'high', label: 'High', cls: 'severity-high', icon: 'fa-triangle-exclamation' },
        { key: 'medium', label: 'Medium', cls: 'severity-medium', icon: 'fa-circle-info' },
        { key: 'low', label: 'Low', cls: 'severity-low', icon: 'fa-circle-check' },
    ].forEach(item => {
        const pill = document.createElement('span');
        pill.className = `severity-pill ${item.cls}`;
        pill.innerHTML = `<i class="fa-solid ${item.icon}"></i> ${counts[item.key] || 0} ${item.label}`;
        c.appendChild(pill);
    });
}

// ──────────────────────────────────────────────
// MARKDOWN RENDERER
// ──────────────────────────────────────────────
function renderMarkdown(text, container) {
    container.innerHTML = marked.parse(text);
    container.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
    // Add copy buttons to code blocks
    container.querySelectorAll('pre').forEach(pre => {
        pre.style.position = 'relative';
        const btn = document.createElement('button');
        btn.className = 'code-copy-btn';
        btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
        btn.onclick = () => {
            const code = pre.querySelector('code')?.textContent || pre.textContent;
            navigator.clipboard.writeText(code).then(() => {
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                setTimeout(() => { btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy'; }, 2000);
            });
        };
        pre.appendChild(btn);
    });
}

// ──────────────────────────────────────────────
// API CALL
// ──────────────────────────────────────────────
async function apiCall(endpoint, body) {
    const res = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
}

// ──────────────────────────────────────────────
// REVIEW CODE
// ──────────────────────────────────────────────
async function reviewCode() {
    const code = getCode();
    if (!code.trim()) { showToast('⚠️ Please paste some code first'); return; }
    showLoading('🔍 Reviewing Code...', 'Analyzing for bugs, performance, security & best practices');
    try {
        const data = await apiCall('review', { code, language: getLanguage(), focus_areas: getFocusAreas() });
        lastReviewData = data;
        animateScore(data.quality_score);
        renderSeverityPills(data.severity_counts);
        $('reviewPlaceholder').classList.add('hidden');
        $('reviewContent').classList.remove('hidden');
        renderMarkdown(data.review, $('reviewContent'));
        switchTab('review');
        showToast('✅ Code review complete');
    } catch (err) { showToast(`❌ Error: ${err.message}`); }
    finally { hideLoading(); }
}

// ──────────────────────────────────────────────
// REWRITE CODE
// ──────────────────────────────────────────────
async function rewriteCode() {
    const code = getCode();
    if (!code.trim()) { showToast('⚠️ Please paste some code first'); return; }
    showLoading('✨ Rewriting Code...', 'Optimizing and refactoring for production quality');
    try {
        const data = await apiCall('rewrite', { code, language: getLanguage() });
        lastRewriteData = data;
        $('rewritePlaceholder').classList.add('hidden');
        $('rewriteContent').classList.remove('hidden');
        renderMarkdown(data.rewrite, $('rewriteContent'));
        switchTab('rewrite');
        showToast('✅ Code rewrite complete');
    } catch (err) { showToast(`❌ Error: ${err.message}`); }
    finally { hideLoading(); }
}

// ──────────────────────────────────────────────
// VISUALIZE CODE — D3.js Force-Directed Graph
// ──────────────────────────────────────────────
const NODE_COLORS = {
    start: '#10b981',
    end: '#ef4444',
    function: '#6366f1',
    class: '#8b5cf6',
    condition: '#f59e0b',
    loop: '#ec4899',
    io: '#06b6d4',
    operation: '#64748b',
};

function renderD3Graph(graphData) {
    const container = $('d3Graph');
    container.innerHTML = '';

    const width = container.clientWidth;
    const height = container.clientHeight || 400;

    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    // Arrow marker
    svg.append('defs').append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 28)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', isDark ? '#6b7280' : '#9ca3af');

    const g = svg.append('g');

    // Zoom
    const zoom = d3.zoom()
        .scaleExtent([0.3, 3])
        .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    const nodes = graphData.nodes.map(n => ({ ...n }));
    const links = graphData.links.map(l => ({
        source: typeof l.source === 'string' ? l.source : l.source.id,
        target: typeof l.target === 'string' ? l.target : l.target.id,
        label: l.label || ''
    }));

    const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(120))
        .force('charge', d3.forceManyBody().strength(-350))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(35));

    // Links
    const link = g.append('g')
        .selectAll('line')
        .data(links)
        .join('line')
        .attr('stroke', isDark ? '#4b5563' : '#d1d5db')
        .attr('stroke-width', 1.5)
        .attr('marker-end', 'url(#arrowhead)');

    // Link labels
    const linkLabel = g.append('g')
        .selectAll('text')
        .data(links.filter(l => l.label))
        .join('text')
        .text(d => d.label)
        .attr('font-size', '9px')
        .attr('fill', isDark ? '#6b7280' : '#9ca3af')
        .attr('text-anchor', 'middle')
        .attr('font-family', 'Inter, sans-serif');

    // Nodes group
    const node = g.append('g')
        .selectAll('g')
        .data(nodes)
        .join('g')
        .call(d3.drag()
            .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
            .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
            .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

    // Node shapes
    node.each(function (d) {
        const el = d3.select(this);
        const color = NODE_COLORS[d.type] || NODE_COLORS.operation;
        if (d.type === 'condition') {
            el.append('rect')
                .attr('width', 28).attr('height', 28)
                .attr('x', -14).attr('y', -14)
                .attr('rx', 4)
                .attr('transform', 'rotate(45)')
                .attr('fill', color + '22')
                .attr('stroke', color)
                .attr('stroke-width', 2);
        } else {
            el.append('circle')
                .attr('r', d.type === 'start' || d.type === 'end' ? 16 : 20)
                .attr('fill', color + '22')
                .attr('stroke', color)
                .attr('stroke-width', 2);
        }
    });

    // Node labels
    node.append('text')
        .text(d => d.label.length > 16 ? d.label.slice(0, 14) + '…' : d.label)
        .attr('text-anchor', 'middle')
        .attr('dy', d => (d.type === 'start' || d.type === 'end') ? 32 : 36)
        .attr('font-size', '10px')
        .attr('font-weight', '500')
        .attr('font-family', 'Inter, sans-serif')
        .attr('fill', isDark ? '#d1d5db' : '#374151');

    // Node icons (emoji)
    const icons = { start: '▶', end: '■', function: 'ƒ', class: '◆', condition: '?', loop: '↻', io: '⇄', operation: '⚙' };
    node.append('text')
        .text(d => icons[d.type] || '⚙')
        .attr('text-anchor', 'middle')
        .attr('dy', '4px')
        .attr('font-size', d => d.type === 'start' || d.type === 'end' ? '12px' : '14px')
        .attr('fill', d => NODE_COLORS[d.type] || NODE_COLORS.operation);

    // Tooltip
    const tooltip = d3.select(container).append('div').attr('class', 'd3-tooltip').style('display', 'none');
    node.on('mouseover', (e, d) => {
        tooltip.style('display', 'block')
            .html(`<strong>${d.label}</strong><br><span style="opacity:0.7">${d.detail || d.type}</span>`);
    })
        .on('mousemove', (e) => {
            const rect = container.getBoundingClientRect();
            tooltip.style('left', (e.clientX - rect.left + 12) + 'px')
                .style('top', (e.clientY - rect.top - 10) + 'px');
        })
        .on('mouseout', () => tooltip.style('display', 'none'));

    simulation.on('tick', () => {
        link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
        linkLabel.attr('x', d => (d.source.x + d.target.x) / 2)
            .attr('y', d => (d.source.y + d.target.y) / 2);
        node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Render legend
    const legendContainer = container.parentElement.querySelector('.graph-legend');
    if (legendContainer) {
        const usedTypes = [...new Set(nodes.map(n => n.type))];
        legendContainer.innerHTML = usedTypes.map(t =>
            `<span class="legend-item"><span class="legend-dot" style="background:${NODE_COLORS[t] || '#64748b'}"></span>${cap(t)}</span>`
        ).join('');
    }
}

async function visualizeCode() {
    const code = getCode();
    if (!code.trim()) { showToast('⚠️ Please paste some code first'); return; }
    showLoading('🔮 Visualizing Code Flow...', 'Generating interactive force-directed graph');
    try {
        const data = await apiCall('visualize', { code, language: getLanguage() });
        lastVisualizeData = data;
        $('visualizePlaceholder').classList.add('hidden');
        $('visualizeContent').classList.remove('hidden');
        renderD3Graph(data.graph);

        // Render summary bullets
        const summaryEl = $('vizSummary');
        if (data.graph.summary && data.graph.summary.length) {
            const md = '## 🔍 Code Flow Summary\n' + data.graph.summary.map(s => `- ${s}`).join('\n');
            renderMarkdown(md, summaryEl);
        }
        switchTab('visualize');
        showToast('✅ Visualization complete');
    } catch (err) { showToast(`❌ Error: ${err.message}`); }
    finally { hideLoading(); }
}

// ──────────────────────────────────────────────
// EXPLAIN CODE
// ──────────────────────────────────────────────
async function explainCode() {
    const code = getCode();
    if (!code.trim()) { showToast('⚠️ Please paste some code first'); return; }
    showLoading('📖 Explaining Code...', 'Generating detailed line-by-line explanation');
    try {
        const data = await apiCall('explain', { code, language: getLanguage() });
        lastExplainData = data;
        $('explainPlaceholder').classList.add('hidden');
        $('explainContent').classList.remove('hidden');
        renderMarkdown(data.explanation, $('explainContent'));
        switchTab('explain');
        showToast('✅ Explanation complete');
    } catch (err) { showToast(`❌ Error: ${err.message}`); }
    finally { hideLoading(); }
}

// ──────────────────────────────────────────────
// COPY & DOWNLOAD
// ──────────────────────────────────────────────
function copyOutput() {
    let text = '';
    if (currentTab === 'review' && lastReviewData) text = lastReviewData.review;
    if (currentTab === 'rewrite' && lastRewriteData) text = lastRewriteData.rewritten_code || lastRewriteData.rewrite;
    if (currentTab === 'visualize' && lastVisualizeData) text = JSON.stringify(lastVisualizeData.graph, null, 2);
    if (currentTab === 'explain' && lastExplainData) text = lastExplainData.explanation;
    if (text) navigator.clipboard.writeText(text).then(() => showToast('📋 Copied to clipboard'));
}

function downloadOutput() {
    if (currentTab === 'rewrite' && lastRewriteData && lastRewriteData.rewritten_code) {
        const lang = lastRewriteData.language || 'txt';
        const exts = { python: 'py', javascript: 'js', java: 'java', cpp: 'cpp', csharp: 'cs', go: 'go', rust: 'rs', typescript: 'ts', php: 'php', ruby: 'rb', swift: 'swift', kotlin: 'kt' };
        const ext = exts[lang] || 'txt';
        const blob = new Blob([lastRewriteData.rewritten_code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rewritten_code.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`📥 Downloaded rewritten_code.${ext}`);
    }
}

function clearCode() { $('codeInput').value = ''; $('codeInput').focus(); }

// ── Sample Code ──
function loadSample() {
    const lang = getLanguage();
    const samples = {
        python: `import os
import pickle

def get_user_data(user_id):
    # Fetching user data from database
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    query = "SELECT * FROM users WHERE id = " + str(user_id)
    cursor.execute(query)
    result = cursor.fetchone()
    conn.close()
    return result

def process_file(filename):
    f = open(filename, "r")
    data = f.read()
    # Process the data
    result = eval(data)
    return result

def calculate_average(numbers):
    total = 0
    for i in range(len(numbers)):
        total = total + numbers[i]
    avg = total / len(numbers)
    return avg

class UserManager:
    def __init__(self):
        self.users = []
    
    def add_user(self, name, password):
        user = {"name": name, "password": password}
        self.users.append(user)
    
    def find_user(self, name):
        for i in range(len(self.users)):
            if self.users[i]["name"] == name:
                return self.users[i]
        return None

    def save_users(self, filename):
        data = pickle.dumps(self.users)
        f = open(filename, "wb")
        f.write(data)
        f.close()`,

        javascript: `const express = require('express');
const app = express();

function login(username, password) {
    var query = "SELECT * FROM users WHERE username='" + username + "' AND password='" + password + "'";
    var result = db.execute(query);
    if (result) { return true; }
    return false;
}

function processData(data) {
    var result = [];
    for (var i = 0; i < data.length; i++) {
        if (data[i] != null && data[i] != undefined && data[i] != '') {
            result.push(data[i]);
        }
    }
    return result;
}

function getStats(numbers) {
    let sum = 0;
    for (let i = 0; i < numbers.length; i++) {
        sum = sum + numbers[i];
    }
    let avg = sum / numbers.length;
    let max = numbers[0];
    for (let i = 0; i < numbers.length; i++) {
        if (numbers[i] > max) max = numbers[i];
    }
    return { average: avg, maximum: max };
}

app.post('/upload', function(req, res) {
    eval(req.body.code);
    res.send('Done');
});

app.listen(3000);`,

        java: `import java.sql.*;
import java.util.*;

public class UserService {
    public User getUser(String userId) {
        Connection conn = null;
        try {
            conn = DriverManager.getConnection("jdbc:mysql://localhost/db", "root", "password123");
            String query = "SELECT * FROM users WHERE id = " + userId;
            Statement stmt = conn.createStatement();
            ResultSet rs = stmt.executeQuery(query);
            if (rs.next()) {
                User user = new User();
                user.name = rs.getString("name");
                user.email = rs.getString("email");
                user.password = rs.getString("password");
                return user;
            }
        } catch (Exception e) {
            System.out.println(e.getMessage());
        }
        return null;
    }
    
    public double calculateAvg(int[] numbers) {
        int sum = 0;
        for (int i = 0; i < numbers.length; i++) { sum += numbers[i]; }
        return sum / numbers.length;
    }
}`,

        cpp: `#include <iostream>
#include <string>
using namespace std;

class DataProcessor {
public:
    int* data;
    int size;
    DataProcessor(int s) { size = s; data = new int[s]; }

    void loadData(int values[], int count) {
        for (int i = 0; i <= count; i++) { data[i] = values[i]; }
    }

    double getAverage() {
        int sum = 0;
        for (int i = 0; i < size; i++) { sum += data[i]; }
        return sum / size;
    }

    char* getUserInput() {
        char buffer[10];
        gets(buffer);
        return buffer;
    }

    void processString(string input) {
        char* str = (char*)malloc(input.length());
        strcpy(str, input.c_str());
        printf(str);
    }
};

int main() {
    DataProcessor* dp = new DataProcessor(100);
    int vals[] = {1, 2, 3, 4, 5};
    dp->loadData(vals, 5);
    cout << dp->getAverage() << endl;
    return 0;
}`,
    };
    $('codeInput').value = samples[lang] || samples.python;
    showToast(`🧪 Loaded sample ${lang} code`);
}

// ── Keyboard Shortcuts ──
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); reviewCode(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') { e.preventDefault(); rewriteCode(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') { e.preventDefault(); visualizeCode(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') { e.preventDefault(); explainCode(); }
});

// ── Tab support in textarea ──
$('codeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        const ta = e.target, s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.substring(0, s) + '    ' + ta.value.substring(en);
        ta.selectionStart = ta.selectionEnd = s + 4;
    }
});
