import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search, Wand2, Eye, GraduationCap, FlaskConical, Bug, History,
  GitCompareArrows, MessageSquare, Sun, Moon, Trash2, Copy, Download,
  ChevronDown, ChevronRight, Send, X, BarChart3, Code2, BrainCircuit,
  Activity, Shield, Zap, FileCode, Boxes, LogOut, User, ArrowRight,
  Sparkles, Lock, Mail, ChevronUp, Cpu, GitBranch, Terminal, Layers,
  ArrowLeftRight, Dna, BookOpen, FolderOpen, Play
} from 'lucide-react';
import * as api from './utils/api';
import {
  renderMarkdownToHTML, highlightAllCode, getFileExtension,
  downloadFile, copyToClipboard, countLines, countFunctions, SAMPLE_CODES
} from './utils/helpers';
import './App.css';
import Editor from '@monaco-editor/react';

// Monaco language mapping
const MONACO_LANG = {
  python: 'python', javascript: 'javascript', java: 'java', c: 'c',
  cpp: 'cpp', csharp: 'csharp', go: 'go', rust: 'rust',
  typescript: 'typescript', php: 'php', ruby: 'ruby', swift: 'swift', kotlin: 'kotlin',
};

// Shared VS Code-like editor options for all Monaco instances
const VSCODE_EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 14,
  fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
  fontLigatures: true,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 4,
  wordWrap: 'on',
  padding: { top: 10, bottom: 10 },
  lineNumbers: 'on',
  renderLineHighlight: 'all',
  bracketPairColorization: { enabled: true },
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  // VS Code-like IntelliSense
  suggestOnTriggerCharacters: true,
  quickSuggestions: { other: true, comments: true, strings: true },
  parameterHints: { enabled: true },
  snippetSuggestions: 'top',
  wordBasedSuggestions: 'allDocuments',
  tabCompletion: 'on',
  acceptSuggestionOnEnter: 'on',
  suggest: {
    showMethods: true, showFunctions: true, showConstructors: true,
    showFields: true, showVariables: true, showClasses: true,
    showStructs: true, showInterfaces: true, showModules: true,
    showProperties: true, showEvents: true, showOperators: true,
    showUnits: true, showValues: true, showConstants: true,
    showEnums: true, showEnumMembers: true, showKeywords: true,
    showWords: true, showSnippets: true,
    preview: true, insertMode: 'replace',
  },
};

