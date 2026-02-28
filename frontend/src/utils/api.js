const API_BASE = import.meta.env.DEV ? 'http://localhost:8000/api' : '/api';

async function apiCall(endpoint, body) {
  const res = await fetch(`${API_BASE}/${endpoint}`, {
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
