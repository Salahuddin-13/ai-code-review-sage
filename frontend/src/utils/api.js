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
