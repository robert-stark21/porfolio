<?php
/* =========================================================
   PORTFOLIO API (PHP, for shared hosting)
   Same requests and files as server.js, so the dashboard works the
   same on your computer (node server.js) and on a PHP host:
     data/content.json   the content database
     assets/projects.js  rebuilt from it on every save
     images/, audio/     uploads
   Needs PHP 7.4+ and write access to data/, assets/, images/, audio/.
   ========================================================= */
declare(strict_types=1);

$ROOT = dirname(__DIR__);
$DATA = "$ROOT/data";
$DB = "$DATA/content.json";
$AUTH = "$DATA/auth.php";   // starts with an exit line, so the web server never shows it
$BACKUPS = "$DATA/backups";
$PROJECTS_JS = "$ROOT/assets/projects.js";
const KEEP_BACKUPS = 20;
const MAX_UPLOAD = 60 * 1024 * 1024;
const UPLOAD_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'mp3', 'm4a', 'ogg', 'wav', 'mp4', 'webm'];
const KEYS = ['SITE', 'ABOUT', 'PROJECTS', 'PLAYGROUND', 'PHOTOS', 'JOYOUS'];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function out(int $code, array $body): void { http_response_code($code); echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); exit; }
function read_json(string $f) { if (!is_file($f)) return null; $j = json_decode((string)file_get_contents($f), true); return is_array($j) ? $j : null; }
function mtime(string $f): float { clearstatcache(true, $f); return is_file($f) ? (float)filemtime($f) : 0.0; }
function write_atomic(string $f, string $data): void {
  if (!is_dir(dirname($f))) mkdir(dirname($f), 0755, true);
  $t = $f . '.tmp';
  if (file_put_contents($t, $data) === false || !rename($t, $f)) out(500, ['error' => 'Could not write ' . basename($f) . '. Check folder permissions on the host.']);
}
function body_json(): array { $j = json_decode((string)file_get_contents('php://input'), true); return is_array($j) ? $j : []; }

/* ---------------- password + session cookie (same format as server.js) ---------------- */
function hash_pw(string $pw, string $salt): string { return hash_pbkdf2('sha256', $pw, hex2bin($salt), 120000, 64, false); }
function sign(string $secret, string $v): string { return hash_hmac('sha256', $v, hex2bin($secret)); }
function set_cookie(string $secret): void {
  $ts = (string)time();
  $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? '; Secure' : '';
  header("Set-Cookie: adm=$ts." . sign($secret, $ts) . "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" . (30 * 86400) . $secure);
}
function authed(?array $a): bool {
  if (!$a || !preg_match('/(?:^|;\s*)adm=([0-9]+)\.([0-9a-f]{64})/', $_SERVER['HTTP_COOKIE'] ?? '', $m)) return false;
  if (time() - (int)$m[1] > 30 * 86400) return false;
  return hash_equals(sign($a['secret'], $m[1]), $m[2]);
}
function projects_js(array $c): string {
  $head = "/* =========================================================\n   PROJECT DATA. Written by the dashboard from data/content.json:\n   edit content in admin.html (changes made here by hand are read back\n   into the dashboard the next time it opens, then saved over).\n   ========================================================= */\n";
  $parts = [];
  foreach (KEYS as $k) if (isset($c[$k])) $parts[] = "window.$k = " . json_encode($c[$k], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . ";\n";
  return $head . implode("\n", $parts);
}

$r = $_GET['r'] ?? '';
$post = $_SERVER['REQUEST_METHOD'] === 'POST';
if ($post && ($_SERVER['HTTP_X_ADMIN'] ?? '') !== '1') out(403, ['error' => 'Missing header']);
$a = is_file($AUTH) ? json_decode(preg_replace('/^<\?php.*?\?>\s*/s', '', (string)file_get_contents($AUTH)), true) : null;
if (!is_array($a)) $a = null;

if ($r === 'status') out(200, ['ok' => true, 'server' => 'php', 'hasPassword' => (bool)$a, 'authed' => authed($a), 'canSetup' => false, 'keys' => KEYS]);

if ($r === 'setup' && $post) {
  // on a host the password always comes from data/auth.php made on your computer
  out(403, ['error' => 'Set the password on your own computer first (start.bat), then upload the data folder.']);
}
if ($r === 'login' && $post) {
  if (!$a) out(409, ['error' => 'No password yet. Set it on your computer (start.bat) and upload data/auth.php.']);
  $pw = body_json()['password'] ?? '';
  if (!is_string($pw) || !hash_equals($a['hash'], hash_pw($pw, $a['salt']))) { usleep(900000); out(401, ['error' => 'Wrong password']); }
  set_cookie($a['secret']); out(200, ['ok' => true]);
}
if ($r === 'logout' && $post) { header('Set-Cookie: adm=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'); out(200, ['ok' => true]); }

if ($r === 'content' && !$post) out(200, ['content' => read_json($DB), 'contentMtime' => mtime($DB), 'projectsMtime' => mtime($PROJECTS_JS)]);

if (!authed($a)) out(401, ['error' => 'Please sign in']);

if ($r === 'save' && $post) {
  $c = body_json()['content'] ?? null;
  if (!is_array($c) || !isset($c['PROJECTS']) || !is_array($c['PROJECTS'])) out(400, ['error' => 'Bad content']);
  $clean = [];
  foreach (KEYS as $k) if (isset($c[$k])) $clean[$k] = $c[$k];
  if (is_file($DB)) {
    if (!is_dir($BACKUPS)) mkdir($BACKUPS, 0755, true);
    copy($DB, "$BACKUPS/content-" . gmdate('Y-m-d\TH-i-s') . '-' . substr((string)microtime(true), -3) . '.json');
    $old = glob("$BACKUPS/content-*.json"); sort($old);
    foreach (array_slice($old, 0, max(0, count($old) - KEEP_BACKUPS)) as $f) unlink($f);
  }
  write_atomic($DB, json_encode($clean, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
  write_atomic($PROJECTS_JS, projects_js($clean));
  out(200, ['ok' => true, 'contentMtime' => mtime($DB)]);
}
if ($r === 'upload' && $post) {
  $base = $_GET['base'] ?? ''; $ext = strtolower($_GET['ext'] ?? '');
  if (!preg_match('#^(images|audio)(/[a-z0-9_-]+)+$#', $base) || !in_array($ext, UPLOAD_EXT, true)) out(400, ['error' => 'Bad file name or type']);
  $len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
  if ($len <= 0) out(400, ['error' => 'Empty file']);
  if ($len > MAX_UPLOAD) out(413, ['error' => 'File too large']);
  $n = 1;
  do { $rel = sprintf('%s-%02d.%s', $base, $n++, $ext); } while (file_exists("$ROOT/$rel"));
  $in = fopen('php://input', 'rb');
  if (!is_dir(dirname("$ROOT/$rel"))) mkdir(dirname("$ROOT/$rel"), 0755, true);
  $outF = fopen("$ROOT/$rel", 'wb');
  if (!$in || !$outF) out(500, ['error' => 'Could not write the file. Check folder permissions on the host.']);
  stream_copy_to_stream($in, $outF); fclose($outF);
  out(200, ['ok' => true, 'path' => $rel]);
}
out(404, ['error' => 'Unknown request']);
