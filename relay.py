from http.server import SimpleHTTPRequestHandler
from socketserver import ThreadingTCPServer
import json, threading, os, time

jobs = {}
results = {}
result_events = {}
lock = threading.Lock()
new_job_event = threading.Event()
counter = [0]

class Handler(SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/ping':
            self._json(200, {'ok': True})

        elif 'apple-touch-icon' in self.path or 'favicon' in self.path:
            self.send_response(204)
            self._cors()
            self.end_headers()

        elif self.path.startswith('/api/jobs'):
            # Long-poll: block tối đa 25s cho đến khi có job
            deadline = time.time() + 25
            while True:
                with lock:
                    snapshot = dict(jobs) if jobs else None
                # Lock đã được release trước khi gọi _json
                if snapshot:
                    self._json(200, snapshot)
                    return
                remaining = deadline - time.time()
                if remaining <= 0:
                    self._json(200, {})
                    return
                new_job_event.wait(timeout=min(remaining, 1.0))
                new_job_event.clear()

        else:
            super().do_GET()

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length))

        if self.path == '/api/convert':
            with lock:
                counter[0] += 1
                job_id = str(counter[0])
                jobs[job_id] = {'urls': body['urls'], 'ts': time.time()}
                ev = threading.Event()
                result_events[job_id] = ev
            new_job_event.set()
            # Block cho đến khi extension trả kết quả (tối đa 10s)
            ev.wait(timeout=10)
            with lock:
                result = results.pop(job_id, None)
                result_events.pop(job_id, None)
                jobs.pop(job_id, None)
            self._json(200, result if result else {'error': 'Timeout'})

        elif self.path.startswith('/api/result/'):
            job_id = self.path.split('/')[-1]
            with lock:
                results[job_id] = body
                jobs.pop(job_id, None)
                ev = result_events.get(job_id)
            if ev:
                ev.set()
            self._json(200, {'ok': True})

    def send_response(self, code, message=None):
        super().send_response(code, message)
        # Disable cache để tránh 304 từ Safari/iOS
        self.send_header('Cache-Control', 'no-store')

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, code, data):
        try:
            body = json.dumps(data).encode()
            self.send_response(code)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(body))
            self.end_headers()
            self.wfile.write(body)
        except Exception:
            pass

    def handle_error(self, request, client_address):
        pass

    def log_message(self, *args): pass

def cleanup_loop():
    while True:
        time.sleep(30)
        now = time.time()
        with lock:
            stale = [jid for jid, j in jobs.items()
                     if isinstance(j, dict) and now - j.get('ts', now) > 10]
            for jid in stale:
                jobs.pop(jid, None)
                ev = result_events.pop(jid, None)
                if ev:
                    ev.set()

os.chdir(os.path.dirname(os.path.abspath(__file__)))
ThreadingTCPServer.allow_reuse_address = True
ThreadingTCPServer.daemon_threads = True
threading.Thread(target=cleanup_loop, daemon=True).start()
print('Server running on http://localhost:8080')
ThreadingTCPServer(('0.0.0.0', 8080), Handler).serve_forever()
