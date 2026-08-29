// Package ws is a minimal server-side WebSocket (RFC 6455) implementation.
//
// It exists so STORMLINK has no dependencies at all: `go build ./...` works on
// a machine with nothing but the Go toolchain, which matters for a game server
// somebody is meant to be able to run on a laptop or a five-dollar VPS without
// first negotiating with a module proxy.
//
// Scope is deliberately the subset a game needs and nothing else:
//
//   - server side only, no client dialer
//   - no permessage-deflate. Snapshots are already packed binary in the tens
//     of bytes; deflating them costs more CPU than it saves bandwidth, and it
//     adds latency variance, which is the one thing a game must not trade for
//     throughput.
//   - no fragmentation on write. Every frame this game sends is one packet.
//     Fragmented *reads* are handled, because a browser may split a large
//     text frame and refusing that would be a correctness bug.
//   - no extensions, no subprotocols.
package ws

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// The magic string from RFC 6455 §1.3. It is not a secret; it exists so a
// cache or a proxy cannot accidentally complete a handshake.
const acceptGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

// Opcodes.
const (
	opContinuation = 0x0
	opText         = 0x1
	opBinary       = 0x2
	opClose        = 0x8
	opPing         = 0x9
	opPong         = 0xA
)

// MaxMessage caps a single inbound message. Inputs are 16 bytes; the only
// text a client sends is a short JSON hello. Anything larger is either a bug
// or somebody probing, and both should be disconnected rather than buffered.
const MaxMessage = 64 << 10

var ErrClosed = errors.New("ws: connection closed")

// Conn is one upgraded connection. Write is safe from multiple goroutines;
// Read is not, and is expected to be owned by a single reader goroutine.
type Conn struct {
	conn net.Conn
	br   *bufio.Reader

	wmu    sync.Mutex
	closed bool

	// Deadlines applied on every operation rather than once at setup, so a
	// connection that stops reading is dropped instead of leaking a goroutine.
	ReadTimeout  time.Duration
	WriteTimeout time.Duration

	// OnPong, if set, is called from the read goroutine when the peer answers
	// a Ping. A browser answers automatically and promptly, which makes this
	// the only honest round-trip measurement the server can take on its own —
	// anything derived from application traffic is really measuring how long
	// the client took to get around to replying.
	OnPong func()
}

// Message is one complete application message.
type Message struct {
	Binary bool
	Data   []byte
}

// Upgrade performs the handshake and hijacks the connection.
func Upgrade(w http.ResponseWriter, r *http.Request) (*Conn, error) {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		return nil, errors.New("ws: not an upgrade request")
	}
	if !headerContains(r.Header.Get("Connection"), "upgrade") {
		return nil, errors.New("ws: missing Connection: Upgrade")
	}
	if r.Header.Get("Sec-WebSocket-Version") != "13" {
		return nil, errors.New("ws: unsupported version")
	}
	key := r.Header.Get("Sec-WebSocket-Key")
	if key == "" {
		return nil, errors.New("ws: missing Sec-WebSocket-Key")
	}

	hj, ok := w.(http.Hijacker)
	if !ok {
		return nil, errors.New("ws: response writer is not a Hijacker")
	}
	conn, brw, err := hj.Hijack()
	if err != nil {
		return nil, err
	}

	sum := sha1.Sum([]byte(key + acceptGUID))
	accept := base64.StdEncoding.EncodeToString(sum[:])

	resp := "HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
	if _, err := conn.Write([]byte(resp)); err != nil {
		conn.Close()
		return nil, err
	}
	// Nagle batches small writes, which is exactly wrong for a 30 Hz stream of
	// 60-byte snapshots: it would add up to 40 ms of avoidable latency.
	if tcp, ok := conn.(*net.TCPConn); ok {
		_ = tcp.SetNoDelay(true)
	}
	return &Conn{
		conn:         conn,
		br:           brw.Reader,
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 10 * time.Second,
	}, nil
}

func headerContains(h, want string) bool {
	for _, part := range strings.Split(h, ",") {
		if strings.EqualFold(strings.TrimSpace(part), want) {
			return true
		}
	}
	return false
}

