// Command stormlink is the HEXIS: STORMLINK server.
//
//	go run ./cmd/stormlink            serve on :8080 with web/ as the client
//	go run ./cmd/stormlink -addr :9000 -room "Storm Deck"
//	go build -o stormlink ./cmd/stormlink
//
// One binary, no dependencies, no build step for the client — the browser
// loads ES modules straight off disk. Open http://localhost:8080 in as many
// tabs, phones or machines as you like; they all land in the same arena.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/garrettglasgow11-arch/gars-products/games/hexis/stormlink/internal/hub"
	"github.com/garrettglasgow11-arch/gars-products/games/hexis/stormlink/internal/ws"
)

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	roomName := flag.String("room", "Storm Deck", "room name")
	webDir := flag.String("web", "", "path to the web client (default: ./web next to the binary or the module root)")
	flag.Parse()

	dir := *webDir
	if dir == "" {
		dir = findWeb()
	}
	if _, err := os.Stat(filepath.Join(dir, "index.html")); err != nil {
		log.Fatalf("stormlink: no client at %s — pass -web with the path to web/", dir)
	}

	room := hub.NewRoom(*roomName)
	mux := http.NewServeMux()

	// Static client. No caching in development: the whole point of shipping
	// unbundled ES modules is that a reload is the build step.
	fs := http.FileServer(http.Dir(dir))
	mux.Handle("/", noCache(fs))

	mux.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(room.Stats())
	})

	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimSpace(r.URL.Query().Get("name"))
		if name == "" {
			name = "Hexis"
		}
		if len(name) > 18 {
			name = name[:18]
		}
		// Names come from a query string, so they are user input and go
		// straight into other people's HUDs. Strip anything that is not
		// printable rather than trusting the client to have been polite.
		name = sanitise(name)

		conn, err := ws.Upgrade(w, r)
		if err != nil {
			http.Error(w, "expected a websocket upgrade", http.StatusBadRequest)
			return
		}
		log.Printf("join  %s  (%s)", name, conn.RemoteAddr())
		room.Serve(conn, name)
		log.Printf("part  %s", name)
	})

	srv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		// No WriteTimeout: a hijacked websocket lives for hours and the
		// server-wide deadline would kill it. The ws package sets its own
		// per-write deadlines instead.
	}

	go func() {
		log.Printf("stormlink: http://localhost%s   room %q   client %s", *addr, *roomName, dir)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("stormlink: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	log.Println("stormlink: shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	room.Close()
	_ = srv.Shutdown(ctx)
}

// findWeb looks next to the binary first, then at the module root, so both
// `go run ./cmd/stormlink` and a copied-out binary work without a flag.
func findWeb() string {
	if exe, err := os.Executable(); err == nil {
		if d := filepath.Join(filepath.Dir(exe), "web"); dirHas(d, "index.html") {
			return d
		}
	}
	if wd, err := os.Getwd(); err == nil {
		for _, c := range []string{"web", filepath.Join("stormlink", "web"), filepath.Join("..", "web")} {
			if d := filepath.Join(wd, c); dirHas(d, "index.html") {
				return d
			}
		}
	}
	return "web"
}

func dirHas(dir, file string) bool {
	_, err := os.Stat(filepath.Join(dir, file))
	return err == nil
}

func noCache(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		h.ServeHTTP(w, r)
	})
}

func sanitise(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		if r >= 32 && r != 127 && r != '<' && r != '>' && r != '&' {
			out = append(out, r)
		}
	}
	if len(out) == 0 {
		return "Hexis"
	}
	return string(out)
}
