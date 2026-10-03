<?php
/**
 * Honar Afagh demo — shared data for everyone who opens the demo link.
 *
 * Each browser runs the app with its own copy of the database and sends the
 * rows it changed here; this file keeps them in one append-only log and hands
 * every browser the changes it has not seen yet. No database server needed:
 * the log lives in ./sync-data (created automatically). Its files are .php files that
 * start with an exit statement, so they print nothing even on hosts that ignore .htaccess.
 *
 *   GET  sync.php?since=N                       → {"epoch","head","batches":[{"v","b"}…]}
 *   POST sync.php?action=push&epoch=E&base=N    → {"v"} | 409 when someone else wrote first
 *   POST sync.php?action=reset                  → back to the original demo data for everyone
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');

const MAX_BATCH_BYTES = 12 * 1024 * 1024;
$dir = __DIR__ . '/sync-data';

function fail(int $code, string $message): void {
    http_response_code($code);
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!is_dir($dir) && !@mkdir($dir, 0755, true)) fail(500, 'cannot create sync-data');
if (!file_exists("$dir/.htaccess")) @file_put_contents("$dir/.htaccess", "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n");
if (!file_exists("$dir/index.html")) @file_put_contents("$dir/index.html", '');

const GUARD = "<?php http_response_code(404); exit; ?>\n";
$stateFile = "$dir/state.php";
$logFile = "$dir/log.php";

$lockFile = fopen("$dir/lock.php", 'c');
if ($lockFile === false) fail(500, 'cannot open lock');

function writeState(string $file, array $state): void {
    file_put_contents($file, GUARD . json_encode($state));
}

function loadState(string $stateFile): ?array {
    $raw = @file_get_contents($stateFile);
    $state = $raw ? json_decode(substr($raw, strlen(GUARD)), true) : null;
    return is_array($state) ? $state : null;
}

/** Call with the exclusive lock held. */
function readState(string $stateFile, string $logFile): array {
    $state = loadState($stateFile);
    if ($state === null) {
        $state = ['epoch' => (int) round(microtime(true) * 1000), 'head' => 0];
        file_put_contents($logFile, GUARD);
        writeState($stateFile, $state);
    }
    return $state;
}

// First visit: create the log once, under the exclusive lock (concurrent first requests must agree on one epoch).
if (loadState($stateFile) === null) {
    flock($lockFile, LOCK_EX);
    readState($stateFile, $logFile);
    flock($lockFile, LOCK_UN);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';

if ($method === 'GET') {
    flock($lockFile, LOCK_SH);
    $state = readState($stateFile, $logFile);
    $since = max(0, (int) ($_GET['since'] ?? 0));
    $lines = [];
    if ($since < $state['head']) {
        $fh = @fopen($logFile, 'r');
        if ($fh) {
            while (($line = fgets($fh)) !== false) {
                $line = rtrim($line, "\r\n");
                if ($line === '') continue;
                // Each line starts with {"v":N, — read N without decoding the (possibly large) batch.
                if (preg_match('/^\{"v":(\d+),/', $line, $m) && (int) $m[1] > $since) $lines[] = $line;
            }
            fclose($fh);
        }
    }
    flock($lockFile, LOCK_UN);
    echo '{"epoch":' . $state['epoch'] . ',"head":' . $state['head'] . ',"batches":[' . implode(',', $lines) . ']}';
    exit;
}

if ($method !== 'POST') fail(405, 'method not allowed');

if ($action === 'reset') {
    flock($lockFile, LOCK_EX);
    $state = ['epoch' => (int) round(microtime(true) * 1000), 'head' => 0];
    file_put_contents($logFile, GUARD);
    writeState($stateFile, $state);
    flock($lockFile, LOCK_UN);
    echo json_encode($state);
    exit;
}

if ($action === 'push') {
    $body = file_get_contents('php://input');
    if ($body === false || $body === '') fail(400, 'empty batch');
    if (strlen($body) > MAX_BATCH_BYTES) fail(413, 'batch too large');
    $decoded = json_decode($body);
    if (!is_object($decoded) || !isset($decoded->c) || !is_array($decoded->c)) fail(400, 'invalid batch');
    $body = str_replace(["\r", "\n"], '', $body); // one log line per batch (JSON strings never contain raw newlines)

    flock($lockFile, LOCK_EX);
    $state = readState($stateFile, $logFile);
    if ((string) $state['epoch'] !== (string) ($_GET['epoch'] ?? '')) {
        flock($lockFile, LOCK_UN);
        http_response_code(409);
        echo json_encode(['error' => 'reset', 'epoch' => $state['epoch'], 'head' => $state['head']]);
        exit;
    }
    if ((int) ($_GET['base'] ?? -1) !== (int) $state['head']) {
        flock($lockFile, LOCK_UN);
        http_response_code(409);
        echo json_encode(['error' => 'behind', 'epoch' => $state['epoch'], 'head' => $state['head']]);
        exit;
    }
    $v = $state['head'] + 1;
    if (file_put_contents($logFile, '{"v":' . $v . ',"b":' . $body . "}\n", FILE_APPEND) === false) {
        flock($lockFile, LOCK_UN);
        fail(500, 'cannot write log');
    }
    $state['head'] = $v;
    writeState($stateFile, $state);
    flock($lockFile, LOCK_UN);
    echo json_encode(['v' => $v]);
    exit;
}

fail(400, 'unknown action');
