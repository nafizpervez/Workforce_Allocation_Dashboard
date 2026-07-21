function renderLoginPage(errorMessage = '') {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Login — Workforce Allocation Dashboard</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:Inter,system-ui,sans-serif;background:#f8fafc;color:#111827;display:flex;align-items:center;justify-content:center;padding:24px}.card{width:100%;max-width:420px;background:#fff;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 16px 40px rgba(15,23,42,.12);overflow:hidden}.head{padding:28px 30px 18px;border-bottom:1px solid #f1f5f9}.brand{display:flex;align-items:center;gap:12px}.icon{width:42px;height:42px;border-radius:13px;background:#2563eb;color:#fff;display:grid;place-items:center;font-weight:800}h1{margin:0;font-size:19px;line-height:1.2}p{margin:6px 0 0;color:#64748b;font-size:13px}form{padding:24px 30px 30px}label{display:block;font-size:13px;font-weight:700;color:#374151;margin-bottom:8px}input{width:100%;height:44px;border:1px solid #cbd5e1;border-radius:10px;padding:0 12px;font-size:14px;outline:none}input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.15)}button{width:100%;height:44px;margin-top:18px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-size:14px;font-weight:800;cursor:pointer}button:hover{background:#1d4ed8}.error{margin-top:12px;padding:10px 12px;border-radius:10px;background:#fef2f2;color:#b91c1c;font-size:13px;font-weight:700}
  </style>
</head>
<body>
  <div class="card">
    <div class="head"><div class="brand"><div class="icon">▦</div><div><h1>Workforce Allocation Dashboard</h1><p>Password required</p></div></div></div>
    <form method="post" action="/login" autocomplete="off">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autofocus required />
      ${errorMessage ? `<div class="error">${errorMessage}</div>` : ''}
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`;
}

module.exports = { renderLoginPage };
