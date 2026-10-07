"""Real proxy probe: open a verified TLS session with Noon through the proxy (not just a TCP connect).

A TCP connect only proves *something* listens on host:port. Free lists are full of
CDN edge IPs (e.g. Cloudflare on :80) that accept TCP but answer CONNECT with
400 — Chrome then shows ERR_TUNNEL_CONNECTION_FAILED. Many others answer CONNECT
200 but then kill the TLS handshake, so we also complete a verified TLS handshake.
"""

from __future__ import annotations

import socket
import ssl
import struct

NOON_PROBE_HOST = "account.noon.com"
NOON_PROBE_PORT = 443


def _http_connect_ok(sock: socket.socket, target_host: str, target_port: int) -> bool:
    request = (
        f"CONNECT {target_host}:{target_port} HTTP/1.1\r\n"
        f"Host: {target_host}:{target_port}\r\n"
        "Proxy-Connection: keep-alive\r\n\r\n"
    ).encode("ascii")
    sock.sendall(request)
    head = b""
    while b"\r\n" not in head and len(head) < 1024:
        chunk = sock.recv(256)
        if not chunk:
            break
        head += chunk
    status_line = head.split(b"\r\n", 1)[0].decode("latin-1", errors="replace")
    parts = status_line.split()
    return len(parts) >= 2 and parts[0].upper().startswith("HTTP/") and parts[1] == "200"


def _recv_exact(sock: socket.socket, size: int) -> bytes:
    data = b""
    while len(data) < size:
        chunk = sock.recv(size - len(data))
        if not chunk:
            raise OSError("SOCKS proxy closed connection")
        data += chunk
    return data


def _socks5_connect_ok(sock: socket.socket, target_host: str, target_port: int) -> bool:
    sock.sendall(b"\x05\x01\x00")  # v5, one method: no auth
    if _recv_exact(sock, 2) != b"\x05\x00":
        return False
    host = target_host.encode("idna")
    sock.sendall(b"\x05\x01\x00\x03" + bytes([len(host)]) + host + struct.pack(">H", target_port))
    reply = _recv_exact(sock, 2)
    return reply[0] == 0x05 and reply[1] == 0x00


def _tls_handshake_ok(sock: socket.socket, target_host: str) -> bool:
    """Complete a certificate-verified TLS handshake with Noon through the tunnel.

    We stop at the handshake on purpose: Noon's bot protection stalls/rejects
    scripted HTTP requests even without a proxy, so only a browser can prove a
    page loads. Dead free proxies fail right here (SSL_ERROR_SYSCALL / timeout).
    """
    context = ssl.create_default_context()
    with context.wrap_socket(sock, server_hostname=target_host):
        return True


def tunnel_ok(
    scheme: str,
    host: str,
    port: int,
    timeout: float = 6.0,
    target_host: str = NOON_PROBE_HOST,
    target_port: int = NOON_PROBE_PORT,
    tls_check: bool = True,
) -> bool:
    """True only if the proxy tunnels to Noon and a verified TLS handshake completes."""
    try:
        with socket.create_connection((host, port), timeout=timeout) as sock:
            sock.settimeout(timeout)
            if str(scheme or "http").lower().startswith("socks"):
                opened = _socks5_connect_ok(sock, target_host, target_port)
            else:
                opened = _http_connect_ok(sock, target_host, target_port)
            if not opened:
                return False
            if not tls_check:
                return True
            return _tls_handshake_ok(sock, target_host)
    except (OSError, ValueError, IndexError):
        return False
