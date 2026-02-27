"""
AI Code Review & Rewrite Agent — FastAPI Backend
Powered by Groq (Llama 3.3 70B Versatile)
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
app = FastAPI(title="AI Code Review & Rewrite Agent")

# Mount static files
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# ──────────────────────────────────────────────
# Request / Response Models
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

# ──────────────────────────────────────────────
# Helper: Parse Review Response
# ──────────────────────────────────────────────

def parse_review_response(review_text: str) -> dict:
    """Extract and categorize feedback by severity from LLM output."""
    if not review_text:
        return {"critical": 0, "high": 0, "medium": 0, "low": 0}

    severity_counts = {
        "critical": 0,
        "high": 0,
        "medium": 0,
        "low": 0
    }

    # Split the review text into sections by headings
    for severity in ["critical", "high", "medium", "low"]:
        try:
            # Find the section for this severity level
            pattern = rf"(?:#{1,3}\s*)?(?:🔴|🟠|🟡|🟢)?\s*{severity}\s*(?:Issues?|Priority)?[^\n]*\n([\s\S]*?)(?=(?:#{1,3}\s*)?(?:🔴|🟠|🟡|🟢)?\s*(?:Critical|High|Medium|Low|Summary|💡)|$)"
            match = re.search(pattern, review_text, re.IGNORECASE)
            if match and match.group(1):
                section = match.group(1)
                # Count numbered items (1. 2. 3. etc.)
                numbered = re.findall(r"(?m)^\s*\d+\.\s+", section)
                # Count bold headers that indicate individual issues
                bold_issues = re.findall(r"\*\*[^*]+\*\*", section)
                count = max(len(numbered), len(bold_issues) // 2)  # divide by 2 since each issue has multiple bolds
                if count == 0:
                    bullets = re.findall(r"(?m)^\s*[-*●•]\s+", section)
                    count = len(bullets)
                # Cap at reasonable max
                count = min(count, 20)
                severity_counts[severity] = count
                # If "no .* found" is mentioned, set to 0
                if re.search(r"no\s+\w*\s*(issues?|problems?)\s+found", section, re.IGNORECASE):
                    severity_counts[severity] = 0
        except Exception:
            severity_counts[severity] = 0

    return severity_counts

def call_groq(system_prompt: str, user_prompt: str) -> str:
    """Make a call to the Groq API with the given prompts."""
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
        raise HTTPException(status_code=500, detail=f"Groq API error: {str(e)}")

# ──────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def serve_home():
    """Serve the main tool page."""
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="index.html not found")
    return HTMLResponse(content=index_path.read_text(encoding="utf-8"))


@app.post("/api/review")
async def review_code(request: CodeReviewRequest):
    """Analyze code and return structured review with severity-categorized issues."""
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    focus = ", ".join(request.focus_areas) if request.focus_areas else "bugs, performance, security, best practices"

    system_prompt = """You are an expert AI code reviewer. Provide thorough, well-structured code reviews.

Format your response EXACTLY in this markdown structure:

## 📊 Overall Quality Score
**Score: XX/100** — One sentence overall assessment.

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
- Keep each section clean and well-formatted"""

    user_prompt = f"""Review the following {request.language} code. Focus on: {focus}

```{request.language}
{request.code}
```"""

    review_text = call_groq(system_prompt, user_prompt)

    # Parse severity counts
    severity_counts = parse_review_response(review_text)

    # Extract quality score
    score = 70  # default
    score_match = re.search(r"\*\*Score:\s*(\d+)/100\*\*", review_text)
    if not score_match:
        score_match = re.search(r"(\d+)/100", review_text)
    if score_match:
        score = int(score_match.group(1))

    return JSONResponse(content={
        "review": review_text,
        "quality_score": score,
        "severity_counts": severity_counts,
        "language": request.language
    })


@app.post("/api/rewrite")
async def rewrite_code(request: CodeRewriteRequest):
    """Rewrite and optimize the submitted code."""
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

IMPORTANT: Put the complete rewritten code in a SINGLE fenced code block with the correct language tag. Do not split code across multiple blocks."""

    user_prompt = f"""Rewrite and optimize the following {request.language} code to production quality.{extra_instructions}

```{request.language}
{request.code}
```"""

    rewrite_text = call_groq(system_prompt, user_prompt)

    # Extract just the code block from the response
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
    """Generate a visualization data structure representing the code's flow."""
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

Node types and their meanings:
- "start": entry point
- "end": exit/return point
- "function": function definition
- "class": class definition
- "condition": if/else/switch
- "loop": for/while loop
- "io": file/network/database operation
- "operation": general operation

RESPOND WITH ONLY THE JSON OBJECT. No markdown, no explanation, no code fences. Just the raw JSON."""

    user_prompt = f"""Analyze this {request.language} code and generate the flow graph JSON:

{request.code}"""

    viz_text = call_groq(system_prompt, user_prompt)

    # Try to parse JSON from the response
    graph_data = None
    try:
        # Try direct parse first
        graph_data = json.loads(viz_text.strip())
    except json.JSONDecodeError:
        # Try to extract JSON from markdown code blocks
        json_match = re.search(r"```(?:json)?\s*\n?([\s\S]*?)```", viz_text)
        if json_match:
            try:
                graph_data = json.loads(json_match.group(1).strip())
            except json.JSONDecodeError:
                pass
        if not graph_data:
            # Try to find JSON object pattern
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

    return JSONResponse(content={
        "graph": graph_data,
        "language": request.language
    })


@app.post("/api/explain")
async def explain_code(request: CodeExplainRequest):
    """Explain code in detail, line by line."""
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    system_prompt = """You are a world-class programming instructor who explains code clearly and thoroughly.

Given source code, provide a comprehensive explanation. Format your response like this:

## 🎯 Purpose
One paragraph explaining what this code does at a high level.

## 📖 Line-by-Line Breakdown

Go through the code section by section (you can group related lines). For each section:

### `function_name()` or Section Title
Explain what this section does, why it's written this way, and any important concepts.

Use bullet points for individual line explanations when needed:
- `line of code` — what it does

## 🧩 Key Concepts Used
List the programming concepts, patterns, or techniques used in this code as bullet points with brief explanations.

## ⚙️ How It All Fits Together
A short paragraph explaining the overall flow and how the parts interact.

## 💡 Tips for Beginners
2-3 helpful tips for someone learning from this code.

IMPORTANT: Use proper markdown formatting. Put code references in backticks. Use headers and bullet points."""

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
# Run
# ──────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    print(f"\n🚀 AI Code Review & Rewrite Agent")
    print(f"   Navigate to: http://localhost:{port}\n")
    uvicorn.run(app, host="0.0.0.0", port=port)
