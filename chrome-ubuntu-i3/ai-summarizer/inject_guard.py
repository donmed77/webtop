"""
mitmproxy addon that injects Guard AI script into all HTML pages as a sidebar
Run with: mitmdump -s inject_guard.py -p 8080
"""

from mitmproxy import http
import re

GUARD_SCRIPT = """
<script>
(function() {
    if (window.guardLoaded) return;
    window.guardLoaded = true;
    
    // Skip small frames / internal chrome pages
    if (window.innerWidth < 400 || location.protocol === 'chrome:' || location.protocol === 'about:') return;

    const BACKEND = 'http://localhost:8765';
    let sidebar, historyContainer;

    function createUI() {
        if (document.getElementById('guard-sidebar')) {
            sidebar = document.getElementById('guard-sidebar');
            historyContainer = document.getElementById('guard-sidebar-history');
            return;
        }
        
        sidebar = document.createElement('div');
        sidebar.id = 'guard-sidebar';
        sidebar.innerHTML = `
            <div id="guard-sidebar-handle">🛡️</div>
            <div id="guard-sidebar-content">
                <div id="guard-sidebar-header">
                    <span>Guard AI Summarizer</span>
                    <button id="guard-sidebar-close">×</button>
                </div>
                <div id="guard-sidebar-body">
                    <div id="guard-sidebar-history"></div>
                    <div id="guard-sidebar-status" style="display:none">
                        <div class="guard-sidebar-spinner"></div>
                        <span>Analyzing page content...</span>
                    </div>
                </div>
                <div id="guard-sidebar-footer">
                    Powered by Gemma 3 4B
                </div>
            </div>
        `;
        
        const style = document.createElement('style');
        style.id = 'guard-sidebar-style';
        style.textContent = `
            #guard-sidebar {
                position: fixed !important;
                top: 0 !important;
                right: 0 !important;
                width: 320px !important;
                height: 100vh !important;
                z-index: 2147483647 !important;
                background: #0f172a !important;
                color: #f1f5f9 !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                box-shadow: -5px 0 25px rgba(0,0,0,0.5) !important;
                display: flex !important;
                flex-direction: column !important;
                transition: transform 0.3s ease !important;
                border-left: 1px solid rgba(148, 163, 184, 0.1) !important;
                text-align: left !important;
            }
            #guard-sidebar.collapsed {
                transform: translateX(320px) !important;
            }
            #guard-sidebar-handle {
                position: absolute !important;
                left: -40px !important;
                top: 20px !important;
                width: 40px !important;
                height: 40px !important;
                background: #6366f1 !important;
                border-radius: 8px 0 0 8px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                font-size: 20px !important;
                box-shadow: -2px 0 10px rgba(0,0,0,0.3) !important;
            }
            #guard-sidebar-content {
                display: flex !important;
                flex-direction: column !important;
                height: 100% !important;
                width: 100% !important;
            }
            #guard-sidebar-header {
                padding: 16px !important;
                background: rgba(99, 102, 241, 0.1) !important;
                border-bottom: 1px solid rgba(148, 163, 184, 0.1) !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                font-weight: 600 !important;
            }
            #guard-sidebar-close {
                background: none !important;
                border: none !important;
                color: #94a3b8 !important;
                font-size: 24px !important;
                cursor: pointer !important;
                line-height: 1 !important;
            }
            #guard-sidebar-body {
                flex: 1 !important;
                padding: 10px !important;
                overflow-y: auto !important;
                line-height: 1.6 !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 15px !important;
            }
            .guard-summary-item {
                background: rgba(30, 41, 59, 0.5) !important;
                border-radius: 8px !important;
                padding: 15px !important;
                border: 1px solid rgba(148, 163, 184, 0.1) !important;
                font-size: 14px !important;
            }
            .guard-summary-item-header {
                font-size: 11px !important;
                color: #6366f1 !important;
                margin-bottom: 8px !important;
                font-weight: 600 !important;
                text-transform: uppercase !important;
                letter-spacing: 0.05em !important;
                border-bottom: 1px solid rgba(148, 163, 184, 0.05) !important;
                padding-bottom: 4px !important;
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
            }
            #guard-sidebar-status {
                display: flex !important;
                align-items: center !important;
                gap: 12px !important;
                color: #94a3b8 !important;
                padding: 10px !important;
                font-size: 13px !important;
            }
            .guard-sidebar-spinner {
                width: 14px !important;
                height: 14px !important;
                border: 2px solid rgba(99, 102, 241, 0.3) !important;
                border-top-color: #6366f1 !important;
                border-radius: 50% !important;
                animation: guard-spin 0.8s linear infinite !important;
            }
            .guard-summary-content {
                white-space: pre-wrap !important;
                color: #e2e8f0 !important;
            }
            .guard-summary-content b {
                color: #c4b5fd !important;
                font-weight: 600 !important;
            }
            #guard-sidebar-footer {
                padding: 12px !important;
                font-size: 11px !important;
                color: #475569 !important;
                text-align: center !important;
                border-top: 1px solid rgba(148, 163, 184, 0.05) !important;
            }
            @keyframes guard-spin { to { transform: rotate(360deg); } }
            
            body.guard-sidebar-open {
                padding-right: 320px !important;
            }
        `;
        document.head.appendChild(style);
        
        sidebar.querySelector('#guard-sidebar-handle').onclick = toggleSidebar;
        sidebar.querySelector('#guard-sidebar-close').onclick = toggleSidebar;
        
        document.body.appendChild(sidebar);
        document.body.classList.add('guard-sidebar-open');
        
        historyContainer = sidebar.querySelector('#guard-sidebar-history');
        
        // Load history from localStorage
        const savedHistory = localStorage.getItem('guard-history');
        if (savedHistory) {
            historyContainer.innerHTML = savedHistory;
            historyContainer.scrollTop = historyContainer.scrollHeight;
        }

        // Ensure sidebar stays in DOM
        const observer = new MutationObserver(() => {
            if (!document.getElementById('guard-sidebar')) document.body.appendChild(sidebar);
            if (!document.getElementById('guard-sidebar-style')) document.head.appendChild(style);
            if (!document.body.classList.contains('guard-sidebar-open') && !sidebar.classList.contains('collapsed')) {
                document.body.classList.add('guard-sidebar-open');
            }
        });
        observer.observe(document.body, { childList: true });
    }

    function toggleSidebar() {
        sidebar.classList.toggle('collapsed');
        document.body.classList.toggle('guard-sidebar-open');
    }

    function extract() {
        const selectors = ['article', 'main', '[role="main"]', '.content', '#content', '#main', '.post-content', '.entry-content'];
        const exclude = ['nav', 'header', 'footer', 'aside', 'script', 'style', '.ad', '.menu', '#guard-sidebar'];
        let el = null;
        for (const s of selectors) {
            const found = document.querySelector(s);
            if (found && found.innerText.trim().length > 100) { el = found.cloneNode(true); break; }
        }
        if (!el) el = document.body.cloneNode(true);
        exclude.forEach(s => el.querySelectorAll(s).forEach(e => e.remove()));
        let text = (el.innerText || '').replace(/[ \\t\\n\\r\\f\\v]+/g, ' ').trim();
        return { 
            title: document.title, 
            url: location.href, 
            text: 'Title: ' + document.title + '\\n\\nContent:\\n' + text.substring(0, 4000) 
        };
    }

    let lastUrl = '';
    async function summarize(isManual = false) {
        const pageData = extract();
        if (pageData.url === lastUrl && !isManual) return;
        lastUrl = pageData.url;

        if (pageData.text.length < 100) return;

        createUI();
        const status = document.getElementById('guard-sidebar-status');
        if (status) status.style.display = 'flex';

        // Create new item in history
        const item = document.createElement('div');
        item.className = 'guard-summary-item';
        const displayUrl = pageData.url.length > 30 ? pageData.url.substring(0, 30) + '...' : pageData.url;
        item.innerHTML = `
            <div class="guard-summary-item-header">${pageData.title || displayUrl}</div>
            <div class="guard-summary-content">...</div>
        `;
        historyContainer.appendChild(item);
        historyContainer.scrollTop = historyContainer.scrollHeight;
        const output = item.querySelector('.guard-summary-content');

        try {
            const res = await fetch(BACKEND + '/summarize', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({content: pageData.text, url: pageData.url})
            });
            
            if (!res.ok) throw new Error('Backend error');
            
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = '', fullText = '';
            
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                buf += decoder.decode(value, {stream: true});
                const lines = buf.split('\\n');
                buf = lines.pop() || '';
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const d = line.slice(6);
                        if (d === '[DONE]') continue;
                        try {
                            const p = JSON.parse(d);
                            if (p.chunk) { 
                                fullText += p.chunk; 
                                output.innerHTML = fullText.replace(/\\*\\*(.*?)\\*\\*/g, '<b>$1</b>').replace(/\\n/g, '<br>');
                                historyContainer.scrollTop = historyContainer.scrollHeight;
                            }
                        } catch(e) {
                            if (line.indexOf('[DONE]') === -1 && d.length > 0) {
                                fullText += d;
                                output.innerHTML = fullText.replace(/\\*\\*(.*?)\\*\\*/g, '<b>$1</b>').replace(/\\n/g, '<br>');
                                historyContainer.scrollTop = historyContainer.scrollHeight;
                            }
                        }
                    }
                }
            }
        } catch(e) {
            output.innerHTML = '<span style="color:#f87171">⚠️ Error: ' + e.message + '</span>';
        } finally {
            if (status) status.style.display = 'none';
            // Save to localStorage, keep last 10
            const items = historyContainer.querySelectorAll('.guard-summary-item');
            if (items.length > 10) items[0].remove();
            localStorage.setItem('guard-history', historyContainer.innerHTML);
        }
    }

    // SPA Navigation Detection
    let observerUrl = location.href;
    const urlObserver = new MutationObserver(() => {
        if (location.href !== observerUrl) {
            observerUrl = location.href;
            setTimeout(() => summarize(), 1000);
        }
    });
    urlObserver.observe(document.body, { childList: true, subtree: true });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { createUI(); setTimeout(summarize, 500); });
    } else {
        createUI(); setTimeout(summarize, 500);
    }
})();
</script>
"""

class GuardInjector:
    def response(self, flow: http.HTTPFlow) -> None:
        content_type = flow.response.headers.get("content-type", "")
        if "text/html" not in content_type: return
        if flow.request.host in ["localhost", "127.0.0.1"]: return
        try:
            if flow.response.headers.get("content-encoding") == "gzip": flow.response.decode()
            html = flow.response.content.decode("utf-8", errors="ignore")
        except: return

        injected = False
        parts = html.split('<body', 1)
        if len(parts) == 2:
            body_tag_end = parts[1].find('>')
            if body_tag_end != -1:
                html = parts[0] + '<body' + parts[1][:body_tag_end+1] + GUARD_SCRIPT + parts[1][body_tag_end+1:]
                injected = True
        
        if not injected:
            if "<body>" in html: html = html.replace("<body>", "<body>" + GUARD_SCRIPT)
            elif "<html>" in html: html = html.replace("<html>", "<html>" + GUARD_SCRIPT)
            else: html = GUARD_SCRIPT + html
            
        print(f"[*] Injected Guard History Script into {flow.request.url}")
        flow.response.content = html.encode("utf-8")

addons = [GuardInjector()]
