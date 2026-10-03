/** Every interpolated value is attacker-controlled (client_name and
 * redirect_uri come from an anonymous /register call): escape all of it. */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderConsentPage(input: {
    requestId: string;
    csrf: string;
    clientName: string;
    redirectUri: string;
}): string {
    const name = escapeHtml(input.clientName);
    const redirect = escapeHtml(input.redirectUri);
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Allow access to ChartDB?</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 30rem; margin: 4rem auto; padding: 0 1rem; color: #1f2328; background: #fff; }
  h1 { font-size: 1.3rem; }
  code { background: #f3f4f6; padding: .1rem .3rem; border-radius: 4px; word-break: break-all; }
  .warn { background: #fff8e1; border: 1px solid #f0d58c; padding: .75rem; border-radius: 6px; }
  button { font-size: 1rem; padding: .5rem 1.2rem; margin-right: .5rem; border-radius: 6px; border: 1px solid #ccc; cursor: pointer; }
  .approve { background: #1f6feb; color: #fff; border-color: #1f6feb; }
</style>
</head>
<body>
<h1>Allow <strong>${name}</strong> to access ChartDB?</h1>
<p>It will be able to read every diagram and create or change tables in them, as you.</p>
<p class="warn">Sign-in results go to a program on <strong>this computer</strong> at <code>${redirect}</code>.
Only approve if you just started this from Claude Code or another MCP client you trust.</p>
<form method="post" action="/oauth/consent">
  <input type="hidden" name="request_id" value="${escapeHtml(input.requestId)}">
  <input type="hidden" name="csrf" value="${escapeHtml(input.csrf)}">
  <button class="approve" type="submit" name="decision" value="approve">Approve</button>
  <button type="submit" name="decision" value="deny">Deny</button>
</form>
</body>
</html>`;
}
