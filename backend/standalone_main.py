"""
Standalone launcher for the offline desktop package.
Starts the Flask app on localhost and opens the default browser.
"""
import socket
import threading
import webbrowser

from app import app


def _get_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def main():
    port = _get_free_port()
    url = f'http://127.0.0.1:{port}'
    threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    print(f'Starting MVM App at {url}')
    app.run(host='127.0.0.1', port=port, debug=False, use_reloader=False)


if __name__ == '__main__':
    main()
