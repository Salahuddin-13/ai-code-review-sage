"""
AI Code Review Sage — FastAPI Backend
All AI endpoints for code review, rewrite, test generation, debugging, metrics, chat, visualization
With database-backed auth and history.
"""

import os
import re
import json
import time
import uvicorn
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from groq import Groq
import httpx
from database import (init_db, create_user, authenticate_user, create_session,
    validate_token, delete_session, save_history, get_user_history,
    delete_history_item, clear_user_history,
    create_folder, get_user_folders, delete_folder as db_delete_folder,
    save_snippet, get_user_snippets, delete_snippet as db_delete_snippet)

# ──────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_API_KEY_FALLBACK = os.getenv("GROQ_API_KEY_FALLBACK")

if not GROQ_API_KEY:
    print("⚠️  WARNING: GROQ_API_KEY not found. AI features will not work.")
    client = None
    fallback_client = None
else:
    client = Groq(api_key=GROQ_API_KEY)
    fallback_client = Groq(api_key=GROQ_API_KEY_FALLBACK) if GROQ_API_KEY_FALLBACK else None
    if fallback_client:
        print("✅ Fallback API key configured")

MODEL_NAME = "llama-3.3-70b-versatile"
TEMPERATURE = 0.3
MAX_TOKENS = 4096
TOP_P = 0.9

# ──────────────────────────────────────────────
# FastAPI App
# ──────────────────────────────────────────────
app = FastAPI(title="AI Code Review Sage")

# Initialize database on startup
init_db()

