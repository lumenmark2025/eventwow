# Eventwow Branded Auth Emails + Redirect Setup

This project uses Supabase Auth email links that must resolve back to Eventwow pages.

## Supabase Dashboard Settings

Set these in **Supabase Dashboard -> Authentication -> URL Configuration**:

- `Site URL`: `https://eventwow.co.uk`
- `Redirect URLs`:
- `https://eventwow.co.uk/auth/callback`
- `https://eventwow.co.uk/reset-password`
- `http://localhost:3000/auth/callback`
- `http://localhost:3000/reset-password`
- `http://localhost:5173/auth/callback`
- `http://localhost:5173/reset-password`

Notes:
- `/auth/callback` is used for signup confirmation and magic link sign-in.
- `/reset-password` is used for recovery links and password update UI.

## Template Variables

Use Supabase variables only (no secrets):

- `{{ .ConfirmationURL }}`
- `{{ .Email }}`
- `{{ .SiteURL }}`

`{{ .ConfirmationURL }}` should be the main CTA URL for signup, magic link, and reset flows.

## Confirm Signup Template (HTML)

```html
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;">
            <tr>
              <td style="padding:28px 24px 12px 24px;">
                <h1 style="margin:0 0 8px 0;font-size:24px;line-height:1.2;">Confirm your Eventwow account</h1>
                <p style="margin:0 0 20px 0;font-size:14px;color:#475569;">Finish setup to start managing enquiries, quotes and bookings.</p>
                <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px;">Confirm account</a>
                <p style="margin:16px 0 0 0;font-size:13px;color:#64748b;">If the button doesn’t work, copy and paste this link:</p>
                <p style="margin:6px 0 0 0;word-break:break-all;font-size:12px;color:#0f766e;">{{ .ConfirmationURL }}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px;font-size:12px;color:#94a3b8;">
                Eventwow, United Kingdom<br />
                Need help? hello@eventwow.co.uk
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Magic Link Template (HTML)

```html
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;">
            <tr>
              <td style="padding:28px 24px 12px 24px;">
                <h1 style="margin:0 0 8px 0;font-size:24px;line-height:1.2;">Your secure sign-in link</h1>
                <p style="margin:0 0 20px 0;font-size:14px;color:#475569;">Use this one-time link to sign in to Eventwow.</p>
                <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px;">Sign in to Eventwow</a>
                <p style="margin:16px 0 0 0;font-size:13px;color:#64748b;">If the button doesn’t work, copy and paste this link:</p>
                <p style="margin:6px 0 0 0;word-break:break-all;font-size:12px;color:#0f766e;">{{ .ConfirmationURL }}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px;font-size:12px;color:#94a3b8;">
                If you didn’t request this, you can ignore this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Reset Password Template (HTML)

```html
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;">
            <tr>
              <td style="padding:28px 24px 12px 24px;">
                <h1 style="margin:0 0 8px 0;font-size:24px;line-height:1.2;">Reset your Eventwow password</h1>
                <p style="margin:0 0 20px 0;font-size:14px;color:#475569;">Click below to set a new password securely.</p>
                <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px;">Set new password</a>
                <p style="margin:16px 0 0 0;font-size:13px;color:#64748b;">If the button doesn’t work, copy and paste this link:</p>
                <p style="margin:6px 0 0 0;word-break:break-all;font-size:12px;color:#0f766e;">{{ .ConfirmationURL }}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px;font-size:12px;color:#94a3b8;">
                If you didn’t request this, you can ignore this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Local Verification Checklist

- Request magic link from `/login` and confirm link resolves via `/auth/callback`.
- Request password reset from `/forgot-password` and confirm email link lands on `/reset-password`.
- Confirm role routing from callback:
- admin -> `/admin/dashboard`
- supplier -> supplier start route
- venue_owner -> `/venue`
- fallback -> `/customer`
