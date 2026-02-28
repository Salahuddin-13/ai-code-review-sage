import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search, Wand2, Eye, GraduationCap, FlaskConical, Bug, History,
  GitCompareArrows, MessageSquare, Sun, Moon, Trash2, Copy, Download,
  ChevronDown, ChevronRight, Send, X, BarChart3, Code2, BrainCircuit,
  Activity, Shield, Zap, FileCode, Boxes
} from 'lucide-react';
import * as api from './utils/api';
import {
  renderMarkdownToHTML, highlightAllCode, getFileExtension,
  downloadFile, copyToClipboard, countLines, countFunctions, SAMPLE_CODES
} from './utils/helpers';
import './App.css';

const TABS = [
  { id: 'review', label: 'Review', icon: Search },
  { id: 'rewrite', label: 'Rewrite', icon: Wand2 },
  { id: 'tests', label: 'Tests', icon: FlaskConical },
  { id: 'visualize', label: 'Visualize', icon: Eye },
  { id: 'explain', label: 'Explain', icon: GraduationCap },
  { id: 'debug', label: 'Debug', icon: Bug },
  { id: 'compare', label: 'Compare', icon: GitCompareArrows },
  { id: 'history', label: 'History', icon: History },
];

const NAV_ITEMS = [
  {
    section: 'Analysis', items: [
      { id: 'review', label: 'Code Review', icon: Search },
      { id: 'rewrite', label: 'Rewrite & Optimize', icon: Wand2 },
      { id: 'explain', label: 'Explain Code', icon: GraduationCap },
    ]
  },
  {
    section: 'Generation', items: [
      { id: 'tests', label: 'Generate Tests', icon: FlaskConical },
      { id: 'debug', label: 'Debug Mode', icon: Bug },
    ]
  },
  {
    section: 'Visualization', items: [
      { id: 'visualize', label: 'Code Flow', icon: Eye },
      { id: 'ds-viz', label: 'Data Structures', icon: Boxes },
    ]
  },
  {
    section: 'Utilities', items: [
      { id: 'compare', label: 'Compare View', icon: GitCompareArrows },
      { id: 'history', label: 'Session History', icon: History },
    ]
  },
];

const LANGUAGES = [
  'python', 'javascript', 'java', 'c', 'cpp', 'csharp',
  'go', 'rust', 'typescript', 'php', 'ruby', 'swift', 'kotlin',
];

