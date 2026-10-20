# app.cookies probe server (#46). Stdlib only: python3 server.py [port]
# /login sets an HttpOnly session cookie plus a visible one; /echo prints the
# Cookie header the webview sent (stdout and body), which is how the probe
# proves a cookie set from the backend rides real requests.
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8799


class H(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b''
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        if self.path.startswith('/login'):
            self.send_header('Set-Cookie', 'sid=s3cret; Path=/; HttpOnly; SameSite=Lax')
            self.send_header('Set-Cookie', 'vis=1; Path=/')
            body = b'<h1>logged in</h1>'
        else:
            got = self.headers.get('Cookie', '')
            print('ECHO Cookie: ' + got, flush=True)
            body = ('<pre id=c>' + got + '</pre>').encode()
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


HTTPServer(('127.0.0.1', PORT), H).serve_forever()
