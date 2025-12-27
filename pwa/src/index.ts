import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';

interface CloudflareEnv {
    SMA_READER_ACCESS?: string;
}

// Type declaration for the static manifest (optional in dev)
declare global {
    const __STATIC_CONTENT_MANIFEST: Record<string, string> | undefined;
}

const app = new Hono<{ Bindings: CloudflareEnv }>();

// Central API base URL for upstream SMA reader
const API_BASE = 'https://sma-data-pwa.everyday-apps.org';

// Helper function to verify PWA access token
function verifyPwaToken(c: any): boolean {
    const authHeader = c.req.header('Authorization');
    const secret = c.env.SMA_READER_ACCESS;

    if (!secret) {
        // If no secret is configured, allow access (for development)
        return true;
    }

    const providedToken = authHeader?.replace('Bearer ', '');
    return providedToken === secret;
}

// Authentication middleware for PWA access
app.use('/', async (c, next) => {
    // Allow these paths without authentication
    const publicPaths = ['/auth.html', '/auth-check'];

    if (publicPaths.some(path => c.req.path === path)) {
        return next();
    }

    if (!verifyPwaToken(c)) {
        // Return 401 for API requests, redirect to auth page for HTML requests
        const accept = c.req.header('Accept') || '';
        if (accept.includes('application/json')) {
            return c.json(
                { error: 'Unauthorized', message: 'Invalid or missing PWA access token' },
                { status: 401 }
            );
        }
        // For HTML requests, serve the auth page
        return c.html(getAuthPageHTML(), 401);
    }

    return next();
});

// Auth check endpoint (returns 200 if authenticated)
app.get('/auth-check', (c) => {
    if (verifyPwaToken(c)) {
        return c.json({ authenticated: true });
    }
    return c.json({ authenticated: false }, { status: 401 });
});

// Auth page endpoint
app.get('/auth.html', (c) => {
    return c.html(getAuthPageHTML());
});

// Serve static files from the public directory
// Use __STATIC_CONTENT_MANIFEST if available, otherwise serve from filesystem
try {
    const manifest = typeof __STATIC_CONTENT_MANIFEST !== 'undefined' ? __STATIC_CONTENT_MANIFEST : {};
    app.use('/*', serveStatic({ root: './', manifest: manifest as any }));
} catch (e) {
    // Fallback: If manifest is not available (development mode), don't use serveStatic
    console.log('Static manifest not available, using development mode');
}

// Fallback routes for index.html and other common files
app.get('/', (c) => {
    return c.html(getMainPageHTML());
});

app.get('/index.html', (c) => {
    return c.html(getMainPageHTML());
});

// Helper to forward authorization header to API
function getAuthHeaders(c: any): HeadersInit {
    const headers: HeadersInit = {};
    const authHeader = c.req.header('Authorization');
    if (authHeader) {
        headers['Authorization'] = authHeader;
    }
    return headers;
}

// API proxy endpoints for the solar data
app.get('/api/current', async (c) => {
    try {
        const response = await fetch(`${API_BASE}/api/current`, {
            headers: getAuthHeaders(c)
        });
        const data = await response.json();
        return c.json(data, response.status as any);
    } catch (error) {
        return c.json({ error: 'Failed to fetch current data' }, 500 as any);
    }
});

app.get('/api/current-and-max', async (c) => {
    try {
        const response = await fetch(`${API_BASE}/api/current-and-max`, {
            headers: getAuthHeaders(c)
        });
        const data = await response.json();
        return c.json(data, response.status as any);
    } catch (error) {
        return c.json({ error: 'Failed to fetch current and max data' }, 500 as any);
    }
});

app.get('/api/today', async (c) => {
    try {
        const response = await fetch(`${API_BASE}/api/today`, {
            headers: getAuthHeaders(c)
        });
        const data = await response.json();
        return c.json(data, response.status as any);
    } catch (error) {
        return c.json({ error: 'Failed to fetch today\'s data' }, 500 as any);
    }
});

