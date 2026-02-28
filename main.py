"""
AI Code Review Sage — FastAPI Backend
All AI endpoints for code review, rewrite, test generation, debugging, metrics, chat, visualization
"""

import os
import re
import json
import uvicorn
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from groq import Groq

# ──────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY not found in .env file")

client = Groq(api_key=GROQ_API_KEY)

MODEL_NAME = "llama-3.3-70b-versatile"
TEMPERATURE = 0.3
MAX_TOKENS = 4096
TOP_P = 0.9

# ──────────────────────────────────────────────
# FastAPI App
# ──────────────────────────────────────────────
app = FastAPI(title="AI Code Review Sage")

# CORS for React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173"],
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
    try:
        chat_completion = client.chat.completions.create(
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"API error: {str(e)}")


# ──────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def serve_home():
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return HTMLResponse(content=index_path.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Run frontend dev server: cd frontend && npm run dev</h1>")


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
    lang_mismatch = re.search(r"appears to be (\w+)", review_text, re.IGNORECASE)
    if lang_mismatch:
        detected = lang_mismatch.group(1).lower()
        lang_map = {"c": "c", "python": "python", "javascript": "javascript", "java": "java", 
                     "ruby": "ruby", "go": "go", "rust": "rust", "typescript": "typescript",
                     "c++": "cpp", "cpp": "cpp", "c#": "csharp", "php": "php", "swift": "swift", "kotlin": "kotlin"}
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

Format your response EXACTLY like this:

## ✨ Rewritten Code

```{request.language}
(the complete rewritten code here)
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

IMPORTANT: Put the complete rewritten code in a SINGLE fenced code block with the correct language tag."""

    user_prompt = f"""Rewrite and optimize the following {request.language} code to production quality.{extra_instructions}

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

    try:
        chat_completion = client.chat.completions.create(
            messages=messages,
            model=MODEL_NAME,
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS,
            top_p=TOP_P,
        )
        response = chat_completion.choices[0].message.content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"API error: {str(e)}")

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
# Run
# ──────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    print(f"\n🚀 AI Code Review Sage")
    print(f"   Backend: http://localhost:{port}")
    print(f"   Frontend: http://localhost:5173\n")
    uvicorn.run(app, host="0.0.0.0", port=port)
