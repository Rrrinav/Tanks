// backend/main.go
package main

import (
	"fmt"
	"github.com/gorilla/websocket"
	"log"
	"net/http"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Allow all connections for testing purposes
		return true
	},
}

func echoHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	defer conn.Close()

	for {
		mt, message, err := conn.ReadMessage()
		if err != nil {
			log.Println("Read error:", err)
			break
		}
		log.Printf("Received: %s", message)
		err = conn.WriteMessage(mt, message)
		if err != nil {
			log.Println("Write error:", err)
			break
		}
	}
}

func main() {
	// Serve the WebSocket endpoint
	http.HandleFunc("/ws", echoHandler)

	// Serve a simple HTML page for testing the WebSocket
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "index.html")
	})

	fmt.Println("WebSocket echo server running on ws://localhost:8080/ws")
	fmt.Println("Visit http://localhost:8080 in your browser to test the WebSocket")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
