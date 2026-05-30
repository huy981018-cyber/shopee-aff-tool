from http.server import HTTPServer, SimpleHTTPRequestHandler
import json, threading, os

jobs = {}
results = {}
lock = threading.Lock()
counter = [0]

class Handler(SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/ping':
            self._json(200, {'ok': True})
        elif self.path == '/api/jobs':
            with lock:
                data = dict(jobs)
            self._json(200, data)
        elif self.path.startswith('/api/result/'):
            job_id = self.path.split('/')[-1]
            with lock:
                r = results.pop(job_id, None)
            self._json(200, r) if r else self._json(204, {})
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
            self._json(200, {'job_id': job_id})
        elif self.path.startswith('/api/result/'):
            job_id = self.path.split('/')[-1]
            with lock:
                results[job_id] = body
                jobs.pop(job_id, None)
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

    def log_message(self, *args): pass

os.chdir(os.path.dirname(os.path.abspath(__file__)))
print('Server running on http://localhost:8080')
HTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