const TABS = [
  { id: 'review', label: 'Review', icon: Search },
  { id: 'rewrite', label: 'Rewrite', icon: Wand2 },
  { id: 'pattern', label: 'Pattern', icon: Dna },
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
    section: 'Learning', items: [
      { id: 'practice', label: 'Practice Mode', icon: BookOpen },
      { id: 'snippets', label: 'My Snippets', icon: FolderOpen },
    ]
  },
  {
    section: 'Utilities', items: [
      { id: 'convert-page', label: 'Convert Code', icon: ArrowLeftRight },
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
  // Auth State
  const [user, setUser] = useState(() => api.getSavedUser());
  const [authModal, setAuthModal] = useState(null); // 'login' | 'register' | null

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
  const [convertData, setConvertData] = useState(null);
  const [targetLanguage, setTargetLanguage] = useState('javascript');
  const [currentView, setCurrentView] = useState('main'); // 'main' | 'convert-page'
  const [convertSourceCode, setConvertSourceCode] = useState('');
  const [convertSourceLang, setConvertSourceLang] = useState('c');
  const [patternData, setPatternData] = useState(null);

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

  // Load DB history on login
  useEffect(() => {
    if (user) {
      api.getHistory().then(h => setSessionHistory(h)).catch(() => { });
    }
  }, [user]);

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

  // Save history to localStorage (fallback for non-auth)
  useEffect(() => {
    if (!user) {
      localStorage.setItem('codeReviewHistory', JSON.stringify(sessionHistory.slice(0, 50)));
    }
  }, [sessionHistory, user]);

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

  const handleConvert = async (srcCode, srcLang, tgtLang) => {
    if (!srcCode.trim()) { showToast('⚠️ Please paste some code first'); return; }
    if (srcLang === tgtLang) { showToast('⚠️ Source and target languages must be different'); return; }
    setLoading({ title: '🔄 Converting Code...', sub: `Converting ${srcLang} → ${tgtLang}` });
    try {
      const data = await api.convertCode(srcCode, srcLang, tgtLang);
      setConvertData(data);
      showToast(`✅ Code converted to ${tgtLang}`);
    } catch (err) { showToast(`❌ ${err.message}`); }
    finally { setLoading(null); }
  };

  const handlePattern = async () => {
    if (!code.trim()) { showToast('⚠️ Please paste some code first'); return; }
    setLoading({ title: '🧬 Identifying Pattern...', sub: 'Detecting DSA patterns & optimal approaches' });
    try {
      const data = await api.identifyPattern(code, language);
      setPatternData(data);
      setActiveTab('pattern');
      saveToHistory('Pattern', code, language);
      showToast('✅ Pattern identified');
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
      created_at: new Date().toISOString(),
    };
    setSessionHistory((prev) => [entry, ...prev]);
    // Save to DB if logged in
    if (user) {
      api.saveHistoryItem(action, lang, codeStr.substring(0, 5000)).catch(() => { });
    }
  };

  const restoreFromHistory = (entry) => {
    setCode(entry.code);
    setLanguage(entry.language);
    showToast('📂 Code restored from history');
  };

  const clearHistory = () => {
    setSessionHistory([]);
    localStorage.removeItem('codeReviewHistory');
    if (user) api.clearHistoryAPI().catch(() => { });
    showToast('🗑️ History cleared');
  };

  // Auth handlers
  const handleLogout = async () => {
    await api.logoutUser();
    setUser(null);
    setSessionHistory([]);
    showToast('👋 Logged out');
  };

  const handleAuthSuccess = (userData) => {
    setUser(userData.user);
    setAuthModal(null);
    showToast(`✅ Welcome, ${userData.user.name}!`);
    // Fetch DB history
    api.getHistory().then(h => setSessionHistory(h)).catch(() => { });
  };

  // Render helpers
  const isLoading = !!loading;

  // Pages that get their own dedicated view (not rendered in main panel)
  const PAGE_VIEWS = ['convert-page', 'visualize', 'explain', 'tests', 'debug', 'ds-viz', 'practice', 'snippets'];

  const renderNavItem = (item) => (
    <button
      key={item.id}
      className={`nav-item ${currentView === 'main' && activeTab === item.id ? 'active' : ''} ${currentView === item.id ? 'active' : ''}`}
      onClick={() => {
        if (PAGE_VIEWS.includes(item.id)) {
          setCurrentView(item.id);
        } else {
          setCurrentView('main');
          setActiveTab(item.id);
        }
      }}
    >
      <item.icon />
      {item.label}
    </button>
  );

  return (
    <>
      {/* Auth Modal */}
      {authModal && (
        <AuthModal
          mode={authModal}
          onClose={() => setAuthModal(null)}
          onSwitch={() => setAuthModal(authModal === 'login' ? 'register' : 'login')}
          onSuccess={handleAuthSuccess}
        />
      )}

      {/* Landing Page */}
      {!user && !authModal && (
        <LandingPage
          theme={theme}
          onLogin={() => setAuthModal('login')}
          onRegister={() => setAuthModal('register')}
          onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        />
      )}

      {/* Main App — only shown when logged in */}
      {user && (<>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="online-badge">
                  <User size={10} />
                  {user.name}
                </span>
                <button className="toolbar-btn" onClick={handleLogout} title="Logout" style={{ color: 'var(--accent-red)' }}>
                  <LogOut size={14} />
                </button>
              </div>
            </div>
          </aside>

          {/* ── Main Content (analysis panels) ── */}
          {currentView === 'main' && (
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
                      <div style={{ flex: 1, minHeight: '300px' }}>
                        <Editor
                          height="100%"
                          language={MONACO_LANG[language] || 'plaintext'}
                          value={code}
                          onChange={(val) => setCode(val || '')}
                          theme={theme === 'dark' ? 'vs-dark' : 'light'}
                          options={VSCODE_EDITOR_OPTIONS}
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

                    {/* Action Buttons — Review + Rewrite + Pattern */}
                    <div className="action-buttons" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                      <button className="action-btn btn-review" onClick={handleReview} disabled={isLoading}>
                        <Search size={14} /> Review
                      </button>
                      <button className="action-btn btn-rewrite" onClick={handleRewrite} disabled={isLoading}>
                        <Wand2 size={14} /> Rewrite
                      </button>
                      <button className="action-btn btn-explain" onClick={handlePattern} disabled={isLoading}>
                        <Dna size={14} /> Pattern
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

                      {/* Pattern */}
                      {activeTab === 'pattern' && (
                        patternData ? (
                          <div className="prose-output" dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(patternData.pattern) }} />
                        ) : <Placeholder icon={<Dna size={48} />} title="DSA Pattern Identifier" text="Paste your code solution and click Pattern to identify the algorithm pattern" />
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
                                  <div className="history-meta">{entry.created_at || entry.timestamp} • {entry.code?.length || 0} chars</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
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
          )}

          {/* ── Convert Page ── */}
          {currentView === 'convert-page' && (
            <ConvertPage
              theme={theme}
              convertSourceCode={convertSourceCode}
              setConvertSourceCode={setConvertSourceCode}
              convertSourceLang={convertSourceLang}
              setConvertSourceLang={setConvertSourceLang}
              targetLanguage={targetLanguage}
              setTargetLanguage={setTargetLanguage}
              convertData={convertData}
              onConvert={handleConvert}
              loading={loading}
              showToast={showToast}
            />
          )}

          {/* ── Tool Pages ── */}
          {currentView === 'visualize' && (
            <ToolPage
              title="Code Flow Visualizer" subtitle="Generate interactive flow graphs from your code"
              icon={<Eye size={18} />} btnLabel="Visualize" btnClass="btn-visualize"
              onAction={(c, l) => { handleVisualize(); }} actionHandler={handleVisualize}
              code={code} setCode={setCode} language={language} setLanguage={setLanguage}
              loading={loading} showToast={showToast} result={
                visualizeData ? (
                  <div>
                    <D3Graph data={visualizeData.graph} theme={theme} />
                    {visualizeData.graph?.summary && (
                      <div className="prose-output" style={{ marginTop: '1rem' }}
                        dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML('## 🔍 Code Flow Summary\n' + visualizeData.graph.summary.map(s => `- ${s}`).join('\n')) }}
                      />
                    )}
                  </div>
                ) : null
              }
              placeholder={<Placeholder icon={<Eye size={48} />} title="Ready to Visualize" text="Paste code and click Visualize for an interactive flow graph" />}
            />
          )}

          {currentView === 'explain' && (
            <ToolPage
              title="Code Explainer" subtitle="Get a detailed breakdown of how your code works"
              icon={<GraduationCap size={18} />} btnLabel="Explain" btnClass="btn-explain"
              onAction={handleExplain} actionHandler={handleExplain}
              code={code} setCode={setCode} language={language} setLanguage={setLanguage}
              loading={loading} showToast={showToast} result={
                explainData ? (
                  <div className="prose-output" dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(explainData.explanation) }} />
                ) : null
              }
              placeholder={<Placeholder icon={<GraduationCap size={48} />} title="Ready to Explain" text="Paste code and click Explain for a detailed walkthrough" />}
            />
          )}

          {currentView === 'tests' && (
            <ToolPage
              title="Test Generator" subtitle="Generate unit tests, edge cases & failure scenarios"
              icon={<FlaskConical size={18} />} btnLabel="Generate Tests" btnClass="btn-tests"
              onAction={handleGenerateTests} actionHandler={handleGenerateTests}
              code={code} setCode={setCode} language={language} setLanguage={setLanguage}
              loading={loading} showToast={showToast} result={
                testsData ? (
                  <div className="prose-output" dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(testsData.tests) }} />
                ) : null
              }
              placeholder={<Placeholder icon={<FlaskConical size={48} />} title="Ready to Generate Tests" text="Paste code and click Generate Tests" />}
            />
          )}

          {currentView === 'debug' && (
            <ToolPage
              title="Debug Mode" subtitle="Paste code + error message for AI-powered debugging"
              icon={<Bug size={18} />} btnLabel="Debug" btnClass="btn-debug"
              onAction={handleDebug} actionHandler={handleDebug}
              code={code} setCode={setCode} language={language} setLanguage={setLanguage}
              loading={loading} showToast={showToast}
              extraInput={
                <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', background: 'rgba(239,68,68,0.03)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <Bug size={14} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
                  <textarea
                    className="error-input"
                    value={errorMessage}
                    onChange={(e) => setErrorMessage(e.target.value)}
                    placeholder="Paste error message / traceback here..."
                    style={{ minHeight: '60px' }}
                  />
                </div>
              }
              result={
                debugData ? (
                  <div className="prose-output" dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(debugData.debug) }} />
                ) : null
              }
              placeholder={
                <div>
                  <div style={{ padding: '1rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem' }}>🐞 How Debug Mode Works</h3>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                      <p><strong>Step 1:</strong> Paste your code in the editor</p>
                      <p><strong>Step 2:</strong> Paste the error message in the error box below</p>
                      <p><strong>Step 3:</strong> Click the <strong>Debug</strong> button</p>
                    </div>
                  </div>
                  <Placeholder icon={<Bug size={48} />} title="Debug Mode" text="Paste code + error message, then click Debug" />
                </div>
              }
            />
          )}

          {currentView === 'ds-viz' && (
            <ToolPage
              title="Data Structure Visualizer" subtitle="Visualize linked lists, trees, graphs and more"
              icon={<Boxes size={18} />} btnLabel="Visualize DS" btnClass="btn-visualize"
              onAction={handleDSVisualize} actionHandler={handleDSVisualize}
              code={code} setCode={setCode} language={language} setLanguage={setLanguage}
              loading={loading} showToast={showToast} result={
                dsVizData ? <DSVisualizer data={dsVizData} /> : null
              }
              placeholder={<Placeholder icon={<Boxes size={48} />} title="Data Structure Visualizer" text="Paste code with linked lists, trees or graphs, then click Visualize DS" />}
            />
          )}

          {/* ── Practice Mode ── */}
          {currentView === 'practice' && (
            <PracticePage theme={theme} language={language} setLanguage={setLanguage} loading={loading} showToast={showToast} />
          )}

          {/* ── Snippets Manager ── */}
          {currentView === 'snippets' && (
            <SnippetsPage theme={theme} showToast={showToast} code={code} language={language} />
          )}
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

      </>)}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

