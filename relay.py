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
        elif self.path.startswith('/api/jobs'):
            # Long-poll: giữ connection tối đa 25s cho đến khi có job
            deadline = time.time() + 25
            while True:
                with lock:
                    if jobs:
                        try:
                            self._json(200, dict(jobs))
                        except Exception:
                            pass
                        return
                remaining = deadline - time.time()
                if remaining <= 0:
                    try:
                        self._json(200, {})
                    except Exception:
                        pass
                    return
                new_job_event.wait(timeout=remaining)
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
                jobs[job_id] = body['urls']
                result_events[job_id] = threading.Event()
            new_job_event.set()
            # Block cho đến khi extension trả kết quả (tối đa 120s)
            result_events[job_id].wait(timeout=120)
            with lock:
                result = results.pop(job_id, None)
                result_events.pop(job_id, None)
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

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def handle_error(self, request, client_address):
        pass  # bỏ qua lỗi kết nối bị ngắt (WinError 10053, BrokenPipe...)

    def log_message(self, *args): pass

os.chdir(os.path.dirname(os.path.abspath(__file__)))
ThreadingTCPServer.allow_reuse_address = True
print('Server running on http://localhost:8080')
ThreadingTCPServer(('0.0.0.0', 8080), Handler).serve_forever()
