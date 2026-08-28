"""Share a folder with other devices on the same wi-fi.

Starts a tiny web server. Anyone on the same network can open the link in a
browser and download the files. Stops the moment you press Ctrl+C.
"""

from __future__ import annotations

import functools
import os
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from . import ui


def local_ip() -> str:
    """Find this computer's address on the local network."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Nothing is actually sent; this just asks the OS which network card
        # it would use to reach the outside world.
        probe.connect(("8.8.8.8", 80))
        return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        probe.close()


def free_port(preferred: int = 8000, tries: int = 20) -> int:
    """Return the first port that is not already in use."""
    for offset in range(tries):
        port = preferred + offset
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(("", port))
                return port
            except OSError:
                continue
    raise OSError("Could not find a free port to use.")


class QuietHandler(SimpleHTTPRequestHandler):
    """Same as the built-in file server, but with tidier logging."""

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        ui.info(f"{self.client_address[0]} asked for {self.path}")


def serve(folder: str, port: int = 0) -> None:
    """Serve a folder until the user presses Ctrl+C."""
    folder = os.path.abspath(folder)
    port = port or free_port()
    handler = functools.partial(QuietHandler, directory=folder)
    server = ThreadingHTTPServer(("", port), handler)

    ui.title("Sharing over wi-fi")
    ui.ok(f"Sharing: {folder}")
    ui.ok(f"On this computer:  http://localhost:{port}")
    ui.ok(f"On other devices:  http://{local_ip()}:{port}")
    ui.info("They must be on the same wi-fi. Press Ctrl+C to stop sharing.")
    print()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
        ui.ok("Stopped sharing. The link no longer works.")
    finally:
        server.server_close()


__all__ = ["free_port", "local_ip", "serve"]