/* ── Sub Components ── */

function ConvertPage({ theme, convertSourceCode, setConvertSourceCode, convertSourceLang, setConvertSourceLang, targetLanguage, setTargetLanguage, convertData, onConvert, loading, showToast }) {
  const outputRef = useRef(null);

  useEffect(() => {
    if (outputRef.current) {
      highlightAllCode(outputRef.current);
    }
  }, [convertData]);

  return (
    <div className="main-content" style={{ flex: 1 }}>
      <header className="main-header">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ArrowLeftRight size={18} /> Code Converter</h2>
          <p>Convert code between programming languages with AI</p>
        </div>
      </header>

      <div className="main-body" style={{ overflow: 'hidden' }}>
        <div className="convert-page-layout">
          {/* Left: Input */}
          <div className="convert-input-panel">
            {/* Language Selectors */}
            <div className="convert-lang-bar">
              <div className="convert-lang-group">
                <label className="convert-lang-label">Source Language</label>
                <select className="lang-select" value={convertSourceLang} onChange={(e) => setConvertSourceLang(e.target.value)}>
                  {LANGUAGES.map((l) => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
                </select>
              </div>
              <div className="convert-arrow">
                <ArrowLeftRight size={20} />
              </div>
              <div className="convert-lang-group">
                <label className="convert-lang-label">Target Language</label>
                <select className="lang-select" value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)}>
                  {LANGUAGES.filter(l => l !== convertSourceLang).map((l) => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
                </select>
              </div>
            </div>

            {/* Code Input */}
            <div className="code-editor" style={{ flex: 1 }}>
              <div className="editor-toolbar">
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div className="window-dots">
                    <span className="dot-red"></span>
                    <span className="dot-yellow"></span>
                    <span className="dot-green"></span>
                  </div>
                  <span className="editor-label">Source Code ({convertSourceLang})</span>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button className="toolbar-btn" onClick={() => { setConvertSourceCode(SAMPLE_CODES[convertSourceLang] || SAMPLE_CODES.python); showToast(`🧪 Loaded ${convertSourceLang} sample`); }}>
                    <FlaskConical size={12} /> Sample
                  </button>
                  <button className="toolbar-btn" onClick={() => setConvertSourceCode('')}>
                    <Trash2 size={12} /> Clear
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, minHeight: '300px' }}>
                <Editor
                  height="100%"
                  language={MONACO_LANG[convertSourceLang] || 'plaintext'}
                  value={convertSourceCode}
                  onChange={(val) => setConvertSourceCode(val || '')}
                  theme={theme === 'dark' ? 'vs-dark' : 'light'}
                  options={VSCODE_EDITOR_OPTIONS}
                />
              </div>
            </div>

            {/* Convert Button */}
            <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <button
                className="action-btn btn-convert"
                onClick={() => onConvert(convertSourceCode, convertSourceLang, targetLanguage)}
                disabled={!!loading}
                style={{ width: '100%', padding: '0.75rem', fontSize: '0.85rem' }}
              >
                <ArrowLeftRight size={16} /> Convert {convertSourceLang.toUpperCase()} → {targetLanguage.toUpperCase()}
              </button>
            </div>
          </div>

          {/* Right: Output */}
          <div className="convert-output-panel" ref={outputRef}>
            {convertData ? (
              <div>
                {/* VS Code-style converted code */}
                {convertData.converted_code && (
                  <div className="vscode-editor">
                    <div className="vscode-titlebar">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div className="window-dots">
                          <span className="dot-red"></span>
                          <span className="dot-yellow"></span>
                          <span className="dot-green"></span>
                        </div>
                        <span className="vscode-filename">converted.{getFileExtension(convertData.target_language)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <button className="toolbar-btn" onClick={() => { copyToClipboard(convertData.converted_code).then(() => showToast('📋 Code copied!')); }}>
                          <Copy size={12} /> Copy
                        </button>
                        <button className="toolbar-btn" onClick={() => { downloadFile(convertData.converted_code, `converted.${getFileExtension(convertData.target_language)}`); showToast('📥 Downloaded!'); }}>
                          <Download size={12} /> Download
                        </button>
                      </div>
                    </div>
                    <div className="vscode-body">
                      <div className="vscode-line-numbers">
                        {convertData.converted_code.split('\n').map((_, i) => (
                          <div key={i} className="vscode-line-num">{i + 1}</div>
                        ))}
                      </div>
                      <pre className="vscode-code"><code>{convertData.converted_code}</code></pre>
                    </div>
                  </div>
                )}

                {/* Conversion notes */}
                <div className="prose-output" style={{ marginTop: '1rem' }}
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdownToHTML(
                      convertData.convert.replace(/```[\s\S]*?```/g, '').trim() || 'Code has been converted.'
                    )
                  }} />
              </div>
            ) : (
              <div className="placeholder-state">
                <div className="placeholder-icon"><ArrowLeftRight size={48} /></div>
                <h3>Converted Code Will Appear Here</h3>
                <p>Select source & target languages, paste your code, and click Convert</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Reusable Tool Page ── */
function ToolPage({ title, subtitle, icon, btnLabel, btnClass, onAction, actionHandler, code, setCode, language, setLanguage, loading, showToast, result, placeholder, extraInput }) {
  const outputRef = useRef(null);

  useEffect(() => {
    if (outputRef.current) {
      highlightAllCode(outputRef.current);
    }
  }, [result]);

  return (
    <div className="main-content" style={{ flex: 1 }}>
      <header className="main-header">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>{icon} {title}</h2>
          <p>{subtitle}</p>
        </div>
      </header>

      <div className="main-body" style={{ overflow: 'hidden' }}>
        <div className="convert-page-layout">
          {/* Left: Input */}
          <div className="convert-input-panel">
            {/* Language Selector */}
            <div className="language-bar" style={{ padding: '0.75rem 1rem' }}>
              <Code2 size={14} style={{ color: 'var(--text-muted)' }} />
              <select className="lang-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
              </select>
            </div>

            {/* Code Editor */}
            <div className="code-editor" style={{ flex: 1 }}>
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
                  <button className="toolbar-btn" onClick={() => { setCode(SAMPLE_CODES[language] || SAMPLE_CODES.python); showToast(`🧪 Loaded ${language} sample`); }}>
                    <FlaskConical size={12} /> Sample
                  </button>
                  <button className="toolbar-btn" onClick={() => setCode('')}>
                    <Trash2 size={12} /> Clear
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, minHeight: '300px' }}>
                <Editor
                  height="100%"
                  language={MONACO_LANG[language] || 'plaintext'}
                  value={code}
                  onChange={(val) => setCode(val || '')}
                  theme="vs-dark"
                  options={VSCODE_EDITOR_OPTIONS}
                />
              </div>
            </div>

            {/* Extra input (e.g. error message for debug) */}
            {extraInput}

            {/* Action Button */}
            <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <button
                className={`action-btn ${btnClass}`}
                onClick={actionHandler}
                disabled={!!loading}
                style={{ width: '100%', padding: '0.75rem', fontSize: '0.85rem' }}
              >
                {icon} {btnLabel}
              </button>
            </div>
          </div>

          {/* Right: Output */}
          <div className="convert-output-panel">
            <div className="output-content" ref={outputRef} style={{ padding: '1.5rem', overflowY: 'auto', height: '100%' }}>
              {result || placeholder}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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

/* ── Landing Page ── */
function LandingPage({ theme, onLogin, onRegister, onToggleTheme }) {
  const FEATURES = [
    { icon: Search, title: 'AI Code Review', desc: 'Get detailed reviews with quality scoring, severity analysis, and actionable suggestions.', color: '#6366f1' },
    { icon: Wand2, title: 'Smart Rewrite', desc: 'Optimize code for performance, security, readability with one click.', color: '#8b5cf6' },
    { icon: FlaskConical, title: 'Test Generation', desc: 'Auto-generate unit tests, edge cases, and failure scenarios.', color: '#f59e0b' },
    { icon: Eye, title: 'Code Visualization', desc: 'Interactive D3.js flow graphs that map your code architecture.', color: '#06b6d4' },
    { icon: GraduationCap, title: 'Code Explanation', desc: 'Line-by-line breakdowns perfect for learning and onboarding.', color: '#10b981' },
    { icon: Bug, title: 'Debug Mode', desc: 'Paste code + error message — get root cause analysis and fix.', color: '#ef4444' },
    { icon: Boxes, title: 'DS Visualization', desc: 'Visualize linked lists, trees, graphs from your code.', color: '#ec4899' },
    { icon: MessageSquare, title: 'AI Chat', desc: 'Chat with AI about your code — ask questions, get insights.', color: '#64748b' },
  ];

  const STATS = [
    { value: '13+', label: 'Languages' },
    { value: 'AI', label: 'Powered' },
    { value: '8', label: 'Features' },
    { value: '∞', label: 'Possibilities' },
  ];

  return (
    <>
      <div className="animated-bg">
        <div className="bg-orb bg-orb-1"></div>
        <div className="bg-orb bg-orb-2"></div>
        <div className="bg-orb bg-orb-3"></div>
        <div className="grid-overlay"></div>
      </div>

      <div className="landing-page">
        {/* Navbar */}
        <nav className="landing-nav">
          <div className="landing-nav-brand">
            <div className="logo-icon" style={{ width: 36, height: 36, borderRadius: 10, fontSize: '1rem' }}>
              <BrainCircuit size={18} />
            </div>
            <span className="landing-nav-title">Code Review Sage</span>
          </div>
          <div className="landing-nav-actions">
            <button className="theme-toggle" onClick={onToggleTheme}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button className="landing-btn-outline" onClick={onLogin}>Sign In</button>
            <button className="landing-btn-primary" onClick={onRegister}>
              Get Started <ArrowRight size={14} />
            </button>
          </div>
        </nav>

        {/* Hero */}
        <section className="landing-hero">
          <div className="hero-badge">
            <Sparkles size={13} />
            AI-Powered Code Intelligence
          </div>
          <h1 className="hero-title">
            Review, Rewrite &<br />
            <span className="hero-gradient">Optimize Your Code</span>
          </h1>
          <p className="hero-subtitle">
            The all-in-one AI platform for code review, optimization, testing, visualization, debugging, and more.
            Supports 13+ languages. Powered by advanced AI.
          </p>
          <div className="hero-cta">
            <button className="landing-btn-primary hero-btn" onClick={onRegister}>
              Start For Free <ArrowRight size={16} />
            </button>
            <button className="landing-btn-outline hero-btn" onClick={onLogin}>
              Sign In
            </button>
          </div>

          {/* Stats */}
          <div className="hero-stats">
            {STATS.map((s, i) => (
              <div key={i} className="hero-stat">
                <div className="hero-stat-value">{s.value}</div>
                <div className="hero-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="landing-features" id="features">
          <div className="section-header">
            <h2 className="section-title">Powerful Features</h2>
            <p className="section-subtitle">Everything you need to write better code, faster.</p>
          </div>
          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <div key={i} className="feature-card">
                <div className="feature-icon" style={{ background: f.color + '18', color: f.color }}>
                  <f.icon size={22} />
                </div>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="landing-cta">
          <div className="cta-card">
            <h2>Ready to Level Up Your Code?</h2>
            <p>Join developers who use AI-powered code intelligence to ship better software.</p>
            <button className="landing-btn-primary hero-btn" onClick={onRegister}>
              Create Free Account <ArrowRight size={16} />
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="landing-footer">
          <div className="landing-footer-content">
            <div className="landing-footer-brand">
              <BrainCircuit size={16} />
              <span>Code Review Sage</span>
            </div>
            <p>Built with React, FastAPI & Groq AI</p>
          </div>
        </footer>
      </div>
    </>
  );
}

/* ── Auth Modal ── */
function AuthModal({ mode, onClose, onSwitch, onSuccess }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isLogin = mode === 'login';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Email and password are required');
      return;
    }
    if (!isLogin && !name.trim()) {
      setError('Name is required');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const data = isLogin
        ? await api.loginUser(email, password)
        : await api.registerUser(name, email, password);
      onSuccess(data);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    }
    setLoading(false);
  };

  return (
    <div className="auth-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="auth-modal">
        <button className="auth-close" onClick={onClose}><X size={18} /></button>

        <div className="auth-header">
          <div className="logo-icon" style={{ width: 44, height: 44, borderRadius: 12 }}>
            <BrainCircuit size={22} />
          </div>
          <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
          <p>{isLogin ? 'Sign in to access your dashboard' : 'Get started with Code Review Sage'}</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="auth-field">
              <label><User size={14} /> Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
          )}
          <div className="auth-field">
            <label><Mail size={14} /> Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <div className="auth-field">
            <label><Lock size={14} /> Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="auth-switch">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}
          <button onClick={onSwitch}>{isLogin ? 'Sign Up' : 'Sign In'}</button>
        </div>
      </div>
    </div>
  );
}
/* ── Practice Mode Page (Redesigned) ── */
const PRACTICE_TOPICS = [
  { label: 'Arrays', icon: '📊', cat: 'ds' }, { label: 'Strings', icon: '🔤', cat: 'ds' },
  { label: 'Linked Lists', icon: '🔗', cat: 'ds' }, { label: 'Trees', icon: '🌳', cat: 'ds' },
  { label: 'Graphs', icon: '🕸️', cat: 'ds' }, { label: 'Stack & Queue', icon: '📚', cat: 'ds' },
  { label: 'Hashing', icon: '#️⃣', cat: 'ds' },
  { label: 'Dynamic Programming', icon: '🧩', cat: 'algo' }, { label: 'Sorting', icon: '📈', cat: 'algo' },
  { label: 'Searching', icon: '🔍', cat: 'algo' }, { label: 'Recursion', icon: '🔄', cat: 'algo' },
  { label: 'Greedy', icon: '💰', cat: 'algo' }, { label: 'Backtracking', icon: '↩️', cat: 'algo' },
  { label: 'Two Pointers', icon: '👆', cat: 'tech' }, { label: 'Sliding Window', icon: '🪟', cat: 'tech' },
  { label: 'Binary Search', icon: '🎯', cat: 'tech' }, { label: 'Bit Manipulation', icon: '⚙️', cat: 'tech' },
  { label: 'Math', icon: '🧮', cat: 'tech' },
];
const DIFFICULTY_COLORS = {
  easy: { bg: 'rgba(16,185,129,0.15)', color: '#34d399', border: 'rgba(16,185,129,0.3)', glow: 'rgba(16,185,129,0.08)' },
  medium: { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: 'rgba(245,158,11,0.3)', glow: 'rgba(245,158,11,0.08)' },
  hard: { bg: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'rgba(239,68,68,0.3)', glow: 'rgba(239,68,68,0.08)' },
};
const DIFFICULTY_ICONS = { easy: '🌱', medium: '🔥', hard: '💀' };

function PracticePage({ theme, language, setLanguage, loading, showToast }) {
  const [topic, setTopic] = useState('Arrays');
  const [difficulty, setDifficulty] = useState('medium');
  const [problemData, setProblemData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [solutionCode, setSolutionCode] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [runOutput, setRunOutput] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef(null);
  const outputRef = useRef(null);

  // Timer logic
  useEffect(() => {
    if (timerActive) {
      timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [timerActive]);

  useEffect(() => {
    if (outputRef.current) highlightAllCode(outputRef.current);
  }, [problemData]);

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setSolutionCode('');
    setRunOutput(null);
    setTimerSeconds(0);
    setTimerActive(false);
    try {
      const data = await api.generatePractice(topic, difficulty, language);
      setProblemData(data);
      setTimerActive(true);
      showToast('✅ Problem generated! Timer started.');
    } catch (err) { showToast(`❌ ${err.message}`); }
    finally { setIsGenerating(false); }
  };

  const handleRunSolution = async () => {
    if (!solutionCode.trim()) { showToast('⚠️ Write your solution first'); return; }
    setIsRunning(true);
    setRunOutput('⏳ Running...');
    try {
      const result = await api.executeCode(solutionCode, language);
      setRunOutput(result);
    } catch (err) { setRunOutput(`❌ Error: ${err.message}`); }
    finally { setIsRunning(false); }
  };

  const dc = DIFFICULTY_COLORS[difficulty];

  return (
    <div className="main-content" style={{ flex: 1 }}>
      <header className="main-header">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><BookOpen size={18} /> Practice Mode</h2>
          <p>AI-generated DSA problems — solve, learn, master</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {/* Timer */}
          {problemData && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.3rem 0.7rem', borderRadius: '8px',
              background: timerActive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${timerActive ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
              fontFamily: "'Fira Code', monospace", fontSize: '0.82rem', fontWeight: 700,
              color: timerActive ? '#34d399' : '#f87171',
              cursor: 'pointer', transition: 'all 0.2s',
            }} onClick={() => setTimerActive(!timerActive)} title={timerActive ? 'Pause timer' : 'Resume timer'}>
              <Activity size={13} />
              {formatTime(timerSeconds)}
            </div>
          )}
          <Code2 size={14} style={{ color: 'var(--text-muted)' }} />
          <select className="lang-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
          </select>
        </div>
      </header>

      <div className="main-body" style={{ overflow: 'hidden' }}>
        <div className="convert-page-layout">
          {/* ── Left Panel: Controls + Code Editor ── */}
          <div className="convert-input-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Difficulty Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              {['easy', 'medium', 'hard'].map((d) => {
                const c = DIFFICULTY_COLORS[d];
                return (
                  <button key={d} onClick={() => setDifficulty(d)}
                    style={{
                      flex: 1, padding: '0.55rem', border: 'none', cursor: 'pointer',
                      background: difficulty === d ? c.bg : 'transparent',
                      color: difficulty === d ? c.color : 'var(--text-muted)',
                      fontWeight: difficulty === d ? 700 : 500, fontSize: '0.73rem',
                      borderBottom: difficulty === d ? `2px solid ${c.color}` : '2px solid transparent',
                      transition: 'all 0.2s', textTransform: 'uppercase', letterSpacing: '0.05em',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
                    }}
                  >{DIFFICULTY_ICONS[d]} {d}</button>
                );
              })}
            </div>

            {/* Topic Grid with category headers */}
            <div style={{ padding: '0.6rem', borderBottom: '1px solid var(--border)', overflowY: 'auto', maxHeight: '200px' }}>
              {[
                { key: 'ds', title: '📦 Data Structures' },
                { key: 'algo', title: '🧠 Algorithms' },
                { key: 'tech', title: '🔧 Techniques' },
              ].map(cat => (
                <div key={cat.key} style={{ marginBottom: '0.35rem' }}>
                  <div style={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.2rem', paddingLeft: '0.15rem' }}>
                    {cat.title}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', marginBottom: '0.25rem' }}>
                    {PRACTICE_TOPICS.filter(t => t.cat === cat.key).map((t) => (
                      <button key={t.label} onClick={() => setTopic(t.label)}
                        style={{
                          padding: '0.3rem 0.5rem', borderRadius: '6px',
                          border: topic === t.label ? `1px solid ${dc.border}` : '1px solid var(--border)',
                          background: topic === t.label ? dc.bg : 'var(--bg-input)',
                          color: topic === t.label ? dc.color : 'var(--text-secondary)',
                          fontWeight: topic === t.label ? 600 : 400, fontSize: '0.65rem',
                          cursor: 'pointer', transition: 'all 0.15s',
                          display: 'flex', alignItems: 'center', gap: '0.25rem',
                          boxShadow: topic === t.label ? `0 0 8px ${dc.glow}` : 'none',
                        }}
                      ><span style={{ fontSize: '0.72rem' }}>{t.icon}</span> {t.label}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Generate Button */}
            <div style={{ padding: '0.5rem 0.6rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <button className="action-btn btn-review" onClick={handleGenerate}
                disabled={isGenerating || !!loading}
                style={{
                  width: '100%', padding: '0.6rem', fontSize: '0.78rem',
                  background: `linear-gradient(135deg, ${dc.bg}, ${dc.glow})`,
                  color: dc.color, border: `1px solid ${dc.border}`,
                  fontWeight: 700, letterSpacing: '0.02em',
                  boxShadow: `0 2px 12px ${dc.glow}`,
                }}>
                {isGenerating ? '⏳ Generating...' : `${DIFFICULTY_ICONS[difficulty]} Generate ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} ${topic}`}
              </button>
            </div>

            {/* Solution Editor */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div className="editor-toolbar">
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div className="window-dots">
                    <span className="dot-red"></span>
                    <span className="dot-yellow"></span>
                    <span className="dot-green"></span>
                  </div>
                  <span className="editor-label">Your Solution</span>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button className="toolbar-btn" onClick={handleRunSolution} disabled={isRunning}
                    style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
                    <Play size={12} fill="currentColor" /> {isRunning ? 'Running...' : 'Run'}
                  </button>
                  <button className="toolbar-btn" onClick={() => { setSolutionCode(''); setRunOutput(null); }}>
                    <Trash2 size={12} /> Clear
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, minHeight: '300px' }}>
                <Editor
                  height="100%"
                  language={MONACO_LANG[language] || 'plaintext'}
                  value={solutionCode}
                  onChange={(val) => setSolutionCode(val || '')}
                  theme={theme === 'dark' ? 'vs-dark' : 'light'}
                  options={VSCODE_EDITOR_OPTIONS}
                />
              </div>
            </div>

            {/* Execution Output */}
            {runOutput !== null && (
              <div style={{
                padding: '0.6rem 0.75rem', background: '#0d1117',
                borderTop: '1px solid var(--border)', maxHeight: '140px', overflowY: 'auto',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: runOutput?.startsWith('❌') ? '#f87171' : 'var(--accent-green)' }}>
                    <Terminal size={11} /> Output
                  </span>
                  <button className="toolbar-btn" onClick={() => setRunOutput(null)} style={{ padding: '0.15rem' }}><Trash2 size={10} /></button>
                </div>
                <pre style={{ fontSize: '0.73rem', color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, fontFamily: "'Fira Code', monospace", lineHeight: 1.5 }}>
                  {runOutput}
                </pre>
              </div>
            )}
          </div>

          {/* ── Right Panel: Problem Display ── */}
          <div className="convert-output-panel" style={{ overflowY: 'auto' }}>
            {isGenerating ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem' }}>
                <div className="loading-spinner"></div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  {DIFFICULTY_ICONS[difficulty]} Generating {difficulty} {topic} problem...
                </p>
              </div>
            ) : problemData ? (
              <div className="output-content" ref={outputRef} style={{ padding: '1.25rem' }}>
                {/* Problem header badges */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <span style={{
                    padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.62rem', fontWeight: 700,
                    background: dc.bg, color: dc.color, border: `1px solid ${dc.border}`, textTransform: 'uppercase',
                    display: 'flex', alignItems: 'center', gap: '0.2rem',
                  }}>
                    {DIFFICULTY_ICONS[difficulty]} {difficulty}
                  </span>
                  <span style={{
                    padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.62rem', fontWeight: 600,
                    background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)',
                  }}>
                    {topic}
                  </span>
                  {timerActive && (
                    <span style={{
                      padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.62rem', fontWeight: 600,
                      background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)',
                      fontFamily: "'Fira Code', monospace",
                    }}>
                      ⏱ {formatTime(timerSeconds)}
                    </span>
                  )}
                </div>
                <div className="prose-output" dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(problemData.problem) }} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: '2rem' }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.08))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem',
                  border: '1px solid rgba(99,102,241,0.15)',
                }}>
                  <BookOpen size={28} style={{ color: '#818cf8', opacity: 0.7 }} />
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.4rem' }}>Ready to Practice</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.76rem', maxWidth: '300px', lineHeight: 1.5 }}>
                  Pick a topic and difficulty, then generate a problem. Write your solution and run it to test!
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  {['easy', 'medium', 'hard'].map(d => {
                    const c = DIFFICULTY_COLORS[d];
                    return (
                      <span key={d} style={{
                        padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.6rem', fontWeight: 600,
                        background: c.bg, color: c.color, border: `1px solid ${c.border}`,
                      }}>{DIFFICULTY_ICONS[d]} {d}</span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Snippets Manager Page (Redesigned) ── */
function SnippetsPage({ theme, showToast, code, language }) {
  const [snippets, setSnippets] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [editorCode, setEditorCode] = useState(code || '');
  const [editorLang, setEditorLang] = useState(language || 'python');
  const [snippetTitle, setSnippetTitle] = useState('');
  const [snippetNotes, setSnippetNotes] = useState('');
  const [viewingSnippet, setViewingSnippet] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionOutput, setExecutionOutput] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');


  useEffect(() => {
    api.getFolders().then(d => setFolders(d.folders || [])).catch(() => { });
    api.getSnippets().then(d => setSnippets(d.snippets || [])).catch(() => { });
  }, []);

  // Sync from main editor when component mounts
  useEffect(() => { if (code) setEditorCode(code); }, [code]);
  useEffect(() => { if (language) setEditorLang(language); }, [language]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await api.createFolder(newFolderName.trim());
      setNewFolderName('');
      const d = await api.getFolders();
      setFolders(d.folders || []);
      showToast(`📁 Folder "${newFolderName}" created`);
    } catch (err) { showToast(`❌ ${err.message}`); }
  };

  const handleDeleteFolder = async (folderId) => {
    try {
      await api.deleteFolder(folderId);
      const d = await api.getFolders();
      setFolders(d.folders || []);
      if (selectedFolder === folderId) setSelectedFolder(null);
      showToast('🗑️ Folder deleted');
    } catch (err) { showToast(`❌ ${err.message}`); }
  };

  const handleSaveSnippet = async () => {
    if (!snippetTitle.trim()) { showToast('⚠️ Enter a title first'); return; }
    if (!editorCode.trim()) { showToast('⚠️ Write some code first'); return; }
    try {
      await api.saveSnippet(snippetTitle.trim(), editorCode, editorLang, snippetNotes, selectedFolder);
      setSnippetTitle('');
      setSnippetNotes('');
      const d = await api.getSnippets();
      setSnippets(d.snippets || []);
      showToast('✅ Snippet saved!');
    } catch (err) { showToast(`❌ ${err.message}`); }
  };

  const handleDeleteSnippet = async (id) => {
    try {
      await api.deleteSnippet(id);
      setSnippets(snippets.filter(s => s.id !== id));
      if (viewingSnippet?.id === id) setViewingSnippet(null);
      showToast('🗑️ Snippet deleted');
    } catch (err) { showToast(`❌ ${err.message}`); }
  };

  const handleExport = (snippet) => {
    downloadFile(snippet.code, `${snippet.title}.${getFileExtension(snippet.language)}`);
    showToast('📥 Exported!');
  };

  const loadSnippetInEditor = (snippet) => {
    setEditorCode(snippet.code);
    setEditorLang(snippet.language);
    setSnippetTitle(snippet.title);
    setSnippetNotes(snippet.notes || '');
    setViewingSnippet(null);
    showToast('📝 Loaded into editor');
  };

  const getSnippetPreview = (code) => {
    const lines = (code || '').split('\n').slice(0, 4);
    return lines.join('\n') + (code.split('\n').length > 4 ? '\n...' : '');
  };

  const folderSnippetCount = (folderId) => snippets.filter(s => s.folder_id === folderId).length;

  let filteredSnippets = selectedFolder
    ? snippets.filter(s => s.folder_id === selectedFolder)
    : snippets;

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filteredSnippets = filteredSnippets.filter(s =>
      s.title.toLowerCase().includes(q) || s.language.toLowerCase().includes(q) ||
      (s.notes || '').toLowerCase().includes(q) || (s.code || '').toLowerCase().includes(q)
    );
  }

  return (
    <div className="main-content" style={{ flex: 1 }}>
      <header className="main-header">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><FolderOpen size={18} /> My Snippets</h2>
          <p>Write, save, organize, and export your code</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{
            padding: '0.25rem 0.6rem', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 600,
            background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)',
          }}>{snippets.length} snippet{snippets.length !== 1 ? 's' : ''}</span>
        </div>
      </header>

      <div className="main-body" style={{ overflow: 'hidden' }}>
        <div className="convert-page-layout">
          {/* ── Left Panel: Code Editor ── */}
          <div className="convert-input-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Title + Language Bar */}
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', alignItems: 'center' }}>
              <input
                style={{ flex: 1, padding: '0.4rem 0.6rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.78rem' }}
                value={snippetTitle} onChange={(e) => setSnippetTitle(e.target.value)}
                placeholder="Snippet title..."
              />
              <select className="lang-select" value={editorLang} onChange={(e) => setEditorLang(e.target.value)} style={{ padding: '0.4rem' }}>
                {LANGUAGES.map((l) => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
              </select>
            </div>

            {/* Editor Toolbar */}
            <div className="editor-toolbar">
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div className="window-dots">
                  <span className="dot-red"></span>
                  <span className="dot-yellow"></span>
                  <span className="dot-green"></span>
                </div>
                <span className="editor-label">Code Editor</span>
              </div>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button className="toolbar-btn" onClick={async () => {
                  if (!editorCode.trim()) return;
                  setIsExecuting(true); setExecutionOutput('Running...');
                  try {
                    const result = await api.executeCode(editorCode, editorLang);
                    setExecutionOutput(result);
                  } catch (err) { setExecutionOutput(`Error: ${err.message}`); }
                  finally { setIsExecuting(false); }
                }} disabled={isExecuting} style={{ color: 'var(--accent-green)' }}>
                  <Play size={12} fill="currentColor" /> {isExecuting ? 'Running...' : 'Run'}
                </button>
                <button className="toolbar-btn" onClick={() => { setEditorCode(SAMPLE_CODES[editorLang] || SAMPLE_CODES.python); showToast(`🧪 Loaded ${editorLang} sample`); }}>
                  <FlaskConical size={12} /> Sample
                </button>
                <button className="toolbar-btn" onClick={() => { setEditorCode(''); setExecutionOutput(null); }}>
                  <Trash2 size={12} /> Clear
                </button>
              </div>
            </div>

            {/* Monaco Editor */}
            <div style={{ flex: 1, minHeight: '300px' }}>
              <Editor
                height="100%"
                language={MONACO_LANG[editorLang] || 'plaintext'}
                value={editorCode}
                onChange={(val) => setEditorCode(val || '')}
                theme={theme === 'dark' ? 'vs-dark' : 'light'}
                options={VSCODE_EDITOR_OPTIONS}
              />
            </div>

            {/* Execution Output Panel */}
            {executionOutput !== null && (
              <div style={{ padding: '0.6rem 0.75rem', background: '#0d1117', borderTop: '1px solid var(--border)', maxHeight: '140px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.68rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    color: executionOutput?.startsWith('❌') ? '#f87171' : 'var(--accent-green)',
                  }}>
                    <Terminal size={11} /> Output
                  </span>
                  <button className="toolbar-btn" onClick={() => setExecutionOutput(null)} style={{ padding: '0.15rem' }}><Trash2 size={10} /></button>
                </div>
                <pre style={{ fontSize: '0.73rem', color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, fontFamily: "'Fira Code', monospace", lineHeight: 1.5 }}>
                  {executionOutput}
                </pre>
              </div>
            )}

            {/* Notes + Save Bar */}
            <div style={{ padding: '0.6rem 0.75rem', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <input
                style={{ width: '100%', padding: '0.35rem 0.6rem', marginBottom: '0.5rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.72rem' }}
                value={snippetNotes} onChange={(e) => setSnippetNotes(e.target.value)}
                placeholder="Notes (optional)..."
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select style={{ padding: '0.4rem 0.6rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.72rem' }}
                  value={selectedFolder || ''} onChange={(e) => setSelectedFolder(e.target.value ? parseInt(e.target.value) : null)}>
                  <option value="">No folder</option>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <button className="action-btn btn-review" onClick={handleSaveSnippet}
                  style={{ flex: 1, padding: '0.5rem', fontSize: '0.78rem' }}>
                  💾 Save Snippet
                </button>
              </div>
            </div>
          </div>

          {/* ── Right Panel: Folders + Snippets List ── */}
          <div className="convert-output-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Folder bar */}
            <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Folders</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.4rem' }}>
                <button onClick={() => setSelectedFolder(null)}
                  style={{
                    padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.65rem', cursor: 'pointer',
                    border: !selectedFolder ? '1px solid rgba(99,102,241,0.4)' : '1px solid var(--border)',
                    background: !selectedFolder ? 'rgba(99,102,241,0.12)' : 'var(--bg-input)',
                    color: !selectedFolder ? '#818cf8' : 'var(--text-secondary)',
                    fontWeight: !selectedFolder ? 600 : 400,
                  }}>📁 All ({snippets.length})</button>
                {folders.map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
                    <button onClick={() => setSelectedFolder(f.id)}
                      style={{
                        padding: '0.2rem 0.5rem', borderRadius: '999px 0 0 999px', fontSize: '0.65rem', cursor: 'pointer',
                        border: selectedFolder === f.id ? '1px solid rgba(99,102,241,0.4)' : '1px solid var(--border)',
                        borderRight: 'none',
                        background: selectedFolder === f.id ? 'rgba(99,102,241,0.12)' : 'var(--bg-input)',
                        color: selectedFolder === f.id ? '#818cf8' : 'var(--text-secondary)',
                        fontWeight: selectedFolder === f.id ? 600 : 400,
                      }}>📂 {f.name} ({folderSnippetCount(f.id)})</button>
                    <button onClick={() => handleDeleteFolder(f.id)} title="Delete folder"
                      style={{
                        padding: '0.2rem 0.35rem', borderRadius: '0 999px 999px 0', fontSize: '0.6rem', cursor: 'pointer',
                        border: selectedFolder === f.id ? '1px solid rgba(99,102,241,0.4)' : '1px solid var(--border)',
                        borderLeft: '1px solid var(--border)',
                        background: selectedFolder === f.id ? 'rgba(99,102,241,0.12)' : 'var(--bg-input)',
                        color: '#f87171',
                      }}><X size={9} /></button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <input
                  style={{ flex: 1, padding: '0.3rem 0.5rem', fontSize: '0.65rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
                  value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New folder..." onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                />
                <button className="toolbar-btn" onClick={handleCreateFolder} style={{ padding: '0.3rem 0.5rem', fontSize: '0.65rem' }}>+ Add</button>
              </div>
            </div>

            {/* Search Bar */}
            <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.3rem 0.5rem' }}>
                <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                  style={{ flex: 1, padding: '0', fontSize: '0.7rem', background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }}
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search snippets..."
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)' }}>
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            {/* Snippets list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.6rem' }}>
              {filteredSnippets.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: '2rem' }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.08))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem',
                    border: '1px solid rgba(99,102,241,0.15)',
                  }}>
                    <FolderOpen size={24} style={{ color: '#818cf8', opacity: 0.7 }} />
                  </div>
                  <h3 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '0.3rem' }}>
                    {searchQuery ? 'No matches found' : 'No Snippets Yet'}
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', lineHeight: 1.5 }}>
                    {searchQuery ? 'Try a different search term' : 'Write code in the editor and click "Save Snippet"'}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  {filteredSnippets.map(s => (
                    <div key={s.id}
                      style={{
                        padding: '0.55rem 0.65rem', background: 'var(--bg-input)', border: '1px solid var(--border)',
                        borderRadius: '8px', transition: 'all 0.15s border-color',
                      }}
                    >
                      {/* Header row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.3rem' }}>
                        <div onClick={() => loadSnippetInEditor(s)} style={{ flex: 1, cursor: 'pointer' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.76rem', marginBottom: '0.15rem' }}>{s.title}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                            <span style={{ padding: '0.08rem 0.3rem', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: '#818cf8', fontSize: '0.58rem', fontWeight: 600 }}>{s.language}</span>
                            <span>{s.created_at}</span>
                            {s.notes && <span>• {s.notes.length > 30 ? s.notes.slice(0, 30) + '…' : s.notes}</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.15rem', flexShrink: 0 }}>
                          <button className="toolbar-btn" title="Load in editor" onClick={() => loadSnippetInEditor(s)} style={{ padding: '0.2rem' }}>
                            <Code2 size={10} />
                          </button>
                          <button className="toolbar-btn" title="Export" onClick={() => handleExport(s)} style={{ padding: '0.2rem' }}>
                            <Download size={10} />
                          </button>
                          <button className="toolbar-btn" title="Copy" onClick={() => { copyToClipboard(s.code).then(() => showToast('📋 Copied!')); }} style={{ padding: '0.2rem' }}>
                            <Copy size={10} />
                          </button>
                          <button className="toolbar-btn" title="Delete" onClick={() => handleDeleteSnippet(s.id)} style={{ padding: '0.2rem', color: 'var(--accent-red)' }}>
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                      {/* Code preview */}
                      <div onClick={() => loadSnippetInEditor(s)} style={{ cursor: 'pointer' }}>
                        <pre style={{
                          fontSize: '0.62rem', lineHeight: 1.4, margin: 0, padding: '0.35rem 0.45rem',
                          background: '#0d1117', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.05)',
                          color: '#8b949e', overflow: 'hidden', maxHeight: '65px',
                          fontFamily: "'Fira Code', monospace", whiteSpace: 'pre', textOverflow: 'ellipsis',
                        }}>
                          {getSnippetPreview(s.code)}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

