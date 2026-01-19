"""
Guard AI Summarizer - FastAPI Backend
Bridges Chrome extension to local Ollama for real-time page summarization
"""

import asyncio
import httpx
import json
import os
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from typing import AsyncGenerator

app = FastAPI(title="Guard AI Summarizer Backend")

# CORS for Guard AI Sidebar
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Ollama configuration
OLLAMA_URL = "http://host.docker.internal:11434"
MODEL = "gemma3:4b"

# Optimized system prompt for fast, useful summaries
SYSTEM_PROMPT = """You are Guard, a lightning-fast page summarizer. Given webpage content:

1. Identify the CORE PURPOSE in 1 sentence (start with bold **Purpose:**)
2. Extract 3-5 KEY POINTS as bullets (start with **Key Points:**)
3. If applicable, note any ACTIONS the user might take (start with **Actions:**)

Rules:
- Be CONCISE (under 100 words total)
- Skip fluff, focus on substance
- If content is minimal or unclear, say "Minimal content detected"
- Use plain language, avoid jargon
- Never mention being an AI or apologize"""


async def stream_ollama_response(content: str) -> AsyncGenerator[str, None]:
    """Stream response from Ollama API"""
    
    prompt = f"{SYSTEM_PROMPT}\n\n---\n\n{content}"
    
    payload = {
        "model": MODEL,
        "prompt": prompt,
        "stream": True,
        "options": {
            "num_predict": 256,  # Limit response length for speed
            "temperature": 0.3,  # Lower = more focused
            "top_p": 0.9,
            "repeat_penalty": 1.1
        }
    }
    
    print(f"[*] Sending prompt to Ollama at {OLLAMA_URL}...")
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            async with client.stream(
                "POST",
                f"{OLLAMA_URL}/api/generate",
                json=payload
            ) as response:
                print(f"[*] Ollama response status: {response.status_code}")
                async for line in response.aiter_lines():
                    if line:
                        try:
                            data = json.loads(line)
                            if "response" in data:
                                chunk = data["response"]
                                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
                            if data.get("done", False):
                                yield "data: [DONE]\n\n"
                                break
                        except json.JSONDecodeError:
                            continue
        except httpx.ConnectError:
            yield f"data: {json.dumps({'error': 'Cannot connect to Ollama. Is it running?'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"


@app.post("/summarize")
async def summarize(request: Request):
    """Summarize page content with streaming response"""
    try:
        body = await request.json()
        content = body.get("content", "")
        url = body.get("url", "")
        
        if not content or len(content.strip()) < 50:
            async def error_stream():
                yield f"data: {json.dumps({'error': 'Not enough content to summarize'})}\n\n"
            return StreamingResponse(
                error_stream(),
                media_type="text/event-stream"
            )
        
        return StreamingResponse(
            stream_ollama_response(content),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
        
    except Exception as e:
        async def error_stream():
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        return StreamingResponse(
            error_stream(),
            media_type="text/event-stream"
        )


@app.get("/health")
async def health():
    """Health check endpoint"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{OLLAMA_URL}/api/tags")
            ollama_ok = response.status_code == 200
    except:
        ollama_ok = False
    
    return {
        "status": "ok",
        "ollama_connected": ollama_ok,
        "model": MODEL
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)