// Authentication page HTML
function getAuthPageHTML(): string {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Solar Meter - Authentication</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .auth-container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            padding: 40px;
            max-width: 400px;
            width: 100%;
        }

        .auth-header {
            text-align: center;
            margin-bottom: 30px;
        }

        .auth-icon {
            font-size: 3em;
            margin-bottom: 15px;
        }

        h1 {
            color: #667eea;
            font-size: 1.8em;
            margin-bottom: 10px;
        }

        .auth-subtitle {
            color: #666;
            font-size: 0.9em;
        }

        .form-group {
            margin-bottom: 20px;
        }

        label {
            display: block;
            color: #333;
            font-weight: 500;
            margin-bottom: 8px;
        }

        input {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 1em;
            transition: border-color 0.3s;
        }

        input:focus {
            outline: none;
            border-color: #667eea;
        }

        button {
            width: 100%;
            padding: 12px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 1em;
            font-weight: bold;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
        }

        button:active {
            transform: translateY(0);
        }

        .error {
            color: #d32f2f;
            font-size: 0.9em;
            margin-top: 10px;
            display: none;
        }

        .error.show {
            display: block;
        }

        .loading {
            display: none;
        }

        .loading.show {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255,255,255,0.3);
            border-top: 2px solid white;
            border-radius: 50%;
            animation: spin 0.6s linear infinite;
            vertical-align: middle;
            margin-right: 8px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="auth-container">
        <div class="auth-header">
            <div class="auth-icon">☀️</div>
            <h1>Solar Meter</h1>
            <p class="auth-subtitle">Enter your access token</p>
        </div>

        <form id="authForm">
            <div class="form-group">
                <label for="token">Access Token</label>
                <input 
                    type="password" 
                    id="token" 
                    placeholder="Enter your access token"
                    required
                    autocomplete="off"
                />
            </div>
            <button type="submit">
                <span class="loading" id="loading"></span>
                Sign In
            </button>
            <div class="error" id="error"></div>
        </form>
    </div>

    <script>
        const form = document.getElementById('authForm');
        const tokenInput = document.getElementById('token');
        const errorDiv = document.getElementById('error');
        const loadingSpan = document.getElementById('loading');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorDiv.classList.remove('show');
            loadingSpan.classList.add('show');

            const token = tokenInput.value.trim();

            try {
                const response = await fetch(window.location.pathname, {
                    headers: {
                        'Authorization': 'Bearer ' + token
                    }
                });

                if (response.ok) {
                    // Store token in sessionStorage
                    sessionStorage.setItem('pwaToken', token);
                    localStorage.setItem('pwaToken', token);
                    // Reload to access the PWA
                    window.location.href = '/';
                } else {
                    errorDiv.textContent = 'Invalid access token';
                    errorDiv.classList.add('show');
                }
            } catch (error) {
                errorDiv.textContent = 'Error: ' + error.message;
                errorDiv.classList.add('show');
            } finally {
                loadingSpan.classList.remove('show');
            }
        });

        // Check if already authenticated
        (async () => {
            const token = sessionStorage.getItem('pwaToken') || localStorage.getItem('pwaToken');
            if (token) {
                const response = await fetch('/auth-check', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (response.ok) {
                    window.location.href = '/';
                }
            }
        })();
    </script>
</body>
</html>`;
    return html;
}

// Main dashboard page HTML (embedded version for development)
function getMainPageHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#1a1a1a">
    <meta name="description" content="Solar meter PWA - Real-time solar power monitoring">
    <title>Solar Meter Monitor</title>
    <link rel="manifest" href="/manifest.json">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="apple-touch-icon" href="/icon-192.png">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            color: #333;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        header {
            background: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        h1 {
            font-size: 2em;
            color: #667eea;
            margin-bottom: 10px;
        }
        .timestamp {
            color: #666;
            font-size: 0.9em;
        }
        .logout-button {
            background: #ff6b6b;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.9em;
            font-weight: bold;
        }
        .loading {
            text-align: center;
            padding: 40px;
            color: #667eea;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div>
                <h1>☀️ Solar Meter Monitor</h1>
                <p class="timestamp">Loading...</p>
            </div>
            <button class="logout-button">Logout</button>
        </header>
        <div class="loading">
            <p>Loading dashboard from /index.html...</p>
            <p style="margin-top: 20px; font-size: 0.9em; color: #999;">
                For the full dashboard, ensure /pwa/public/index.html is properly served.
            </p>
        </div>
    </div>
    <script>
        document.querySelector('.logout-button').addEventListener('click', () => {
            sessionStorage.removeItem('pwaToken');
            localStorage.removeItem('pwaToken');
            window.location.href = '/auth.html';
        });
    </script>
</body>
</html>`;
}

export default app;