function App() {
  // State
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [focusAreas, setFocusAreas] = useState(['bugs', 'performance', 'security', 'best practices']);
  const [rewriteFocus, setRewriteFocus] = useState(['performance', 'security', 'readability']);
  const [activeTab, setActiveTab] = useState('review');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [loading, setLoading] = useState(null);
  const [toast, setToast] = useState(null);

  // Data states
  const [reviewData, setReviewData] = useState(null);
  const [rewriteData, setRewriteData] = useState(null);
  const [testsData, setTestsData] = useState(null);
  const [visualizeData, setVisualizeData] = useState(null);
  const [explainData, setExplainData] = useState(null);
  const [debugData, setDebugData] = useState(null);
  const [metricsData, setMetricsData] = useState(null);
  const [dsVizData, setDsVizData] = useState(null);

  // Debug mode
  const [errorMessage, setErrorMessage] = useState('');

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // Session history
  const [sessionHistory, setSessionHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('codeReviewHistory') || '[]'); }
    catch { return []; }
  });

  // Metrics
  const [localMetrics, setLocalMetrics] = useState({ lines: 0, functions: 0 });

  // Refs
  const outputRef = useRef(null);
  const graphRef = useRef(null);
  const toastTimer = useRef(null);

  // Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Local metrics update
  useEffect(() => {
    setLocalMetrics({
      lines: code ? countLines(code) : 0,
      functions: code ? countFunctions(code, language) : 0,
    });
  }, [code, language]);

  // Toast
  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Highlight code blocks after render
  useEffect(() => {
    if (outputRef.current) {
      highlightAllCode(outputRef.current);
      // Add copy buttons
      outputRef.current.querySelectorAll('pre').forEach((pre) => {
        if (pre.querySelector('.code-copy-btn')) return;
        pre.style.position = 'relative';
        const btn = document.createElement('button');
        btn.className = 'code-copy-btn';
        btn.innerHTML = '📋 Copy';
        btn.onclick = () => {
          const codeText = pre.querySelector('code')?.textContent || pre.textContent;
          copyToClipboard(codeText).then(() => {
            btn.innerHTML = '✓ Copied!';
            setTimeout(() => { btn.innerHTML = '📋 Copy'; }, 2000);
          });
        };
        pre.appendChild(btn);
      });
    }
  }, [reviewData, rewriteData, testsData, explainData, debugData, activeTab]);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('codeReviewHistory', JSON.stringify(sessionHistory.slice(0, 50)));
  }, [sessionHistory]);

  // Toggle focus area
  const toggleFocus = (area) => {
    setFocusAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  // ── API Actions ──
  const handleReview = async () => {
    if (!code.trim()) { showToast('⚠️ Please paste some code first'); return; }
    setLoading({ title: '🔍 Reviewing Code...', sub: 'Analyzing for bugs, performance & security' });
    try {
      const data = await api.reviewCode(code, language, focusAreas);
      setReviewData(data);
      setActiveTab('review');
      saveToHistory('Review', code, language);
      // Check for language mismatch
      if (data.detected_language && data.detected_language !== language) {
        setLanguage(data.detected_language);
        showToast(`⚠️ Language mismatch! Code appears to be ${data.detected_language.toUpperCase()}, switched automatically`);
      } else {
        showToast('✅ Code review complete');
      }
      // Fetch metrics with correct language
      const metricLang = data.detected_language || language;
      api.getMetrics(code, metricLang).then(setMetricsData).catch(() => { });
    } catch (err) { showToast(`❌ ${err.message}`); }
    finally { setLoading(null); }
  };

  const handleRewrite = async () => {
    if (!code.trim()) { showToast('⚠️ Please paste some code first'); return; }
    const instructions = rewriteFocus.length > 0
      ? `Focus on optimizing for: ${rewriteFocus.join(', ')}. Prioritize ${rewriteFocus[0]} improvements.`
      : '';
    setLoading({ title: '✨ Rewriting Code...', sub: `Optimizing for ${rewriteFocus.join(', ') || 'production quality'}` });
    try {
      const data = await api.rewriteCode(code, language, instructions);
      setRewriteData(data);
      setActiveTab('rewrite');
      saveToHistory('Rewrite', code, language);
      showToast('✅ Code rewrite complete');
    } catch (err) { showToast(`❌ ${err.message}`); }
    finally { setLoading(null); }
  };

  const handleVisualize = async () => {
    if (!code.trim()) { showToast('⚠️ Please paste some code first'); return; }
    setLoading({ title: '🔮 Visualizing Code...', sub: 'Generating interactive flow graph' });
    try {
      const data = await api.visualizeCode(code, language);
      setVisualizeData(data);
      setActiveTab('visualize');
      showToast('✅ Visualization complete');
    } catch (err) { showToast(`❌ ${err.message}`); }
    finally { setLoading(null); }
  };

  const handleExplain = async () => {
    if (!code.trim()) { showToast('⚠️ Please paste some code first'); return; }
    setLoading({ title: '📖 Explaining Code...', sub: 'Generating detailed breakdown' });
    try {
      const data = await api.explainCode(code, language);
      setExplainData(data);
      setActiveTab('explain');
      showToast('✅ Explanation complete');
    } catch (err) { showToast(`❌ ${err.message}`); }
    finally { setLoading(null); }
  };

  const handleGenerateTests = async () => {
    if (!code.trim()) { showToast('⚠️ Please paste some code first'); return; }
    setLoading({ title: '🧪 Generating Tests...', sub: 'Creating unit tests, edge cases & failure scenarios' });
    try {
      const data = await api.generateTests(code, language);
      setTestsData(data);
      setActiveTab('tests');
      showToast('✅ Tests generated');
    } catch (err) { showToast(`❌ ${err.message}`); }
    finally { setLoading(null); }
  };

  const handleDebug = async () => {
    if (!code.trim()) { showToast('⚠️ Please paste code first'); return; }
    // If no error message yet, switch to debug tab to show the error input
    if (!errorMessage.trim()) {
      setActiveTab('debug');
      showToast('📝 Enter the error message below, then click Debug again');
      return;
    }
    setLoading({ title: '🐞 Debugging...', sub: 'Analyzing error and generating fix' });
    try {
      const data = await api.debugCode(code, language, errorMessage);
      setDebugData(data);
      setActiveTab('debug');
      showToast('✅ Debug analysis complete');
    } catch (err) { showToast(`❌ ${err.message}`); }
    finally { setLoading(null); }
  };

  const handleDSVisualize = async () => {
    if (!code.trim()) { showToast('⚠️ Please paste some code first'); return; }
    setLoading({ title: '🔗 Visualizing Data Structure...', sub: 'Extracting linked list, tree, graph structure' });
    try {
      const data = await api.visualizeDS(code, language);
      setDsVizData(data);
      setActiveTab('ds-viz');
      showToast('✅ Data structure visualized');
    } catch (err) { showToast(`❌ ${err.message}`); }
    finally { setLoading(null); }
  };

  // Chat
  const handleChat = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);
    try {
      const history = chatMessages.map((m) => ({ role: m.role, content: m.content }));
      const data = await api.chatWithAI(code, language, userMsg, history);
      setChatMessages((prev) => [...prev, { role: 'ai', content: data.response }]);
    } catch (err) {
      setChatMessages((prev) => [...prev, { role: 'ai', content: `Error: ${err.message}` }]);
    }
    setChatLoading(false);
  };

  // History
  const saveToHistory = (action, codeStr, lang) => {
    const entry = {
      id: Date.now(),
      action,
      language: lang,
      code: codeStr.substring(0, 500),
      timestamp: new Date().toLocaleString(),
    };
    setSessionHistory((prev) => [entry, ...prev]);
  };

  const restoreFromHistory = (entry) => {
    setCode(entry.code);
    setLanguage(entry.language);
    showToast('📂 Code restored from history');
  };

  const clearHistory = () => {
    setSessionHistory([]);
    localStorage.removeItem('codeReviewHistory');
    showToast('🗑️ History cleared');
  };

  // Render helpers
  const isLoading = !!loading;

  const renderNavItem = (item) => (
    <button
      key={item.id}
      className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
      onClick={() => setActiveTab(item.id)}
    >
      <item.icon />
      {item.label}
    </button>
  );

  return (
    <>
      {/* Animated Background */}
      <div className="animated-bg">
        <div className="bg-orb bg-orb-1"></div>
        <div className="bg-orb bg-orb-2"></div>
        <div className="bg-orb bg-orb-3"></div>
        <div className="grid-overlay"></div>
      </div>

      <div className="app-layout">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <div className="logo-icon">
                <BrainCircuit size={20} />
              </div>
              <div className="logo-text">
                <h1>Code Review Sage</h1>
                <p>AI-Powered Code Intelligence</p>
              </div>
            </div>
          </div>

          <nav className="sidebar-nav">
            {NAV_ITEMS.map((section) => (
              <div key={section.section}>
                <div className="nav-section-label">{section.section}</div>
                {section.items.map(renderNavItem)}
              </div>
            ))}
          </nav>

          <div className="sidebar-footer">
            <button className="theme-toggle" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <span className="online-badge">
              <span className="online-dot"></span>
              Online
            </span>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <div className="main-content">
          <header className="main-header">
            <div>
              <h2>Code Review Sage</h2>
              <p>AI-Powered Code Intelligence Platform</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button className="toolbar-btn" onClick={() => setChatOpen(!chatOpen)}>
                <MessageSquare size={14} /> AI Chat
              </button>
            </div>
          </header>

          <div className="main-body">
            <div className="panels-container">
              {/* ── Left Panel ── */}
              <div className="left-panel">
                {/* Language Bar */}
                <div className="language-bar">
                  <Code2 size={14} style={{ color: 'var(--text-muted)' }} />
                  <select className="lang-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                    {LANGUAGES.map((l) => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
                  </select>
                  <div className="focus-chips">
                    {['bugs', 'performance', 'security', 'best practices'].map((area) => (
                      <label key={area} className="focus-chip">
                        <input type="checkbox" checked={focusAreas.includes(area)} onChange={() => toggleFocus(area)} />
                        <span>{area.charAt(0).toUpperCase() + area.slice(1)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Code Editor */}
                <div className="code-editor">
                  <div className="editor-toolbar">
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div className="window-dots">
                        <span className="dot-red"></span>
                        <span className="dot-yellow"></span>
                        <span className="dot-green"></span>
                      </div>
                      <span className="editor-label">Source Code</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="toolbar-btn" onClick={() => {
                        setCode(SAMPLE_CODES[language] || SAMPLE_CODES.python);
                        showToast(`🧪 Loaded ${language} sample`);
                      }}>
                        <FlaskConical size={12} /> Sample
                      </button>
                      <button className="toolbar-btn" onClick={() => { setCode(''); }}>
                        <Trash2 size={12} /> Clear
                      </button>
                    </div>
                  </div>
                  <div className="code-editor-wrapper">
                    <div className="editor-line-numbers" id="editor-line-nums">
                      {(code || '\n').split('\n').map((_, i) => (
                        <div key={i} className="editor-line-num">{i + 1}</div>
                      ))}
                    </div>
                    <textarea
                      className="code-textarea"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder={'// Paste your code here...\n// Select a language above\n// Click an action below\n\ndef example():\n    pass'}
                      spellCheck={false}
                      onScroll={(e) => {
                        const lineNums = document.getElementById('editor-line-nums');
                        if (lineNums) lineNums.scrollTop = e.target.scrollTop;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Tab') {
                          e.preventDefault();
                          const start = e.target.selectionStart;
                          const end = e.target.selectionEnd;
                          setCode(code.substring(0, start) + '    ' + code.substring(end));
                          setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = start + 4; }, 0);
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Metrics Panel */}
                <div className="metrics-panel">
                  <div className="metrics-title"><BarChart3 size={12} /> Code Stats</div>
                  <div className="metrics-grid">
                    <div className="metric-card">
                      <div className="metric-label">Lines</div>
                      <div className="metric-value">{localMetrics.lines}</div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-label">Functions</div>
                      <div className="metric-value">{localMetrics.functions}</div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-label">Complexity</div>
                      <div className="metric-value">{metricsData?.complexity || '—'}</div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-label">Risk Score</div>
                      <div className="metric-value">{metricsData?.risk_score ? `${metricsData.risk_score}/10` : '—'}</div>
                    </div>
                  </div>
                </div>

                {/* Debug Error Input — always show so user can enter error */}
                <div style={{
                  padding: '0.75rem 1rem',
                  borderTop: '1px solid var(--border)',
                  background: activeTab === 'debug' ? 'rgba(239,68,68,0.03)' : 'var(--bg-card)',
                  display: 'flex', gap: '0.5rem', alignItems: 'center',
                }}>
                  <Bug size={14} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
                  <textarea
                    className="error-input"
                    value={errorMessage}
                    onChange={(e) => setErrorMessage(e.target.value)}
                    placeholder="Paste error message / traceback here for Debug mode..."
                    style={{ minHeight: '50px' }}
                  />
                </div>

                {/* Action Buttons */}
                <div className="action-buttons" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem' }}>
                  <button className="action-btn btn-review" onClick={handleReview} disabled={isLoading}>
                    <Search size={14} /> Review
                  </button>
                  <button className="action-btn btn-rewrite" onClick={handleRewrite} disabled={isLoading}>
                    <Wand2 size={14} /> Rewrite
                  </button>
                  <button className="action-btn btn-visualize" onClick={handleVisualize} disabled={isLoading}>
                    <Eye size={14} /> Visualize
                  </button>
                  <button className="action-btn btn-explain" onClick={handleExplain} disabled={isLoading}>
                    <GraduationCap size={14} /> Explain
                  </button>
                  <button className="action-btn btn-tests" onClick={handleGenerateTests} disabled={isLoading}>
                    <FlaskConical size={14} /> Tests
                  </button>
                  <button className="action-btn btn-debug" onClick={handleDebug} disabled={isLoading}>
                    <Bug size={14} /> Debug
                  </button>
                  <button className="action-btn btn-visualize" onClick={handleDSVisualize} disabled={isLoading} style={{ gridColumn: 'span 2' }}>
                    <Boxes size={14} /> DS Viz
                  </button>
                </div>
              </div>

              {/* ── Right Panel ── */}
              <div className="right-panel">
                {/* Tab Bar */}
                <div className="output-tabs">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      <tab.icon size={13} /> {tab.label}
                    </button>
                  ))}
                  <button
                    className={`tab-btn ${activeTab === 'ds-viz' ? 'active' : ''}`}
                    onClick={() => setActiveTab('ds-viz')}
                  >
                    <Boxes size={13} /> DS Viz
                  </button>
                  <div className="tab-actions" style={{ display: 'flex', gap: '0.35rem', paddingRight: '0.75rem' }}>
                    <button className="toolbar-btn" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8', fontWeight: 600, padding: '0.3rem 0.7rem' }} onClick={() => {
                      let text = '';
                      if (activeTab === 'review' && reviewData) text = reviewData.review;
                      else if (activeTab === 'rewrite' && rewriteData) text = rewriteData.rewritten_code || rewriteData.rewrite;
                      else if (activeTab === 'tests' && testsData) text = testsData.tests;
                      else if (activeTab === 'explain' && explainData) text = explainData.explanation;
                      else if (activeTab === 'debug' && debugData) text = debugData.debug;
                      else if (activeTab === 'visualize' && visualizeData) text = JSON.stringify(visualizeData, null, 2);
                      if (text) { copyToClipboard(text).then(() => showToast('📋 Copied to clipboard!')); }
                      else { showToast('⚠️ Nothing to copy yet'); }
                    }}>
                      <Copy size={13} /> Copy All
                    </button>
                    {activeTab === 'rewrite' && rewriteData?.rewritten_code && (
                      <button className="toolbar-btn" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#34d399', fontWeight: 600, padding: '0.3rem 0.7rem' }} onClick={() => {
                        downloadFile(rewriteData.rewritten_code, `rewritten.${getFileExtension(language)}`);
                        showToast('📥 Downloaded!');
                      }}>
                        <Download size={13} /> Download
                      </button>
                    )}
                    {activeTab === 'tests' && testsData?.tests && (
                      <button className="toolbar-btn" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#34d399', fontWeight: 600, padding: '0.3rem 0.7rem' }} onClick={() => {
                        const ext = getFileExtension(language);
                        downloadFile(testsData.tests, `tests.${ext}`);
                        showToast('📥 Tests downloaded!');
                      }}>
                        <Download size={13} /> Download
                      </button>
                    )}
                  </div>
                </div>

                {/* Output Content */}
                <div className="output-content" ref={outputRef}>
                  {/* Review */}
                  {activeTab === 'review' && (
                    reviewData ? (
                      <div>
                        <ScoreCard score={reviewData.quality_score} counts={reviewData.severity_counts} />
                        <div className="prose-output" dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(reviewData.review) }} />
                      </div>
                    ) : <Placeholder icon={<Search size={48} />} title="Ready to Review" text="Paste code and click Review for AI analysis" />
                  )}

                  {/* Rewrite */}
                  {activeTab === 'rewrite' && (
                    rewriteData ? (
                      <div>
                        {/* Rewrite Focus Options */}
                        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Optimization Focus</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                            {['performance', 'security', 'readability', 'memory', 'scalability', 'error handling'].map((opt) => (
                              <label key={opt} className="focus-chip">
                                <input type="checkbox" checked={rewriteFocus.includes(opt)} onChange={() => setRewriteFocus(p => p.includes(opt) ? p.filter(x => x !== opt) : [...p, opt])} />
                                <span>{opt.charAt(0).toUpperCase() + opt.slice(1)}</span>
                              </label>
                            ))}
                          </div>
                          <button className="action-btn btn-rewrite" style={{ marginTop: '0.5rem', padding: '0.4rem 1rem', fontSize: '0.7rem' }} onClick={handleRewrite} disabled={!!loading}>
                            <Wand2 size={12} /> Re-optimize with new focus
                          </button>
                        </div>

                        {/* VS Code-style rewritten code */}
                        {rewriteData.rewritten_code && (
                          <div className="vscode-editor">
                            <div className="vscode-titlebar">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div className="window-dots">
                                  <span className="dot-red"></span>
                                  <span className="dot-yellow"></span>
                                  <span className="dot-green"></span>
                                </div>
                                <span className="vscode-filename">rewritten.{getFileExtension(language)}</span>
                              </div>
                              <div style={{ display: 'flex', gap: '0.3rem' }}>
                                <button className="toolbar-btn" onClick={() => { copyToClipboard(rewriteData.rewritten_code).then(() => showToast('📋 Code copied!')); }}>
                                  <Copy size={12} /> Copy
                                </button>
                                <button className="toolbar-btn" onClick={() => { downloadFile(rewriteData.rewritten_code, `rewritten.${getFileExtension(language)}`); showToast('📥 Downloaded!'); }}>
                                  <Download size={12} /> Download
                                </button>
                              </div>
                            </div>
                            <div className="vscode-body">
                              <div className="vscode-line-numbers">
                                {rewriteData.rewritten_code.split('\n').map((_, i) => (
                                  <div key={i} className="vscode-line-num">{i + 1}</div>
                                ))}
                              </div>
                              <pre className="vscode-code"><code>{rewriteData.rewritten_code}</code></pre>
                            </div>
                          </div>
                        )}

                        {/* Changes explanation */}
                        <div className="prose-output" style={{ marginTop: '1rem' }}
                          dangerouslySetInnerHTML={{
                            __html: renderMarkdownToHTML(
                              rewriteData.rewrite.replace(/```[\s\S]*?```/g, '').trim() || 'Code has been rewritten.'
                            )
                          }} />
                      </div>
                    ) : (
                      <div>
                        {/* Rewrite Focus Options shown before running too */}
                        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>🎯 Choose Optimization Focus</div>
                          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Select what aspects the AI should prioritize when rewriting your code:</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                            {['performance', 'security', 'readability', 'memory', 'scalability', 'error handling'].map((opt) => (
                              <label key={opt} className="focus-chip">
                                <input type="checkbox" checked={rewriteFocus.includes(opt)} onChange={() => setRewriteFocus(p => p.includes(opt) ? p.filter(x => x !== opt) : [...p, opt])} />
                                <span>{opt.charAt(0).toUpperCase() + opt.slice(1)}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <Placeholder icon={<Wand2 size={48} />} title="Ready to Rewrite" text="Select optimizations above, paste code, and click Rewrite" />
                      </div>
                    )
                  )}

                  {/* Tests */}
                  {activeTab === 'tests' && (
                    testsData ? (
                      <div className="prose-output" dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(testsData.tests) }} />
                    ) : <Placeholder icon={<FlaskConical size={48} />} title="Ready to Generate Tests" text="Click Tests to generate unit tests, edge cases & failure scenarios" />
                  )}

                  {/* Visualize */}
                  {activeTab === 'visualize' && (
                    visualizeData ? (
                      <div>
                        <D3Graph data={visualizeData.graph} theme={theme} />
                        {visualizeData.graph?.summary && (
                          <div className="prose-output" style={{ marginTop: '1rem' }}
                            dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML('## 🔍 Code Flow Summary\n' + visualizeData.graph.summary.map(s => `- ${s}`).join('\n')) }}
                          />
                        )}
                      </div>
                    ) : <Placeholder icon={<Eye size={48} />} title="Ready to Visualize" text="Click Visualize for an interactive code flow graph" />
                  )}

                  {/* Explain */}
                  {activeTab === 'explain' && (
                    explainData ? (
                      <div className="prose-output" dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(explainData.explanation) }} />
                    ) : <Placeholder icon={<GraduationCap size={48} />} title="Ready to Explain" text="Click Explain for a detailed code walkthrough" />
                  )}

                  {/* Debug */}
                  {activeTab === 'debug' && (
                    debugData ? (
                      <div className="prose-output" dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(debugData.debug) }} />
                    ) : (
                      <div>
                        <div style={{ padding: '1rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }}>
                          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem' }}>🐞 How Debug Mode Works</h3>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                            <p><strong>Step 1:</strong> Paste your code in the editor on the left</p>
                            <p><strong>Step 2:</strong> Paste the error message/traceback in the error box below the editor</p>
                            <p><strong>Step 3:</strong> Click the <strong>Debug</strong> button</p>
                            <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                              The AI will analyze both your code and the error to explain what went wrong,
                              identify the exact line causing the issue, and provide corrected code.
                            </p>
                          </div>
                        </div>
                        <Placeholder icon={<Bug size={48} />} title="Debug Mode" text="Paste code + error message, then click Debug" />
                      </div>
                    )
                  )}

                  {/* Compare */}
                  {activeTab === 'compare' && (
                    rewriteData ? (
                      <CompareView original={rewriteData.original_code} rewritten={rewriteData.rewritten_code} />
                    ) : <Placeholder icon={<GitCompareArrows size={48} />} title="Before & After Compare" text="Run Rewrite first, then switch to Compare to see the diff" />
                  )}

                  {/* History */}
                  {activeTab === 'history' && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Session History</h3>
                        {sessionHistory.length > 0 && (
                          <button className="toolbar-btn" onClick={clearHistory}><Trash2 size={12} /> Clear All</button>
                        )}
                      </div>
                      {sessionHistory.length === 0 ? (
                        <Placeholder icon={<History size={48} />} title="No History Yet" text="Your code reviews and rewrites will appear here" />
                      ) : (
                        <div className="history-list">
                          {sessionHistory.map((entry) => (
                            <div key={entry.id} className="history-item" onClick={() => restoreFromHistory(entry)}>
                              <div className="history-title">{entry.action} — {entry.language}</div>
                              <div className="history-meta">{entry.timestamp} • {entry.code.length} chars</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* DS Visualizer */}
                  {activeTab === 'ds-viz' && (
                    dsVizData ? (
                      <DSVisualizer data={dsVizData} />
                    ) : <Placeholder icon={<Boxes size={48} />} title="Data Structure Visualizer" text="Paste code with linked lists, trees or graphs, then click DS Viz" />
                  )}
                </div>
              </div>
            </div>

            {/* ── Chat Panel ── */}
            {chatOpen && (
              <div className="chat-panel">
                <div className="chat-header">
                  <h3><MessageSquare size={16} /> AI Chat</h3>
                  <button className="toolbar-btn" onClick={() => setChatOpen(false)}><X size={14} /></button>
                </div>
                <div className="chat-messages">
                  {chatMessages.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem', padding: '2rem 1rem' }}>
                      Ask questions about your code...<br />
                      <span style={{ fontSize: '0.7rem' }}>"Why did you suggest this?" • "Optimize function X" • "Make this async"</span>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`chat-msg ${msg.role === 'user' ? 'user' : 'ai'}`}>
                      {msg.role === 'ai' ? (
                        <div className="prose-output" dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(msg.content) }} />
                      ) : msg.content}
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="chat-msg ai" style={{ opacity: 0.5 }}>Thinking...</div>
                  )}
                </div>
                <div className="chat-input-area">
                  <input
                    className="chat-input"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleChat(); }}
                    placeholder="Ask about the code..."
                  />
                  <button className="chat-send-btn" onClick={handleChat} disabled={chatLoading || !chatInput.trim()}>
                    <Send size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat toggle (when closed) */}
      {!chatOpen && (
        <button className="chat-toggle-btn" onClick={() => setChatOpen(true)}>
          <MessageSquare size={20} />
        </button>
      )}

      {/* Loading */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-card">
            <div className="loading-spinner"></div>
            <h3>{loading.title}</h3>
            <p>{loading.sub}</p>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

/* ── Sub Components ── */

function Placeholder({ icon, title, text }) {
  return (
    <div className="placeholder-state">
      <div className="placeholder-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function ScoreCard({ score, counts }) {
  const label = score >= 90 ? '🏆 Excellent — Production ready'
    : score >= 75 ? '✅ Good — Minor improvements'
      : score >= 60 ? '⚠️ Fair — Issues to address'
        : score >= 40 ? '🔶 Needs Work'
          : '🔴 Poor — Major refactoring needed';

  const gradColors = score >= 75 ? ['#10b981', '#06b6d4']
    : score >= 50 ? ['#f59e0b', '#eab308']
      : ['#ef4444', '#f59e0b'];

  return (
    <div className="score-card">
      <div className="score-ring">
        <svg viewBox="0 0 36 36">
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none" stroke="rgba(128,128,128,0.12)" strokeWidth="3" />
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none" stroke="url(#sg)" strokeWidth="3"
            strokeDasharray={`${score}, 100`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s ease-out' }} />
          <defs>
            <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={gradColors[0]} />
              <stop offset="100%" stopColor={gradColors[1]} />
            </linearGradient>
          </defs>
        </svg>
        <div className="score-number">{score}</div>
      </div>
      <div className="score-info">
        <h3>Code Quality Score</h3>
        <p>{label}</p>
        {counts && (
          <div className="severity-pills">
            {counts.critical > 0 && <span className="severity-pill pill-critical">🔴 {counts.critical} Critical</span>}
            {counts.high > 0 && <span className="severity-pill pill-high">🟠 {counts.high} High</span>}
            {counts.medium > 0 && <span className="severity-pill pill-medium">🟡 {counts.medium} Medium</span>}
            {counts.low > 0 && <span className="severity-pill pill-low">🟢 {counts.low} Low</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function CompareView({ original, rewritten }) {
  const { diffLines } = await_import_diff();
  if (!original || !rewritten) {
    return <Placeholder icon={<GitCompareArrows size={48} />} title="No data" text="Run Rewrite first" />;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
        <div className="compare-pane">
          <div className="compare-pane-header">Original Code</div>
          <pre style={{ margin: 0, padding: '0.5rem', background: 'transparent', border: 'none', fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
            {original}
          </pre>
        </div>
        <div className="compare-pane" style={{ borderRight: 'none' }}>
          <div className="compare-pane-header">Rewritten Code</div>
          <pre style={{ margin: 0, padding: '0.5rem', background: 'transparent', border: 'none', fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
            {rewritten}
          </pre>
        </div>
      </div>
    </div>
  );
}

function DSVisualizer({ data }) {
  // Try to extract structure from various possible response shapes
  let struct = data?.structure || data;

  // If data has a nested structure key, unwrap it
  if (typeof struct === 'object' && struct.structure) {
    struct = struct.structure;
  }

  // Try to detect the type and nodes from the response
  let type = struct?.type || '';
  let nodes = struct?.nodes || [];
  let root = struct?.root || null;
  let description = struct?.description || data?.description || '';

  // Normalize type
  type = type.toLowerCase().replace(/[\s-_]/g, '');
  const isLinkedList = type.includes('linked') || type.includes('list') || type === 'array' || type === 'stack' || type === 'queue';
  const isTree = type.includes('tree') || type.includes('binary') || type.includes('bst') || type.includes('heap');

  // If no nodes but root exists, try to extract flat list
  if (nodes.length === 0 && root) {
    const flatNodes = [];
    const flatten = (n) => { if (!n) return; flatNodes.push(n.val ?? n.value ?? n); if (n.left) flatten(n.left); if (n.right) flatten(n.right); };
    flatten(root);
    if (flatNodes.length > 0 && !isTree) nodes = flatNodes;
  }

  // If we still have no nodes and no root, check if the response itself is an array
  if (nodes.length === 0 && !root && Array.isArray(struct)) {
    nodes = struct;
  }

  // Linked List / Array / Stack / Queue rendering
  if ((isLinkedList || (!isTree && nodes.length > 0)) && nodes.length > 0) {
    const label = type.includes('stack') ? '📚 Stack' : type.includes('queue') ? '📤 Queue' : '🔗 Linked List';
    return (
      <div>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {label} Visualization
        </h3>
        <div className="ds-viz-container">
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}>
            {nodes.map((node, idx) => (
              <div key={idx} className="ll-node">
                <div className="ll-node-box">
                  <div className="ll-node-val">{typeof node === 'object' ? (node.val ?? node.value ?? JSON.stringify(node)) : node}</div>
                  <div className="ll-node-ptr">●</div>
                </div>
                <span className="ll-arrow">→</span>
              </div>
            ))}
            <span className="ll-null">NULL</span>
          </div>
        </div>
        {description && (
          <div className="prose-output" style={{ marginTop: '1rem' }}
            dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(description) }} />
        )}
      </div>
    );
  }

  // Binary Tree rendering
  if (isTree && root) {
    return (
      <div>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem' }}>🌳 Binary Tree Visualization</h3>
        <div className="ds-viz-container" style={{ flexDirection: 'column' }}>
          <TreeVisualization root={root} />
        </div>
        {description && (
          <div className="prose-output" style={{ marginTop: '1rem' }}
            dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(description) }} />
        )}
      </div>
    );
  }

  // Tree with only nodes array (render as linked list fallback)
  if (isTree && nodes.length > 0) {
    return (
      <div>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem' }}>🌳 Tree Nodes</h3>
        <div className="ds-viz-container">
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            {nodes.map((node, idx) => (
              <div key={idx} style={{
                width: 44, height: 44, borderRadius: '50%',
                border: '2px solid var(--accent-indigo)', background: 'rgba(99,102,241,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                fontSize: '0.85rem', color: 'var(--text-primary)',
              }}>
                {typeof node === 'object' ? (node.val ?? node.value ?? '?') : node}
              </div>
            ))}
          </div>
        </div>
        {description && (
          <div className="prose-output" style={{ marginTop: '1rem' }}
            dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(description) }} />
        )}
      </div>
    );
  }

  // Final fallback — render whatever description/data we have
  const fallbackText = description || (typeof data === 'string' ? data : 'Could not visualize the data structure. Try pasting code that creates a linked list, tree, or array.');
  return (
    <div className="prose-output"
      dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(fallbackText) }}
    />
  );
}

function TreeVisualization({ root }) {
  if (!root) return <div style={{ color: 'var(--text-muted)' }}>Empty tree</div>;

  const renderNode = (node, level = 0) => {
    if (!node) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0 0.5rem' }}>
        <div style={{
          width: 42, height: 42, borderRadius: '50%',
          border: '2px solid var(--accent-indigo)',
          background: 'rgba(99,102,241,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
          fontSize: '0.85rem', color: 'var(--text-primary)',
        }}>
          {node.val}
        </div>
        {(node.left || node.right) && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem', position: 'relative' }}>
            <div style={{ width: '1px', height: '20px', background: 'var(--border)', position: 'absolute', top: '-0.25rem' }}></div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              {node.left ? renderNode(node.left, level + 1) : <div style={{ width: 42 }}></div>}
              {node.right ? renderNode(node.right, level + 1) : <div style={{ width: 42 }}></div>}
            </div>
          </div>
        )}
      </div>
    );
  };

  return renderNode(root);
}

// D3 Graph Component
function D3Graph({ data, theme }) {
  const containerRef = useRef(null);
  const isDark = theme === 'dark';

  const NODE_COLORS = {
    start: '#10b981', end: '#ef4444', function: '#6366f1',
    class: '#8b5cf6', condition: '#f59e0b', loop: '#ec4899',
    io: '#06b6d4', operation: '#64748b',
  };
  const icons = { start: '▶', end: '■', function: 'ƒ', class: '◆', condition: '?', loop: '↻', io: '⇄', operation: '⚙' };

  useEffect(() => {
    if (!containerRef.current || !data?.nodes) return;
    const container = containerRef.current;
    container.innerHTML = '';

    // Dynamic import d3
    import('d3').then((d3) => {
      const width = container.clientWidth;
      const height = container.clientHeight || 400;

      const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);

      svg.append('defs').append('marker')
        .attr('id', 'arrowhead').attr('viewBox', '0 -5 10 10')
        .attr('refX', 28).attr('refY', 0)
        .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
        .append('path').attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', isDark ? '#6b7280' : '#9ca3af');

      const g = svg.append('g');
      svg.call(d3.zoom().scaleExtent([0.3, 3]).on('zoom', (event) => g.attr('transform', event.transform)));

      const nodes = data.nodes.map((n) => ({ ...n }));
      const links = data.links.map((l) => ({
        source: typeof l.source === 'string' ? l.source : l.source.id,
        target: typeof l.target === 'string' ? l.target : l.target.id,
        label: l.label || '',
      }));

      const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id((d) => d.id).distance(120))
        .force('charge', d3.forceManyBody().strength(-350))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(35));

      const link = g.append('g').selectAll('line').data(links).join('line')
        .attr('stroke', isDark ? '#4b5563' : '#d1d5db').attr('stroke-width', 1.5)
        .attr('marker-end', 'url(#arrowhead)');

      const linkLabel = g.append('g').selectAll('text').data(links.filter((l) => l.label)).join('text')
        .text((d) => d.label).attr('font-size', '9px').attr('fill', isDark ? '#6b7280' : '#9ca3af')
        .attr('text-anchor', 'middle').attr('font-family', 'Inter, sans-serif');

      const node = g.append('g').selectAll('g').data(nodes).join('g')
        .call(d3.drag()
          .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
          .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

      node.each(function (d) {
        const el = d3.select(this);
        const color = NODE_COLORS[d.type] || NODE_COLORS.operation;
        if (d.type === 'condition') {
          el.append('rect').attr('width', 28).attr('height', 28).attr('x', -14).attr('y', -14)
            .attr('rx', 4).attr('transform', 'rotate(45)')
            .attr('fill', color + '22').attr('stroke', color).attr('stroke-width', 2);
        } else {
          el.append('circle').attr('r', d.type === 'start' || d.type === 'end' ? 16 : 20)
            .attr('fill', color + '22').attr('stroke', color).attr('stroke-width', 2);
        }
      });

      node.append('text').text((d) => d.label.length > 16 ? d.label.slice(0, 14) + '…' : d.label)
        .attr('text-anchor', 'middle').attr('dy', (d) => d.type === 'start' || d.type === 'end' ? 32 : 36)
        .attr('font-size', '10px').attr('font-weight', '500').attr('font-family', 'Inter, sans-serif')
        .attr('fill', isDark ? '#d1d5db' : '#374151');

      node.append('text').text((d) => icons[d.type] || '⚙')
        .attr('text-anchor', 'middle').attr('dy', '4px')
        .attr('font-size', (d) => d.type === 'start' || d.type === 'end' ? '12px' : '14px')
        .attr('fill', (d) => NODE_COLORS[d.type] || NODE_COLORS.operation);

      const tooltip = d3.select(container).append('div').attr('class', 'd3-tooltip').style('display', 'none');
      node.on('mouseover', (e, d) => {
        tooltip.style('display', 'block')
          .html(`<strong>${d.label}</strong><br><span style="opacity:0.7">${d.detail || d.type}</span>`);
      })
        .on('mousemove', (e) => {
          const rect = container.getBoundingClientRect();
          tooltip.style('left', (e.clientX - rect.left + 12) + 'px').style('top', (e.clientY - rect.top - 10) + 'px');
        })
        .on('mouseout', () => tooltip.style('display', 'none'));

      simulation.on('tick', () => {
        link.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
          .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
        linkLabel.attr('x', (d) => (d.source.x + d.target.x) / 2).attr('y', (d) => (d.source.y + d.target.y) / 2);
        node.attr('transform', (d) => `translate(${d.x},${d.y})`);
      });

      // Legend
      const legendEl = container.parentElement?.querySelector('.graph-legend');
      if (legendEl) {
        const usedTypes = [...new Set(nodes.map((n) => n.type))];
        legendEl.innerHTML = usedTypes.map((t) =>
          `<span class="legend-item"><span class="legend-dot" style="background:${NODE_COLORS[t] || '#64748b'}"></span>${t.charAt(0).toUpperCase() + t.slice(1)}</span>`
        ).join('');
      }
    });
  }, [data, isDark]);

  return (
    <div>
      <div className="graph-container" ref={containerRef}></div>
      <div className="graph-legend"></div>
    </div>
  );
}

// helper
function await_import_diff() {
  return { diffLines: null }; // simplified — comparison done via layout
}

export default App;