// Read returns the next application message, answering pings transparently.
func (c *Conn) Read() (Message, error) {
	var assembled []byte
	var binaryMsg bool
	var assembling bool

	for {
		if c.ReadTimeout > 0 {
			_ = c.conn.SetReadDeadline(time.Now().Add(c.ReadTimeout))
		}
		fin, op, payload, err := c.readFrame()
		if err != nil {
			return Message{}, err
		}

		switch op {
		case opPing:
			if err := c.write(opPong, payload); err != nil {
				return Message{}, err
			}
			continue
		case opPong:
			if c.OnPong != nil {
				c.OnPong()
			}
			continue
		case opClose:
			_ = c.write(opClose, payload)
			c.Close()
			return Message{}, ErrClosed
		case opText, opBinary:
			if assembling {
				return Message{}, errors.New("ws: new message began mid-fragment")
			}
			binaryMsg = op == opBinary
			assembled = payload
			if fin {
				return Message{Binary: binaryMsg, Data: assembled}, nil
			}
			assembling = true
		case opContinuation:
			if !assembling {
				return Message{}, errors.New("ws: continuation with nothing to continue")
			}
			if len(assembled)+len(payload) > MaxMessage {
				return Message{}, errors.New("ws: message too large")
			}
			assembled = append(assembled, payload...)
			if fin {
				return Message{Binary: binaryMsg, Data: assembled}, nil
			}
		default:
			return Message{}, fmt.Errorf("ws: unknown opcode %d", op)
		}
	}
}

func (c *Conn) readFrame() (fin bool, opcode byte, payload []byte, err error) {
	var h [2]byte
	if _, err = io.ReadFull(c.br, h[:]); err != nil {
		return
	}
	fin = h[0]&0x80 != 0
	if h[0]&0x70 != 0 {
		err = errors.New("ws: reserved bits set (no extensions were negotiated)")
		return
	}
	opcode = h[0] & 0x0f
	masked := h[1]&0x80 != 0
	length := uint64(h[1] & 0x7f)

	switch length {
	case 126:
		var b [2]byte
		if _, err = io.ReadFull(c.br, b[:]); err != nil {
			return
		}
		length = uint64(binary.BigEndian.Uint16(b[:]))
	case 127:
		var b [8]byte
		if _, err = io.ReadFull(c.br, b[:]); err != nil {
			return
		}
		length = binary.BigEndian.Uint64(b[:])
	}
	if length > MaxMessage {
		err = errors.New("ws: frame too large")
		return
	}
	// RFC 6455 §5.1: a client MUST mask. An unmasked client frame is either a
	// broken implementation or an attempt to smuggle something past a proxy.
	if !masked {
		err = errors.New("ws: client frame was not masked")
		return
	}
	var mask [4]byte
	if _, err = io.ReadFull(c.br, mask[:]); err != nil {
		return
	}
	payload = make([]byte, length)
	if _, err = io.ReadFull(c.br, payload); err != nil {
		return
	}
	for i := range payload {
		payload[i] ^= mask[i&3]
	}
	return
}

// WriteBinary sends one binary message. This is the snapshot path.
func (c *Conn) WriteBinary(b []byte) error { return c.write(opBinary, b) }

// WriteText sends one text message. This is the JSON event path.
func (c *Conn) WriteText(b []byte) error { return c.write(opText, b) }

// Ping sends a ping frame. The browser answers automatically.
func (c *Conn) Ping() error { return c.write(opPing, nil) }

func (c *Conn) write(opcode byte, payload []byte) error {
	c.wmu.Lock()
	defer c.wmu.Unlock()
	if c.closed {
		return ErrClosed
	}
	n := len(payload)
	// Server frames are never masked, so the header is 2, 4 or 10 bytes.
	var hdr []byte
	switch {
	case n < 126:
		hdr = []byte{0x80 | opcode, byte(n)}
	case n <= 0xffff:
		hdr = []byte{0x80 | opcode, 126, 0, 0}
		binary.BigEndian.PutUint16(hdr[2:], uint16(n))
	default:
		hdr = make([]byte, 10)
		hdr[0] = 0x80 | opcode
		hdr[1] = 127
		binary.BigEndian.PutUint64(hdr[2:], uint64(n))
	}
	if c.WriteTimeout > 0 {
		_ = c.conn.SetWriteDeadline(time.Now().Add(c.WriteTimeout))
	}
	// One writev-shaped write: header and payload in a single syscall keeps a
	// 60-byte snapshot in a single TCP segment.
	buf := make([]byte, 0, len(hdr)+n)
	buf = append(buf, hdr...)
	buf = append(buf, payload...)
	_, err := c.conn.Write(buf)
	return err
}

// Close sends a close frame and shuts the socket down. Safe to call twice.
func (c *Conn) Close() error {
	c.wmu.Lock()
	if c.closed {
		c.wmu.Unlock()
		return nil
	}
	c.closed = true
	c.wmu.Unlock()
	return c.conn.Close()
}

// RemoteAddr is used for logging and for the per-IP connection limit.
func (c *Conn) RemoteAddr() string { return c.conn.RemoteAddr().String() }