# CORS — allow all origins in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files (React build)
STATIC_DIR = Path(__file__).parent / "frontend" / "dist"
if STATIC_DIR.exists():
    if (STATIC_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

# ──────────────────────────────────────────────
# Request Models
# ──────────────────────────────────────────────

class CodeReviewRequest(BaseModel):
    code: str
    language: str = "python"
    focus_areas: list[str] = []

class CodeRewriteRequest(BaseModel):
    code: str
    language: str = "python"
    instructions: Optional[str] = ""

class CodeVisualizeRequest(BaseModel):
    code: str
    language: str = "python"

class CodeExplainRequest(BaseModel):
    code: str
    language: str = "python"

class PatternRequest(BaseModel):
    code: str
    language: str

class ExecuteRequest(BaseModel):
    code: str
    language: str = "python"

class CodeTestRequest(BaseModel):
    code: str
    language: str = "python"

class CodeDebugRequest(BaseModel):
    code: str
    language: str = "python"
    error_message: str = ""

class CodeMetricsRequest(BaseModel):
    code: str
    language: str = "python"

class ChatRequest(BaseModel):
    code: str = ""
    language: str = "python"
    message: str
    history: list[dict] = []

class DSVisualizeRequest(BaseModel):
    code: str
    language: str = "python"

class CodeConvertRequest(BaseModel):
    code: str
    language: str = "python"
    target_language: str = "javascript"

# Auth Models
class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class HistorySaveRequest(BaseModel):
    action: str
    language: str
    code: str
    result_preview: str = ""

# ──────────────────────────────────────────────
# Helper Functions
# ──────────────────────────────────────────────

def parse_review_response(review_text: str) -> dict:
    if not review_text:
        return {"critical": 0, "high": 0, "medium": 0, "low": 0}
    severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for severity in ["critical", "high", "medium", "low"]:
        try:
            pattern = rf"(?:#{1,3}\s*)?(?:🔴|🟠|🟡|🟢)?\s*{severity}\s*(?:Issues?|Priority)?[^\n]*\n([\s\S]*?)(?=(?:#{1,3}\s*)?(?:🔴|🟠|🟡|🟢)?\s*(?:Critical|High|Medium|Low|Summary|💡)|$)"
            match = re.search(pattern, review_text, re.IGNORECASE)
            if match and match.group(1):
                section = match.group(1)
                numbered = re.findall(r"(?m)^\s*\d+\.\s+", section)
                bold_issues = re.findall(r"\*\*[^*]+\*\*", section)
                count = max(len(numbered), len(bold_issues) // 2)
                if count == 0:
                    bullets = re.findall(r"(?m)^\s*[-*●•]\s+", section)
                    count = len(bullets)
                count = min(count, 20)
                severity_counts[severity] = count
                if re.search(r"no\s+\w*\s*(issues?|problems?)\s+found", section, re.IGNORECASE):
                    severity_counts[severity] = 0
        except Exception:
            severity_counts[severity] = 0
    return severity_counts


def call_groq(system_prompt: str, user_prompt: str) -> str:
    if not client:
        raise HTTPException(status_code=503, detail="AI service not configured. Set GROQ_API_KEY environment variable.")

    def _make_request(ai_client):
        chat_completion = ai_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            model=MODEL_NAME,
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS,
            top_p=TOP_P,
        )
        return chat_completion.choices[0].message.content

    # Retry with exponential backoff for rate limits (free tier can be flaky)
    max_retries = 3
    for attempt in range(max_retries + 1):
        try:
            return _make_request(client)
        except Exception as e:
            error_str = str(e)
            is_rate_limited = "429" in error_str or "rate_limit" in error_str.lower()

            # If rate limited, retry with backoff before giving up
            if is_rate_limited and attempt < max_retries:
                wait_time = 2 ** (attempt + 1)  # 2s, 4s, 8s
                print(f"⚠️ Rate limited (attempt {attempt + 1}/{max_retries}), retrying in {wait_time}s...")
                time.sleep(wait_time)
                continue

            # Try fallback key if available
            if is_rate_limited and fallback_client:
                print(f"⚠️ Primary key exhausted retries, switching to fallback key...")
                try:
                    return _make_request(fallback_client)
                except Exception as e2:
                    raise HTTPException(status_code=500, detail=f"API error (both keys failed): {str(e2)}")

            raise HTTPException(status_code=500, detail=f"API error: {error_str}")


def get_current_user(request: Request) -> dict | None:
    """Extract user from Authorization header. Returns None if not authenticated."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        return validate_token(token)
    return None


# ──────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────

@app.get("/")
async def serve_home():
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return HTMLResponse(content=index_path.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Code Review Sage — Backend Running ✅</h1><p>Set up the frontend or visit /docs</p>")


@app.get("/health")
async def health_check():
    return JSONResponse(content={"status": "ok", "ai_configured": client is not None})


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """Catch-all: serve React app for any non-API route."""
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return HTMLResponse(content=index_path.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Code Review Sage — Backend Running ✅</h1><p>Frontend not built. Visit /docs</p>")


@app.post("/api/review")
async def review_code(request: CodeReviewRequest):
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    focus = ", ".join(request.focus_areas) if request.focus_areas else "bugs, performance, security, best practices"

    system_prompt = """You are an expert AI code reviewer. Provide thorough, well-structured code reviews.

CRITICAL: FIRST detect the ACTUAL programming language of the code, regardless of what the user says.
If the user says "Ruby" but the code is clearly C/Python/JavaScript, review it AS the actual language.
Include a note like "⚠️ Language mismatch: Code appears to be [actual language], not [claimed language]."

Format your response EXACTLY in this markdown structure:

## 📊 Overall Quality Score
**Score: XX/100** — One sentence overall assessment.

SCORING RUBRIC (follow strictly):
- **90-100**: Production-ready. Clean code, proper error handling, no security issues, follows best practices. Only give 90+ if the code is genuinely excellent.
- **70-89**: Good code with minor issues. Some improvements possible but no critical bugs.
- **50-69**: Significant issues found. Has bugs, security vulnerabilities, or poor practices that need fixing.
- **30-49**: Major problems. Multiple critical issues, security vulnerabilities, poor structure.
- **0-29**: Broken, dangerous, or completely dysfunctional code.

SCORING RULES:
- SQL injection vulnerability: deduct 15-25 points
- Using eval() or exec() with user input: deduct 15-20 points
- No error handling: deduct 10-15 points
- Hardcoded credentials: deduct 15-20 points
- Resource leaks (unclosed files/connections): deduct 5-10 points
- Poor naming or style: deduct 3-5 points
- If the code is incomplete, nonsensical, or just fragments: score MUST be below 30
- If the code has SQL injection AND eval(): score MUST be below 45

## 🔴 Critical Issues
(List critical bugs, security vulnerabilities, or crash risks. Number each issue. If none, say "No critical issues found.")

For each issue use this format:
1. **Issue Title**
   - **Line**: the relevant code
   - **Problem**: description
   - **Why it matters**: explanation
   - **Fix**: suggested solution with a short code snippet

## 🟠 High Priority
(Same format as above for high-priority issues)

## 🟡 Medium Priority
(Same format for medium-priority issues)

## 🟢 Low Priority
(Same format for low-priority issues)

## 💡 Summary & Recommendations
Provide 3-5 key takeaways as bullet points.

## ⏱️ Complexity Analysis
- **Time Complexity**: O(?) — explain why
- **Space Complexity**: O(?) — explain why
- **Optimization Suggestion**: If complexity can be improved, explain how (e.g., "Use a hashmap to reduce from O(n²) to O(n)")

IMPORTANT RULES:
- Use proper markdown headings (##)
- Use numbered lists for issues
- Use bold (**text**) for labels
- Put code in backtick code blocks with language tag
- Do NOT nest code blocks inside other code blocks
- Keep each section clean and well-formatted
- Be STRICT and CONSISTENT with the quality score. Low-quality code MUST get low scores."""

    user_prompt = f"""Review the following code. The user selected language: {request.language}. 
IMPORTANT: Detect the ACTUAL language of the code and review it accordingly. If there's a mismatch, note it.
Focus areas: {focus}

```
{request.code}
```"""

    review_text = call_groq(system_prompt, user_prompt)
    severity_counts = parse_review_response(review_text)

    # Extract score
    score = 50  # default to middling if extraction fails
    score_match = re.search(r"\*\*Score:\s*(\d+)/100\*\*", review_text)
    if not score_match:
        score_match = re.search(r"(\d+)/100", review_text)
    if score_match:
        score = int(score_match.group(1))
    
    # Detect actual language from review text
    detected_language = request.language
    lang_mismatch = re.search(r"appears to be ([\w+#]+)", review_text, re.IGNORECASE)
    if lang_mismatch:
        detected = lang_mismatch.group(1).lower()
        lang_map = {"c": "c", "python": "python", "javascript": "javascript", "java": "java", 
                     "ruby": "ruby", "go": "go", "rust": "rust", "typescript": "typescript",
                     "c++": "cpp", "cpp": "cpp", "c#": "csharp", "csharp": "csharp",
                     "php": "php", "swift": "swift", "kotlin": "kotlin"}
        if detected in lang_map:
            detected_language = lang_map[detected]

    return JSONResponse(content={
        "review": review_text,
        "quality_score": score,
        "severity_counts": severity_counts,
        "language": request.language,
        "detected_language": detected_language
    })


@app.post("/api/rewrite")
async def rewrite_code(request: CodeRewriteRequest):
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    extra_instructions = f"\nAdditional instructions: {request.instructions}" if request.instructions else ""

    system_prompt = f"""You are an expert code optimizer and refactoring specialist.
Rewrite the given code to be clean, optimized, secure, well-documented, and production-ready.

CRITICAL LANGUAGE RULE: The code is written in {request.language}. You MUST rewrite it in {request.language}.
Do NOT convert the code to a different programming language. Keep it in {request.language}.
If the code is C, rewrite it in C. If the code is C++, rewrite it in C++. If the code is Python, rewrite it in Python.
NEVER change the programming language of the code.

Format your response EXACTLY like this:

## ✨ Rewritten Code

```{request.language}
(the complete rewritten code here — MUST be in {request.language})
```

## 📝 Changes Made
List each change as a bullet point:
- **Change title**: explanation of what changed and why

## 🚀 Performance Improvements
List performance improvements as bullet points.

## 🔒 Security Fixes
List security fixes as bullet points. If none needed, say "No security issues found."

## 📎 Additional Notes
Any other recommendations.

IMPORTANT: Put the complete rewritten code in a SINGLE fenced code block with the correct language tag ({request.language}).
The rewritten code MUST be in {request.language}. This is non-negotiable."""

    user_prompt = f"""Rewrite and optimize the following {request.language} code to production quality. Keep it in {request.language} — do NOT convert to any other language.{extra_instructions}

```{request.language}
{request.code}
```"""

    rewrite_text = call_groq(system_prompt, user_prompt)
    code_match = re.search(r"```(?:\w+)?\n(.*?)```", rewrite_text, re.DOTALL)
    rewritten_code = code_match.group(1).strip() if code_match else ""

    return JSONResponse(content={
        "rewrite": rewrite_text,
        "rewritten_code": rewritten_code,
        "original_code": request.code,
        "language": request.language
    })


@app.post("/api/visualize")
async def visualize_code(request: CodeVisualizeRequest):
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    system_prompt = """You are an expert at analyzing code structure and creating visual representations.

Given source code, produce a JSON object describing the code flow as a graph with nodes and links.

Rules:
1. Each function, class, loop, conditional, or important operation should be a node.
2. Links show the flow/dependency between nodes.
3. Group nodes by type for visual clarity.
4. Keep it concise — max 15-20 nodes.

Respond with ONLY a JSON object in this exact format (no markdown, no code fences, JUST the raw JSON):

{
  "nodes": [
    {"id": "node1", "label": "Short Label", "type": "function|class|condition|loop|io|start|end|operation", "detail": "One line description"},
    ...
  ],
  "links": [
    {"source": "node1", "target": "node2", "label": "optional edge label"},
    ...
  ],
  "summary": [
    "Bullet point 1 explaining the flow",
    "Bullet point 2",
    "Bullet point 3"
  ]
}

Node types: start, end, function, class, condition, loop, io, operation.
RESPOND WITH ONLY THE JSON OBJECT."""

    user_prompt = f"""Analyze this {request.language} code and generate the flow graph JSON:

{request.code}"""

    viz_text = call_groq(system_prompt, user_prompt)
    graph_data = None
    try:
        graph_data = json.loads(viz_text.strip())
    except json.JSONDecodeError:
        json_match = re.search(r"```(?:json)?\s*\n?([\s\S]*?)```", viz_text)
        if json_match:
            try:
                graph_data = json.loads(json_match.group(1).strip())
            except json.JSONDecodeError:
                pass
        if not graph_data:
            json_match = re.search(r"\{[\s\S]*\}", viz_text)
            if json_match:
                try:
                    graph_data = json.loads(json_match.group(0))
                except json.JSONDecodeError:
                    pass

    if not graph_data:
        graph_data = {
            "nodes": [
                {"id": "start", "label": "Start", "type": "start", "detail": "Program entry"},
                {"id": "code", "label": "Code Block", "type": "operation", "detail": "Main code"},
                {"id": "end", "label": "End", "type": "end", "detail": "Program exit"}
            ],
            "links": [
                {"source": "start", "target": "code"},
                {"source": "code", "target": "end"}
            ],
            "summary": ["Could not parse code structure. Please try again."]
        }

    return JSONResponse(content={"graph": graph_data, "language": request.language})


@app.post("/api/explain")
async def explain_code(request: CodeExplainRequest):
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    system_prompt = """You are a world-class programming instructor who explains code clearly and thoroughly.

Given source code, provide a comprehensive explanation. Format your response like this:

## 🎯 Purpose
One paragraph explaining what this code does at a high level.

## 📖 Line-by-Line Breakdown

### `function_name()` or Section Title
Explain what this section does, why it's written this way, and any important concepts.

## 🧩 Key Concepts Used
List the programming concepts, patterns, or techniques used.

## ⚙️ How It All Fits Together
A short paragraph explaining the overall flow.

## 💡 Tips for Beginners
2-3 helpful tips for someone learning from this code.

IMPORTANT: Use proper markdown formatting."""

    user_prompt = f"""Explain the following {request.language} code in detail:

```{request.language}
{request.code}
```"""

    explanation = call_groq(system_prompt, user_prompt)

    return JSONResponse(content={
        "explanation": explanation,
        "language": request.language
    })


@app.post("/api/convert")
async def convert_code(request: CodeConvertRequest):
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    system_prompt = f"""You are an expert polyglot programmer who converts code between programming languages.

CRITICAL: The user has explicitly specified that the source code is written in {request.language}. You MUST treat it as {request.language} code regardless of what it looks like. Do NOT try to auto-detect the language.

Convert the given {request.language} code to {request.target_language}. Follow these rules:
1. Treat the input as {request.language} code — this is non-negotiable.
2. Preserve the original logic and functionality exactly.
3. Use idiomatic patterns and conventions of the target language ({request.target_language}).
4. Adapt naming conventions (e.g. snake_case for Python, camelCase for JavaScript/Java).
5. Use the target language's standard library and built-in features where possible.
6. Add appropriate type annotations if the target language supports/requires them.
7. Maintain the same level of error handling, adapting to the target language's patterns.

Format your response EXACTLY like this:

## 🔄 Converted Code ({request.language} → {request.target_language})

```{request.target_language}
(the complete converted code here)
```

## 📝 Conversion Notes
List each significant change as a bullet point:
- **Change title**: explanation of what changed and why

## ⚠️ Important Differences
List any behavioral differences between the two language implementations:
- Differences in standard library, data types, error handling, etc.

## 💡 Tips for {request.target_language}
Brief tips about the target language conventions used in the converted code.

IMPORTANT: Put the complete converted code in a SINGLE fenced code block with the correct language tag."""

    user_prompt = f"""The following code is written in {request.language}. Convert it to {request.target_language}.

Source language: {request.language}
Target language: {request.target_language}

```{request.language}
{request.code}
```"""

    convert_text = call_groq(system_prompt, user_prompt)
    code_match = re.search(r"```(?:\w+)?\n(.*?)```", convert_text, re.DOTALL)
    converted_code = code_match.group(1).strip() if code_match else ""

    return JSONResponse(content={
        "convert": convert_text,
        "converted_code": converted_code,
        "source_language": request.language,
        "target_language": request.target_language
    })


# ──────────────────────────────────────────────
# NEW ENDPOINTS
# ──────────────────────────────────────────────

@app.post("/api/generate-tests")
async def generate_tests(request: CodeTestRequest):
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    framework_map = {
        "python": "pytest",
        "javascript": "Jest",
        "typescript": "Jest",
        "java": "JUnit 5",
        "cpp": "Google Test",
        "csharp": "xUnit",
        "go": "Go testing",
        "rust": "Rust built-in tests",
        "ruby": "RSpec",
        "php": "PHPUnit",
        "swift": "XCTest",
        "kotlin": "JUnit 5",
    }
    framework = framework_map.get(request.language, "appropriate testing framework")

    system_prompt = f"""You are an expert test engineer. Generate comprehensive test cases using {framework}.

For each function/class in the code, generate:
1. **Unit Tests** — Test normal/expected behavior
2. **Edge Cases** — Test boundary conditions, empty inputs, large inputs
3. **Failure Scenarios** — Test expected error handling

Format your response as:

## 🧪 Generated Test Cases

### Unit Tests

```{request.language}
(complete runnable test code)
```

### Edge Case Tests

```{request.language}
(edge case tests)
```

### Failure Scenario Tests

```{request.language}
(failure/error tests)
```

## 📋 Test Summary
- Total test cases: N
- Coverage areas: list what's covered
- Recommendations: any additional tests to consider

IMPORTANT: Generate COMPLETE, RUNNABLE test code using {framework}."""

    user_prompt = f"""Generate tests for the following {request.language} code:

```{request.language}
{request.code}
```"""

    tests = call_groq(system_prompt, user_prompt)
    return JSONResponse(content={"tests": tests, "language": request.language, "framework": framework})


@app.post("/api/debug")
async def debug_code(request: CodeDebugRequest):
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    system_prompt = """You are an expert debugger. Given code and an error message, provide a comprehensive debug analysis.

Format your response as:

## 🐞 Error Analysis

### What Went Wrong
Clear explanation of the error in simple terms.

### Root Cause
Technical explanation of why this error occurs.

### Where in the Code
Point to the specific line(s) causing the issue.

## 🔧 Fix

### Corrected Code
```language
(complete corrected code)
```

### What Changed
Bullet points explaining each fix.

## 🛡️ Prevention Tips
How to prevent similar errors in the future.

IMPORTANT: Provide complete corrected code, not just snippets."""

    user_prompt = f"""Debug the following {request.language} code.

Code:
```{request.language}
{request.code}
```

Error Message:
```
{request.error_message}
```"""

    debug_result = call_groq(system_prompt, user_prompt)
    return JSONResponse(content={"debug": debug_result, "language": request.language})


@app.post("/api/metrics")
async def code_metrics(request: CodeMetricsRequest):
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    system_prompt = """You are a code analysis expert. Analyze the given code and return metrics as JSON.

Respond with ONLY a JSON object (no markdown, no code fences):
{
  "complexity": "O(n) or O(n²) etc — estimated time complexity",
  "risk_score": 5,
  "security_issues": 2,
  "code_quality": "Good/Fair/Poor",
  "maintainability": "High/Medium/Low"
}

risk_score should be 1-10 where 1 is very safe and 10 is very risky.
RESPOND WITH ONLY THE JSON OBJECT."""

    user_prompt = f"""Analyze this {request.language} code and return metrics JSON:

{request.code}"""

    metrics_text = call_groq(system_prompt, user_prompt)
    metrics_data = {}
    try:
        metrics_data = json.loads(metrics_text.strip())
    except json.JSONDecodeError:
        json_match = re.search(r"\{[\s\S]*\}", metrics_text)
        if json_match:
            try:
                metrics_data = json.loads(json_match.group(0))
            except json.JSONDecodeError:
                pass
    if not metrics_data:
        metrics_data = {"complexity": "N/A", "risk_score": 5, "security_issues": 0, "code_quality": "Fair", "maintainability": "Medium"}

    return JSONResponse(content=metrics_data)


@app.post("/api/chat")
async def chat_with_ai(request: ChatRequest):
    system_prompt = """You are the AI assistant for **Code Review Sage**, an AI-Powered Code Intelligence Platform.

ABOUT THIS PLATFORM (Code Review Sage):
- Built with React (Vite) frontend and FastAPI + Groq AI backend
- Features: Code Review with quality scoring, Code Rewrite with optimization focus (performance/security/readability/memory/scalability), 
  AI Test Generator (pytest/Jest/JUnit), Code Visualization (D3.js flow graphs), Code Explanation, Debug Mode (paste code + error → AI fix),
  Data Structure Visualization (linked lists, trees), Before/After Compare view, Session History, and this AI Chat.
- The platform analyzes code for bugs, security vulnerabilities, performance issues, and best practices
- Supports Python, JavaScript, Java, C, C++, C#, Go, Rust, TypeScript, PHP, Ruby, Swift, Kotlin

WHEN ANSWERING:
- If the user asks about "this website", "this platform", "what is this", etc. → answer about Code Review Sage and its features
- If the user asks about their code → analyze and help with the code they pasted
- If the user asks general programming questions → answer helpfully
- Be concise, friendly, and use markdown formatting
- Provide code examples when relevant
- Do NOT say "this is not a website" or "this conversation is about code" — you ARE part of Code Review Sage"""

    # Build conversation history
    messages = [{"role": "system", "content": system_prompt}]

    if request.code:
        messages.append({
            "role": "system",
            "content": f"The user is working with this {request.language} code:\n```{request.language}\n{request.code}\n```"
        })

    for msg in request.history[-10:]:  # Keep last 10 messages for context
        role = "assistant" if msg.get("role") == "ai" else "user"
        messages.append({"role": role, "content": msg["content"]})

    messages.append({"role": "user", "content": request.message})

    def _chat_request(ai_client):
        chat_completion = ai_client.chat.completions.create(
            messages=messages,
            model=MODEL_NAME,
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS,
            top_p=TOP_P,
        )
        return chat_completion.choices[0].message.content

    try:
        response = _chat_request(client)
    except Exception as e:
        error_str = str(e)
        if ("429" in error_str or "rate_limit" in error_str.lower()) and fallback_client:
            print(f"⚠️ Chat: Primary key rate-limited, switching to fallback...")
            try:
                response = _chat_request(fallback_client)
            except Exception as e2:
                raise HTTPException(status_code=500, detail=f"API error (both keys failed): {str(e2)}")
        else:
            raise HTTPException(status_code=500, detail=f"API error: {error_str}")

    return JSONResponse(content={"response": response})


@app.post("/api/visualize-ds")
async def visualize_data_structure(request: DSVisualizeRequest):
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    system_prompt = """You are an expert at analyzing code that creates data structures.

Analyze the code and extract the data structure being created. Return a JSON object describing it.

For linked lists, return:
{
  "structure": {
    "type": "linked_list",
    "nodes": [1, 2, 3, 4, 5],
    "description": "## Linked List Analysis\\n- Length: 5 nodes\\n- Direction: singly-linked\\n- Description of what the list represents"
  }
}

For binary trees, return:
{
  "structure": {
    "type": "binary_tree",
    "root": {"val": 1, "left": {"val": 2, "left": null, "right": null}, "right": {"val": 3, "left": null, "right": null}},
    "nodes": [1, 2, 3],
    "description": "## Binary Tree Analysis\\n- Depth: 2\\n- Nodes: 3\\n- Type: balanced/unbalanced"
  }
}

For arrays/stacks/queues, return:
{
  "structure": {
    "type": "array",
    "nodes": [1, 2, 3, 4, 5],
    "description": "## Array Analysis\\n- description"
  }
}

If no clear data structure is found, infer one from the code logic.
RESPOND WITH ONLY THE JSON OBJECT, no markdown, no code fences."""

    user_prompt = f"""Analyze this {request.language} code and extract the data structure:

{request.code}"""

    ds_text = call_groq(system_prompt, user_prompt)
    ds_data = None
    try:
        ds_data = json.loads(ds_text.strip())
    except json.JSONDecodeError:
        json_match = re.search(r"\{[\s\S]*\}", ds_text)
        if json_match:
            try:
                ds_data = json.loads(json_match.group(0))
            except json.JSONDecodeError:
                pass
    if not ds_data:
        ds_data = {
            "structure": {
                "type": "linked_list",
                "nodes": [1, 2, 3],
                "description": "Could not parse data structure from the code. Try pasting code that explicitly creates a linked list, tree, or other data structure."
            }
        }

    return JSONResponse(content=ds_data)


# ──────────────────────────────────────────────
# Auth Endpoints
# ──────────────────────────────────────────────

@app.post("/api/auth/register")
async def register(request: RegisterRequest):
    if not request.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    if not request.email.strip() or "@" not in request.email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    user = create_user(request.name.strip(), request.email.strip(), request.password)
    if not user:
        raise HTTPException(status_code=409, detail="Email already registered")

    token = create_session(user["id"])
    return JSONResponse(content={"user": user, "token": token})


@app.post("/api/auth/login")
async def login(request: LoginRequest):
    if not request.email.strip() or not request.password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    user = authenticate_user(request.email.strip(), request.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_session(user["id"])
    return JSONResponse(content={"user": user, "token": token})


@app.get("/api/auth/me")
async def get_me(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return JSONResponse(content={"user": user})


@app.post("/api/auth/logout")
async def logout(request: Request):
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        delete_session(auth_header[7:])
    return JSONResponse(content={"ok": True})


# ──────────────────────────────────────────────
# History Endpoints
# ──────────────────────────────────────────────

@app.post("/api/history/save")
async def save_history_endpoint(req: HistorySaveRequest, request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Login required to save history")

    entry_id = save_history(user["id"], req.action, req.language, req.code, req.result_preview)
    return JSONResponse(content={"id": entry_id, "ok": True})


@app.get("/api/history")
async def get_history(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Login required")

    history = get_user_history(user["id"])
    return JSONResponse(content={"history": history})


@app.delete("/api/history/{item_id}")
async def delete_history(item_id: int, request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Login required")

    deleted = delete_history_item(user["id"], item_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="History item not found")
    return JSONResponse(content={"ok": True})


@app.delete("/api/history")
async def clear_history(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Login required")

    clear_user_history(user["id"])
    return JSONResponse(content={"ok": True})


# ──────────────────────────────────────────────
# Snippets & Folders API
# ──────────────────────────────────────────────

@app.get("/api/folders")
async def list_folders(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Login required")
    folders = get_user_folders(user["id"])
    return JSONResponse(content={"folders": folders})


@app.post("/api/folders")
async def add_folder(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Login required")
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name required")
    folder_id = create_folder(user["id"], name)
    return JSONResponse(content={"id": folder_id, "ok": True})


@app.delete("/api/folders/{folder_id}")
async def remove_folder(folder_id: int, request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Login required")
    deleted = db_delete_folder(user["id"], folder_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Folder not found")
    return JSONResponse(content={"ok": True})


@app.get("/api/snippets")
async def list_snippets(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Login required")
    snippets = get_user_snippets(user["id"])
    return JSONResponse(content={"snippets": snippets})


@app.post("/api/snippets")
async def add_snippet(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Login required")
    body = await request.json()
    title = body.get("title", "").strip()
    code_text = body.get("code", "").strip()
    lang = body.get("language", "python")
    notes = body.get("notes", "")
    folder_id = body.get("folder_id")
    if not title or not code_text:
        raise HTTPException(status_code=400, detail="Title and code required")
    snippet_id = save_snippet(user["id"], title, code_text, lang, notes, folder_id)
    return JSONResponse(content={"id": snippet_id, "ok": True})


@app.delete("/api/snippets/{snippet_id}")
async def remove_snippet(snippet_id: int, request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Login required")
    deleted = db_delete_snippet(user["id"], snippet_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Snippet not found")
    return JSONResponse(content={"ok": True})


@app.post("/api/pattern")
async def identify_pattern(request: CodeReviewRequest):
    """Identify DSA patterns in a code solution."""
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    system_prompt = """You are an expert DSA (Data Structures & Algorithms) coach and competitive programming mentor.
Analyze the given code solution and identify the algorithmic patterns used.

Format your response EXACTLY in this markdown structure:

## 🧬 Pattern Identified
**Primary Pattern**: [Name of the pattern, e.g., Sliding Window, Two Pointers, DFS, Dynamic Programming, Greedy, etc.]
**Secondary Pattern**: [If applicable, e.g., Hashing, Binary Search]

## ⏱️ Complexity Analysis
- **Time Complexity**: O(?) — explain why
- **Space Complexity**: O(?) — explain why

## 🚀 Better Approach
If there's a more optimal approach:
- **Pattern**: [Better pattern to use]
- **Time Complexity**: O(?)
- **Space Complexity**: O(?)
- **How it works**: Brief explanation
- **Code sketch**: Short pseudocode or code snippet

If the current approach is already optimal, say "✅ This is already the optimal approach."

## 📚 Related Problems
List 3-5 similar problems that use the same pattern:
1. **Problem Name** — Brief description (Difficulty)
2. etc.

## 💡 Key Takeaway
One or two sentences summarizing when to use this pattern.

Be concise, practical, and helpful for a student learning DSA."""

    user_prompt = f"""Analyze this {request.language} code solution and identify the DSA patterns:

```{request.language}
{request.code}
```"""

    result = call_groq(system_prompt, user_prompt)
    return JSONResponse(content={"pattern": result, "language": request.language})


@app.post("/api/practice")
async def generate_practice(request: Request):
    """Generate practice problems by topic and difficulty."""
    body = await request.json()
    topic = body.get("topic", "arrays")
    difficulty = body.get("difficulty", "medium")
    language = body.get("language", "python")

    system_prompt = f"""You are a competitive programming coach. Generate a practice problem.

Format your response EXACTLY in this markdown structure:

## 📋 Problem: [Creative Problem Title]
**Difficulty**: {difficulty.upper()}
**Topic**: {topic}
**Pattern**: [The DSA pattern needed]

### Description
Write a clear problem statement with context.

### Constraints
- List key constraints (input ranges, time limits, etc.)

### Examples
**Example 1:**
```
Input: ...
Output: ...
Explanation: ...
```

**Example 2:**
```
Input: ...
Output: ...
```

### 💡 Hints
<details>
<summary>Hint 1</summary>
[First hint - approach direction]
</details>

<details>
<summary>Hint 2</summary>
[Second hint - more specific]
</details>

<details>
<summary>Hint 3</summary>
[Third hint - nearly gives it away]
</details>

### ✅ Solution
<details>
<summary>Click to reveal solution</summary>

```{language}
[Complete, working solution code]
```

**Explanation:**
[Brief explanation of the approach]

**Time Complexity**: O(?)
**Space Complexity**: O(?)
</details>

Make the problem interesting, practical, and well-structured. The solution MUST be correct and complete."""

    user_prompt = f"Generate a {difficulty} {topic} problem solvable in {language}."

    result = call_groq(system_prompt, user_prompt)
    return JSONResponse(content={"problem": result, "topic": topic, "difficulty": difficulty})
# ──────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    print(f"\n🚀 AI Code Review Sage")
    print(f"   Backend: http://localhost:{port}")
    print(f"   Frontend: http://localhost:5173\n")
    uvicorn.run(app, host="0.0.0.0", port=port)
