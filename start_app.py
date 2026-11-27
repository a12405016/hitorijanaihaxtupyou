from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from functools import partial
import webbrowser

if __name__ == '__main__':
    handler = partial(SimpleHTTPRequestHandler, directory=str(Path(__file__).resolve().parent))
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    url = f'http://127.0.0.1:{server.server_port}'
    print(f'Open: {url}\nKeep this window open. Press Ctrl+C to stop.')
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
