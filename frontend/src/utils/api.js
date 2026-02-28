const API_BASE = import.meta.env.DEV ? 'http://localhost:8000/api' : '/api';

// ── Token Management ──
function getToken() {
  return localStorage.getItem('sage_token');
}

function setToken(token) {
  localStorage.setItem('sage_token', token);
}

function clearToken() {
  localStorage.removeItem('sage_token');
  localStorage.removeItem('sage_user');
}

function getHeaders(withAuth = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (withAuth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ── Base API call ──
async function apiCall(endpoint, body, method = 'POST', withAuth = false) {
  const options = {
    method,
    headers: getHeaders(withAuth),
  };
  if (body && method !== 'GET' && method !== 'DELETE') {
    options.body = JSON.stringify(body);
  }
  const url = method === 'GET' && body
    ? `${API_BASE}/${endpoint}?${new URLSearchParams(body)}`
    : `${API_BASE}/${endpoint}`;

  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Auth API ──
export async function registerUser(name, email, password) {
  const data = await apiCall('auth/register', { name, email, password });
  setToken(data.token);
  localStorage.setItem('sage_user', JSON.stringify(data.user));
  return data;
}

export async function loginUser(email, password) {
  const data = await apiCall('auth/login', { email, password });
  setToken(data.token);
  localStorage.setItem('sage_user', JSON.stringify(data.user));
  return data;
}

export async function getMe() {
  const data = await apiCall('auth/me', null, 'GET', true);
  return data.user;
}

export async function logoutUser() {
  try {
    await apiCall('auth/logout', null, 'POST', true);
  } catch (e) { /* ignore */ }
  clearToken();
}

export function getSavedUser() {
  try {
    const u = localStorage.getItem('sage_user');
    const t = getToken();
    if (u && t) return JSON.parse(u);
  } catch (e) { /* ignore */ }
  return null;
}

// ── History API ──
export function saveHistoryItem(action, language, code, resultPreview = '') {
  return apiCall('history/save', { action, language, code, result_preview: resultPreview }, 'POST', true);
}

export async function getHistory() {
  const data = await apiCall('history', null, 'GET', true);
  return data.history;
}

export function deleteHistoryItem(itemId) {
  return fetch(`${API_BASE}/history/${itemId}`, {
    method: 'DELETE',
    headers: getHeaders(true),
  }).then(r => r.json());
}

export function clearHistoryAPI() {
  return fetch(`${API_BASE}/history`, {
    method: 'DELETE',
    headers: getHeaders(true),
  }).then(r => r.json());
}

// ── AI Feature APIs ──
export function reviewCode(code, language, focusAreas) {
  return apiCall('review', { code, language, focus_areas: focusAreas });
}

export function rewriteCode(code, language, instructions = '') {
  return apiCall('rewrite', { code, language, instructions });
}

export function visualizeCode(code, language) {
  return apiCall('visualize', { code, language });
}

export function explainCode(code, language) {
  return apiCall('explain', { code, language });
}

export function generateTests(code, language) {
  return apiCall('generate-tests', { code, language });
}

export function debugCode(code, language, errorMessage) {
  return apiCall('debug', { code, language, error_message: errorMessage });
}

export function getMetrics(code, language) {
  return apiCall('metrics', { code, language });
}

export function chatWithAI(code, language, message, history) {
  return apiCall('chat', { code, language, message, history });
}

export function visualizeDS(code, language) {
  return apiCall('visualize-ds', { code, language });
}

export function convertCode(code, language, targetLanguage) {
  return apiCall('convert', { code, language, target_language: targetLanguage });
}

export function identifyPattern(code, language) {
  return apiCall('pattern', { code, language });
}

export function generatePractice(topic, difficulty, language) {
  return apiCall('practice', { topic, difficulty, language });
}

// ── Snippets API ──
export function getSnippets() {
  return apiCall('snippets', null, 'GET', true);
}

export function saveSnippet(title, code, language, notes = '', folderId = null) {
  return apiCall('snippets', { title, code, language, notes, folder_id: folderId }, 'POST', true);
}

export function deleteSnippet(id) {
  return fetch(`${API_BASE}/snippets/${id}`, { method: 'DELETE', headers: getHeaders(true) }).then(r => r.json());
}

export function getFolders() {
  return apiCall('folders', null, 'GET', true);
}

export function createFolder(name) {
  return apiCall('folders', { name }, 'POST', true);
}

export function deleteFolder(id) {
  return fetch(`${API_BASE}/folders/${id}`, { method: 'DELETE', headers: getHeaders(true) }).then(r => r.json());
}

// ── Code Execution API (Piston) ──
export async function executeCode(code, language) {
  const langMap = {
    python: 'python', javascript: 'javascript', java: 'java', cpp: 'cpp', c: 'c',
    go: 'go', rust: 'rust', php: 'php', ruby: 'ruby', swift: 'swift', csharp: 'csharp',
    kotlin: 'kotlin', typescript: 'typescript', html: 'html' // note: HTML doesn't run well in piston directly but we map it
  };
  const versionMap = {
    python: '3.10.0', javascript: '18.15.0', java: '15.0.2', cpp: '10.2.0', c: '10.2.0',
    go: '1.16.2', rust: '1.68.2', php: '8.2.3', ruby: '3.0.1', swift: '5.3.3',
    csharp: '6.12.0', kotlin: '1.8.20', typescript: '5.0.3'
  };

  const pistonLang = langMap[language] || language;
  const version = versionMap[language] || '*';

  const res = await fetch('https://emkc.org/api/v2/piston/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: pistonLang,
      version: version,
      files: [{ content: code }]
    })
  });

  if (!res.ok) throw new Error('Execution engine failed');
  const data = await res.json();
  if (data.run?.stderr && !data.run?.stdout) throw new Error(data.run.stderr);
  return data.run?.stdout || data.run?.stderr || 'Code executed successfully (no output)';
}
