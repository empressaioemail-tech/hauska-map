// Standalone HTML sign-in page for WorkOS External Sign-in URI (MCP flow).

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function authStartHref(provider: 'google' | 'microsoft', externalAuthId: string): string {
  const q = new URLSearchParams({ external_auth_id: externalAuthId })
  return `/api/auth/${provider}/start?${q.toString()}`
}

export function renderMcpLoginPage(params: {
  externalAuthId: string
  configured: { google: boolean; microsoft: boolean }
}): string {
  const { externalAuthId, configured } = params
  const anyProvider = configured.google || configured.microsoft
  const googleHref = escapeHtml(authStartHref('google', externalAuthId))
  const microsoftHref = escapeHtml(authStartHref('microsoft', externalAuthId))

  const googleBtn = configured.google
    ? `<a href="${googleHref}" class="btn btn-google">
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Sign in with Google
      </a>`
    : ''

  const microsoftBtn = configured.microsoft
    ? `<a href="${microsoftHref}" class="btn btn-microsoft">
        <svg width="17" height="17" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
        Continue with Microsoft
      </a>`
    : ''

  const notice = !anyProvider
    ? `<p class="notice">Sign-in is not configured on this deploy yet.</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in — Smart Site</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: #0b0e14;
      color: #e9eef5;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    }
    .card {
      width: min(420px, 100%);
      padding: 28px;
      border-radius: 16px;
      background: rgba(17, 21, 28, 0.92);
      border: 0.5px solid rgba(59, 130, 246, 0.28);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
    }
    .eyebrow {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.16em;
      color: #3B82F6;
      margin: 0 0 14px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 22px;
      line-height: 1.25;
      font-weight: 700;
    }
    .lead {
      margin: 0 0 22px;
      font-size: 14px;
      line-height: 1.45;
      color: #c6d0dc;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
    }
    .btn + .btn { margin-top: 10px; }
    .btn-google {
      color: #E3E3E3;
      background: #131314;
      border: 1px solid #5F6368;
    }
    .btn-microsoft {
      color: #11151c;
      background: #ffffff;
      border: none;
    }
    .notice {
      margin: 0;
      font-size: 13px;
      color: #aeb8c4;
      padding: 10px 12px;
      border-radius: 8px;
      border: 0.5px solid rgba(154, 166, 178, 0.3);
      background: rgba(0, 0, 0, 0.2);
    }
  </style>
</head>
<body>
  <main class="card">
    <p class="eyebrow">SMART SITE</p>
    <h1>Sign in to continue</h1>
    <p class="lead">Connect your Smart Site account to authorize AI access.</p>
    ${notice}
    ${googleBtn}
    ${microsoftBtn}
  </main>
</body>
</html>`
}
