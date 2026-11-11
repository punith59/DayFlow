// Google Drive backup/restore. Manual only: nothing here runs unless a button is tapped.
// Uses Google Identity Services (token flow, no server) with the narrow "drive.file" scope,
// so DayFlow can only see the one file it created itself, never the rest of the Drive.
// The access token is kept in memory only and is never written to storage or to backups.

const GIS_URL = "https://accounts.google.com/gsi/client";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FILE_NAME = "DayFlow backup.json";
const CLIENT_ID_RE = /^\d+-[A-Za-z0-9_]+\.apps\.googleusercontent\.com$/;

let gisPromise = null;
let token = null; // { value, expires }

export function isValidClientId(id) {
  return CLIENT_ID_RE.test(String(id || "").trim());
}

export function loadGis() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisPromise = null; s.remove(); reject(new Error("Couldn't reach Google. Check your connection and try again.")); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

// Must be called straight from a tap (the sign-in popup is blocked otherwise), so call loadGis() earlier.
export function getToken(clientId) {
  if (token && token.expires > Date.now() + 60000) return Promise.resolve(token.value);
  return new Promise((resolve, reject) => {
    if (!(window.google && window.google.accounts && window.google.accounts.oauth2)) {
      reject(new Error("Google sign-in isn't loaded yet. Wait a moment and try again."));
      return;
    }
    let client;
    try {
      client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (resp) => {
          if (resp && resp.access_token) {
            token = { value: resp.access_token, expires: Date.now() + (Number(resp.expires_in) || 3600) * 1000 };
            resolve(token.value);
          } else {
            reject(new Error(resp && resp.error === "access_denied" ? "Sign-in was cancelled." : "Google sign-in didn't complete."));
          }
        },
        error_callback: (err) => {
          const t = err && err.type;
          reject(new Error(t === "popup_closed" ? "Sign-in was cancelled." : t === "popup_failed_to_open" ? "The sign-in window was blocked. Allow pop-ups for this site and try again." : "Google sign-in didn't complete."));
        },
      });
      client.requestAccessToken();
    } catch (e) {
      reject(new Error("Google sign-in couldn't start. Check the client ID."));
    }
  });
}

export function forgetToken() {
  const t = token;
  token = null;
  try { if (t && window.google && window.google.accounts) window.google.accounts.oauth2.revoke(t.value, () => {}); } catch (e) { /* ignore */ }
}

async function api(url, accessToken, options = {}) {
  let res;
  try {
    res = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` } });
  } catch (e) {
    throw new Error("Couldn't reach Google Drive. Check your connection.");
  }
  if (res.ok) return res;
  let msg = "";
  try { msg = (await res.json()).error.message || ""; } catch (e) { /* ignore */ }
  if (res.status === 401) { token = null; throw new Error("Google sign-in expired. Tap the button again."); }
  if (res.status === 403 && /not been used|disabled|accessNotConfigured/i.test(msg)) throw new Error("The Google Drive API isn't switched on for your Google Cloud project (see the setup steps).");
  if (res.status === 403 && /quota|storage/i.test(msg)) throw new Error("Your Google Drive is out of space.");
  throw new Error(`Google Drive said no (${res.status}).${msg ? " " + msg : ""}`);
}

// Newest backup file DayFlow created in this Google account, or null.
export async function findBackup(accessToken) {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const res = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime%20desc&pageSize=1&fields=files(id,name,modifiedTime,size)`, accessToken);
  const body = await res.json();
  return (body.files && body.files[0]) || null;
}

// Writes the JSON into the existing backup file (Drive keeps earlier versions), or creates it the first time.
export async function uploadBackup(accessToken, json) {
  const existing = await findBackup(accessToken);
  if (existing) {
    const res = await api(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media&fields=id,modifiedTime`, accessToken, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: json,
    });
    return res.json();
  }
  const boundary = "dayflow" + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name: FILE_NAME, mimeType: "application/json" });
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`;
  const res = await api("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime", accessToken, {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  return res.json();
}

export async function downloadBackup(accessToken, fileId) {
  const res = await api(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, accessToken);
  return res.text();
}
