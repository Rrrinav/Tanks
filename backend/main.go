package main

import (
	"errors"
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

const BoardSize = 5

type CellState int

const (
	Empty CellState = iota
	Tank
	Hit
	Miss
)

type Board [BoardSize][BoardSize]CellState

type Player struct {
	ID    int
	Board Board
	Tanks int
}

type Game struct {
	Players  [2]Player
	Turn     int // 0 or 1
	GameOver bool
	WinnerID int
}

func NewGame() *Game {
	return &Game{
		Players: [2]Player{
			{ID: 0}, {ID: 1},
		},
	}
}

func (g *Game) PlaceTank(playerID, x, y int) error {
	player := &g.Players[playerID]
	if x < 0 || y < 0 || x >= BoardSize || y >= BoardSize {
		return errors.New("out of bounds")
	}
	if player.Board[x][y] != Empty {
		return errors.New("already occupied")
	}
	player.Board[x][y] = Tank
	player.Tanks++
	return nil
}

func (g *Game) Bomb(x, y int) (string, error) {
	if g.GameOver {
		return "", errors.New("game is over")
	}

	current := &g.Players[g.Turn]
	opponent := &g.Players[1-g.Turn]

	if x < 0 || y < 0 || x >= BoardSize || y >= BoardSize {
		return "", errors.New("out of bounds")
	}

	cell := opponent.Board[x][y]
	switch cell {
	case Tank:
		opponent.Board[x][y] = Hit
		opponent.Tanks--
		if opponent.Tanks == 0 {
			g.GameOver = true
			g.WinnerID = current.ID
		}
		g.Turn = 1 - g.Turn
		return "Hit!", nil
	case Empty:
		opponent.Board[x][y] = Miss
		g.Turn = 1 - g.Turn
		return "Miss", nil
	case Hit, Miss:
		return "", errors.New("already bombed")
	default:
		return "", errors.New("invalid cell")
	}
}

func main() {
	game := NewGame()
	reader := bufio.NewReader(os.Stdin)

	const TanksPerPlayer = 3

	fmt.Println("=== Tank Battle Game ===")
	fmt.Printf("Each player will place %d tanks.\n", TanksPerPlayer)

	// Tank placement phase
	for pid := 0; pid < 2; pid++ {
		fmt.Printf("\nPlayer %d, place your tanks:\n", pid)
		count := 0
		for count < TanksPerPlayer {
			fmt.Printf("Enter tank %d position as x y: ", count+1)
			line, _ := reader.ReadString('\n')
			x, y, err := parseCoords(line)
			if err != nil {
				fmt.Println("Invalid input. Try again.")
				continue
			}
			if err := game.PlaceTank(pid, x, y); err != nil {
				fmt.Println("Error placing tank:", err)
				continue
			}
			count++
		}
	}

	// Bombing phase
	for !game.GameOver {
		player := game.Turn
		fmt.Printf("\nPlayer %d's turn to bomb.\n", player)
		fmt.Print("Enter bombing coordinates as x y: ")
		line, _ := reader.ReadString('\n')
		x, y, err := parseCoords(line)
		if err != nil {
			fmt.Println("Invalid input. Try again.")
			continue
		}

		result, err := game.Bomb(x, y)
		if err != nil {
			fmt.Println("Error:", err)
			continue
		}
		fmt.Println("Result:", result)
	}

	fmt.Printf("\n Game Over! Player %d wins!\n", game.WinnerID)
}

// parseCoords parses a string like "2 3" to (2, 3)
func parseCoords(input string) (int, int, error) {
	parts := strings.Fields(input)
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("need 2 numbers")
	}
	x, err1 := strconv.Atoi(parts[0])
	y, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil {
		return 0, 0, fmt.Errorf("invalid number")
	}
	return x, y, nil
}
