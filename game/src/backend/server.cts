import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { WebSocket, WebSocketServer } from 'ws';

const DEBUG = false

// Game Constants
const BOARD_SIZE = 8;
const TANKS_PER_PLAYER = 3;
const EXPLOSION_RADIUS = 1;
const PORT = 3000;

// Types
enum CellState {
  EMPTY = 0,
  TANK = 1,
  HIT = 2,
  MISS = 3,
  REVEALED = 4
}

enum GamePhase {
  WAITING = 'waiting',
  PLACEMENT = 'placement',
  BATTLE = 'battle',
  GAME_OVER = 'gameover'
}

interface Position {
  x: number;
  y: number;
}

interface Player {
  id: number;
  ws: WebSocket;
  board: CellState[][];
  visibleEnemyBoard: CellState[][];
  tanks: Position[];
  tanksAlive: number;
  ready: boolean;
  name: string;
  joinTime: number;
}

interface GameState {
  id: string;
  players: Player[];
  actionTaken: boolean;
  currentTurn: number;
  phase: GamePhase;
  winner: number | null;
  moveCount: number;
  startTime: number;
  createdAt: number;
}

interface GameMessage {
  type: string;
  [key: string]: any;
}

// Utility Functions
class Utils {
  static generateRoomId(): string {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  static validateRoomId(roomId: string): boolean {
    // Allow alphanumeric room IDs between 4-10 characters
    return /^[A-Za-z0-9]{4,10}$/.test(roomId);
  }

  static createEmptyBoard(): CellState[][] {
    return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(CellState.EMPTY));
  }

  static isValidPosition(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE;
  }

  static getRandomName(): string {
    const adjectives = ['Brave', 'Steel', 'Iron', 'Thunder', 'Lightning', 'Shadow', 'Crimson', 'Golden'];
    const nouns = ['Tank', 'Warrior', 'Commander', 'General', 'Captain', 'Soldier', 'Hunter', 'Destroyer'];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
  }
}

// Game Manager Class
class GameManager {
  private games: Map<string, GameState> = new Map();
  private playerConnections: Map<WebSocket, { gameId: string; playerId: number }> = new Map();
  private allConnections: Set<WebSocket> = new Set();

  constructor() {
    // Cleanup old games every 30 minutes
    setInterval(() => {
      this.cleanupOldGames();
    }, 30 * 60 * 1000);
  }

  addConnection(ws: WebSocket): void {
    this.allConnections.add(ws);
    console.log(`New client connected. Total connections: ${this.allConnections.size}`);

    // Send current server stats to the new connection
    this.sendServerStats(ws);
  }

  removeConnection(ws: WebSocket): void {
    this.allConnections.delete(ws);
    console.log(`Client disconnected. Total connections: ${this.allConnections.size}`);
  }

  createGame(customRoomId?: string): string {
    let gameId: string;

    if (customRoomId) {
      // Validate custom room ID
      if (!Utils.validateRoomId(customRoomId)) {
        throw new Error('Invalid room ID format. Use 4-10 alphanumeric characters.');
      }

      // Check if room already exists
      if (this.games.has(customRoomId.toUpperCase())) {
        throw new Error('Room ID already exists. Choose a different one.');
      }

      gameId = customRoomId.toUpperCase();
    } else {
      // Generate unique random room ID
      do {
        gameId = Utils.generateRoomId();
      } while (this.games.has(gameId));
    }

    const game: GameState = {
      id: gameId,
      players: [],
      currentTurn: 0,
      actionTaken: false,
      phase: GamePhase.WAITING,
      winner: null,
      moveCount: 0,
      startTime: Date.now(),
      createdAt: Date.now()
    };

    this.games.set(gameId, game);
    console.log(`Created new game: ${gameId} (${customRoomId ? 'custom' : 'random'} room ID)`);

    // Broadcast to all connections that a new game is available
    this.broadcastNewGame(game);

    return gameId;
  }

  joinGame(gameId: string, ws: WebSocket, playerName?: string): { success: boolean; player?: Player; error?: string } {
    gameId = gameId.toUpperCase();
    const game = this.games.get(gameId);

    if (!game) {
      console.log(`Game not found: ${gameId}`);
      return { success: false, error: 'Game not found' };
    }

    if (game.players.length >= 2) {
      console.log(`Game full: ${gameId}`);
      return { success: false, error: 'Game is full' };
    }

    // Check if this WebSocket is already in a game
    const existingConnection = this.playerConnections.get(ws);
    if (existingConnection) {
      this.leaveGame(ws);
    }

    const player: Player = {
      id: game.players.length,
      ws,
      board: Utils.createEmptyBoard(),
      visibleEnemyBoard: Utils.createEmptyBoard(),
      tanks: [],
      tanksAlive: 0,
      ready: false,
      name: playerName || Utils.getRandomName(),
      joinTime: Date.now()
    };

    game.players.push(player);
    this.playerConnections.set(ws, { gameId, playerId: player.id });

    console.log(`Player ${player.name} joined game ${gameId} as Player ${player.id + 1}`);

    // Start placement phase when 2 players join
    if (game.players.length === 2) {
      game.phase = GamePhase.PLACEMENT;
      game.startTime = Date.now();
      console.log(`Game ${gameId} entering placement phase with players: ${game.players.map(p => p.name).join(' vs ')}`);
    }

    if (DEBUG && game.id === '1234') {
      game.phase = GamePhase.PLACEMENT;
      game.players[0].ready = true;
      console.log(`DEBUG mode: Auto-starting game ${gameId} with one player.`);
    }

    this.broadcastGameState(game);
    this.broadcastGameUpdate(game);

    return { success: true, player };
  }

  leaveGame(ws: WebSocket): void {
    const connection = this.playerConnections.get(ws);
    if (!connection) return;

    const game = this.games.get(connection.gameId);
    if (game) {
      const disconnectedPlayer = game.players[connection.playerId];
      console.log(`${disconnectedPlayer?.name || 'Player'} left game ${connection.gameId}`);

      // Notify other players in the game
      game.players.forEach((player, index) => {
        if (index !== connection.playerId && player.ws.readyState === WebSocket.OPEN) {
          player.ws.send(JSON.stringify({
            type: 'playerDisconnected',
            playerName: disconnectedPlayer?.name || 'Unknown Player',
            playerId: connection.playerId
          }));
        }
      });

      // Remove the game if no active players left
      const activePlayers = game.players.filter(p => p.ws.readyState === WebSocket.OPEN && p.ws !== ws);
      if (activePlayers.length === 0) {
        this.games.delete(connection.gameId);
        console.log(`Removed empty game: ${connection.gameId}`);
        this.broadcastGameRemoved(connection.gameId);
      } else if (activePlayers.length === 1 && game.phase !== GamePhase.WAITING) {
        // Reset game to waiting state if only one player left
        game.phase = GamePhase.WAITING;
        game.players = activePlayers;
        game.players[0].id = 0; // Reset player ID
        game.currentTurn = 0;
        this.playerConnections.set(activePlayers[0].ws, { gameId: connection.gameId, playerId: 0 });
        this.broadcastGameState(game);
        this.broadcastGameUpdate(game);
      }
    }

    this.playerConnections.delete(ws);
  }

  placeTank(gameId: string, playerId: number, x: number, y: number): boolean {
    const game = this.games.get(gameId);
    if (!game || game.phase !== GamePhase.PLACEMENT) {
      return false;
    }

    const player = game.players[playerId];
    if (!player || player.tanks.length >= TANKS_PER_PLAYER) {
      return false;
    }

    if (!Utils.isValidPosition(x, y) || player.board[y][x] !== CellState.EMPTY) {
      return false;
    }

    // Place tank
    player.board[y][x] = CellState.TANK;
    player.tanks.push({ x, y });
    player.tanksAlive++;

    console.log(`${player.name} placed tank at (${x}, ${y}) - ${player.tanks.length}/${TANKS_PER_PLAYER}`);

    // Check if player is ready
    if (player.tanks.length === TANKS_PER_PLAYER) {
      player.ready = true;
      console.log(`${player.name} ready for battle`);
    }

    // Check if both players are ready
    if (game.players.length === 2 && game.players.every(p => p.ready)) {
      game.phase = GamePhase.BATTLE;
      console.log(`Game ${gameId} entering battle phase`);
    }

    return true;
  }

  moveTank(gameId: string, playerId: number, fromX: number, fromY: number, toX: number, toY: number): boolean {
    const game = this.games.get(gameId);
    if (!game || game.phase !== GamePhase.BATTLE || game.currentTurn !== playerId || game.actionTaken) {
      return false;
    }

    const player = game.players[playerId];
    if (!player) return false;

    // Validate positions
    if (!Utils.isValidPosition(fromX, fromY) || !Utils.isValidPosition(toX, toY)) {
      return false;
    }

    // Check if there's a tank at source and destination is empty
    if (player.board[fromY][fromX] !== CellState.TANK || player.board[toY][toX] !== CellState.EMPTY) {
      return false;
    }

    // Move tank
    player.board[fromY][fromX] = CellState.EMPTY;
    player.board[toY][toX] = CellState.TANK;

    // Update tank position in tanks array
    const tankIndex = player.tanks.findIndex(t => t.x === fromX && t.y === fromY);
    if (tankIndex !== -1) {
      player.tanks[tankIndex] = { x: toX, y: toY };
    }

    game.actionTaken = true;
    this.switchTurn(game);

    console.log(`${player.name} moved tank from (${fromX}, ${fromY}) to (${toX}, ${toY})`);
    return true;
  }
  // Add this helper method to the GameManager class
  private switchTurn(game: GameState): void {
    game.currentTurn = 1 - game.currentTurn;
    game.moveCount++;
    game.actionTaken = false; // Reset for the next player's turn
  }

  bomb(gameId: string, playerId: number, x: number, y: number): { result: string; gameOver: boolean } {
    const game = this.games.get(gameId);
    if (!game || game.phase !== GamePhase.BATTLE || game.currentTurn !== playerId || game.actionTaken) {
      return { result: 'Not your turn', gameOver: false };
    }

    const attacker = game.players[playerId];
    const defender = game.players[1 - playerId];
    if (!attacker || !defender) {
      return { result: 'Invalid players', gameOver: false };
    }

    if (!Utils.isValidPosition(x, y)) {
      return { result: 'Out of bounds', gameOver: false };
    }

    // Check if already bombed
    if (attacker.visibleEnemyBoard[y][x] === CellState.HIT || attacker.visibleEnemyBoard[y][x] === CellState.MISS) {
      return { result: 'Already bombed', gameOver: false };
    }

    let result = '';
    const targetCell = defender.board[y][x];

    if (targetCell === CellState.TANK) {
      // HIT!
      defender.board[y][x] = CellState.HIT;
      defender.tanksAlive--;
      result = `DIRECT HIT at (${String.fromCharCode(65 + x)}${y + 1})!`;

      // Remove tank from defender's tanks array
      defender.tanks = defender.tanks.filter(t => !(t.x === x && t.y === y));

      console.log(`${attacker.name} hit ${defender.name}'s tank at (${x}, ${y})`);

      // Check win condition
      if (defender.tanksAlive === 0) {
        game.phase = GamePhase.GAME_OVER;
        game.winner = playerId;
        result += ` VICTORY! All enemy tanks destroyed!`;
        console.log(`${attacker.name} wins game ${gameId}!`);
        this.broadcastGameUpdate(game);
        return { result, gameOver: true };
      }
    } else {
      // MISS
      if (targetCell === CellState.EMPTY) {
        defender.board[y][x] = CellState.MISS;
      }
      result = `Miss at (${String.fromCharCode(65 + x)}${y + 1})`;
      console.log(`${attacker.name} missed at (${x}, ${y})`);
    }

    // Reveal area around explosion
    this.revealArea(attacker, defender, x, y);

    // Switch turns and increment move count
    game.actionTaken = true;
    this.switchTurn(game);

    this.broadcastGameState(game);

    return { result, gameOver: false };
  }

  private revealArea(attacker: Player, defender: Player, centerX: number, centerY: number): void {
    for (let dy = -EXPLOSION_RADIUS; dy <= EXPLOSION_RADIUS; dy++) {
      for (let dx = -EXPLOSION_RADIUS; dx <= EXPLOSION_RADIUS; dx++) {
        const x = centerX + dx;
        const y = centerY + dy;

        if (Utils.isValidPosition(x, y)) {
          const defenderCell = defender.board[y][x];

          if (defenderCell === CellState.TANK) {
            attacker.visibleEnemyBoard[y][x] = CellState.TANK;
          } else if (defenderCell === CellState.HIT) {
            attacker.visibleEnemyBoard[y][x] = CellState.HIT;
          } else if (defenderCell === CellState.MISS) {
            attacker.visibleEnemyBoard[y][x] = CellState.MISS;
          } else {
            attacker.visibleEnemyBoard[y][x] = CellState.REVEALED;
          }
        }
      }
    }
  }

  private broadcastGameState(game: GameState): void {
    const gameData = {
      type: 'gameState',
      gameId: game.id,
      phase: game.phase,
      currentTurn: game.currentTurn,
      winner: game.winner,
      moveCount: game.moveCount,
      players: game.players.map(p => ({
        id: p.id,
        name: p.name,
        tanksAlive: p.tanksAlive,
        ready: p.ready
      }))
    };

    game.players.forEach((player, index) => {
      if (player.ws.readyState === WebSocket.OPEN) {
        const playerData = {
          ...gameData,
          playerId: index,
          myBoard: player.board,
          enemyBoard: player.visibleEnemyBoard,
          myTanks: player.tanksAlive,
          enemyTanks: game.players[1 - index]?.tanksAlive || 0,
          enemyName: game.players[1 - index]?.name || 'Unknown'
        };
        player.ws.send(JSON.stringify(playerData));
      }
    });
  }

  // New method to broadcast game updates to all connections
  private broadcastGameUpdate(game: GameState): void {
    const gameUpdate = {
      type: 'gameUpdate',
      gameId: game.id,
      phase: game.phase,
      playerCount: game.players.length,
      maxPlayers: 2,
      players: game.players.map(p => ({ name: p.name, ready: p.ready })),
      createdAt: game.createdAt,
      canJoin: game.players.length < 2
    };

    this.broadcastToAll(gameUpdate);
  }

  // New method to broadcast new game creation
  private broadcastNewGame(game: GameState): void {
    const newGameMessage = {
      type: 'newGame',
      gameId: game.id,
      phase: game.phase,
      playerCount: 0,
      maxPlayers: 2,
      createdAt: game.createdAt,
      canJoin: true
    };

    this.broadcastToAll(newGameMessage);
  }

  // New method to broadcast game removal
  private broadcastGameRemoved(gameId: string): void {
    const removeMessage = {
      type: 'gameRemoved',
      gameId
    };

    this.broadcastToAll(removeMessage);
  }

  // New method to broadcast to all connections
  private broadcastToAll(message: any): void {
    const messageString = JSON.stringify(message);
    this.allConnections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageString);
      }
    });
  }

  // New method to get list of available games
  getGamesList(): any[] {
    const gamesList: any[] = [];
    this.games.forEach(game => {
      gamesList.push({
        id: game.id,
        phase: game.phase,
        playerCount: game.players.length,
        maxPlayers: 2,
        players: game.players.map(p => ({ name: p.name, ready: p.ready })),
        createdAt: game.createdAt,
        canJoin: game.players.length < 2
      });
    });
    return gamesList.sort((a, b) => b.createdAt - a.createdAt);
  }

  // New method to send server stats
  private sendServerStats(ws: WebSocket): void {
    const stats = this.getGameStats();
    const gamesList = this.getGamesList();

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'serverStats',
        stats,
        gamesList
      }));
    }
  }

  handleMessage(ws: WebSocket, message: GameMessage): void {
    const connection = this.playerConnections.get(ws);
    try {
      switch (message.type) {
        case 'join':
          const gameId = message.gameId;
          if (DEBUG && gameId === '1234' && !this.games.has(gameId)) {
            // Automatically create the debug room if it doesn't exist
            console.log("DEBUG: Creating room '1234' for single-player testing.");
            this.createGame(gameId);
          }
          if (gameId && !this.games.has(gameId.toUpperCase())) {
            // Try to create game with custom room ID
            try {
              this.createGame(gameId);
            } catch (error: any) {
              ws.send(JSON.stringify({
                type: 'joined',
                success: false,
                error: error.message
              }));
              return;
            }
          }

          const targetGameId = gameId ? gameId.toUpperCase() : this.createGame();
          const joinResult = this.joinGame(targetGameId, ws, message.playerName);

          ws.send(JSON.stringify({
            type: 'joined',
            success: joinResult.success,
            gameId: joinResult.success ? targetGameId : undefined,
            playerId: joinResult.player?.id,
            playerName: joinResult.player?.name,
            boardSize: BOARD_SIZE,
            tanksPerPlayer: TANKS_PER_PLAYER,
            error: joinResult.error
          }));
          break;

        case 'createRoom':
          try {
            const newGameId = this.createGame(message.customRoomId);
            console.log("Room creation")
            ws.send(JSON.stringify({
              type: 'roomCreated',
              success: true,
              gameId: newGameId
            }));
          } catch (error: any) {
            ws.send(JSON.stringify({
              type: 'roomCreated',
              success: false,
              error: error.message
            }));
          }
          break;

        case 'getGamesList':
          const gamesList = this.getGamesList();
          ws.send(JSON.stringify({
            type: 'gamesList',
            games: gamesList
          }));
          break;

        case 'getServerStats':
          this.sendServerStats(ws);
          break;

        case 'placeTank':
          if (!connection) return;
          const placed = this.placeTank(connection.gameId, connection.playerId, message.x, message.y);
          ws.send(JSON.stringify({ type: 'placeTankResult', success: placed, x: message.x, y: message.y }));
          if (placed) {
            const game = this.games.get(connection.gameId);
            if (game) this.broadcastGameState(game);
          }
          break;

        case 'moveTank':
          if (!connection) return;
          const moved = this.moveTank(connection.gameId, connection.playerId, message.fromX, message.fromY, message.toX, message.toY);
          ws.send(JSON.stringify({ type: 'moveTankResult', success: moved, error: moved ? undefined : 'Move Failed' }));
          if (moved) {
            const game = this.games.get(connection.gameId);
            if (game) this.broadcastGameState(game);
          }
          break;

        case 'bomb':
          if (!connection) return;
          const bombResult = this.bomb(connection.gameId, connection.playerId, message.x, message.y);
          ws.send(JSON.stringify({ type: 'bombResult', ...bombResult }));
          break;

        case 'getGameState':
          if (!connection) return;
          const game = this.games.get(connection.gameId);
          if (game) this.broadcastGameState(game);
          break;

        case 'chat':
          if (!connection) return;
          const chatGame = this.games.get(connection.gameId);
          if (chatGame) this.handleChat(chatGame, connection.playerId, message.text);
          break;

        case 'leaveGame':
          this.leaveGame(ws);
          ws.send(JSON.stringify({ type: 'leftGame', success: true }));
          break;

        default:
          console.log(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error(`Error handling message:`, error);
      ws.send(JSON.stringify({ type: 'error', message: 'Server error occurred' }));
    }
  }

  private handleChat(game: GameState, playerId: number, text: string): void {
    const player = game.players[playerId];
    if (!player || !text || text.length > 200) return;

    const chatMessage = {
      type: 'chat',
      playerId,
      playerName: player.name,
      text: text.trim(),
      timestamp: Date.now()
    };

    game.players.forEach(p => {
      if (p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(JSON.stringify(chatMessage));
      }
    });

    console.log(`${player.name}: ${text}`);
  }

  removePlayer(ws: WebSocket): void {
    this.leaveGame(ws);
    this.removeConnection(ws);
  }

  private cleanupOldGames(): void {
    const now = Date.now();
    const maxAge = 2 * 60 * 60 * 1000; // 2 hours

    this.games.forEach((game, gameId) => {
      const gameAge = now - game.createdAt;
      const hasActivePlayers = game.players.some(p => p.ws.readyState === WebSocket.OPEN);

      if (gameAge > maxAge || !hasActivePlayers) {
        console.log(`Cleaning up old/inactive game: ${gameId}`);
        this.games.delete(gameId);
        this.broadcastGameRemoved(gameId);
      }
    });
  }

  getGameStats(): { totalGames: number; activePlayers: number; totalConnections: number } {
    let activePlayers = 0;
    this.games.forEach(game => {
      activePlayers += game.players.filter(p => p.ws.readyState === WebSocket.OPEN).length;
    });

    return {
      totalGames: this.games.size,
      activePlayers,
      totalConnections: this.allConnections.size
    };
  }
}

// HTTP Server for static files
function createHttpServer(): http.Server {
  return http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
      filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.woff': 'application/font-woff',
      '.ttf': 'application/font-ttf',
      '.eot': 'application/vnd.ms-fontobject',
      '.otf': 'application/font-otf',
      '.wasm': 'application/wasm'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
      if (error) {
        if (error.code === 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: Arial; text-align: center; background: #1a1a1a; color: white; padding: 50px;">
                <h1>Fog of Tank</h1>
                <h2>404 - File Not Found</h2>
                <p>The game client file is missing. Please ensure index.html is in the same directory.</p>
                <a href="/" style="color: #ff6b35;">Return to Game</a>
              </body>
            </html>
          `, 'utf-8');
        } else {
          res.writeHead(500);
          res.end(`Server Error: ${error.code}\n`);
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });
}

// Main Server Setup
function startServer(): void {
  const server = createHttpServer();
  const wss = new WebSocketServer({ server });
  const gameManager = new GameManager();

  wss.on('connection', (ws: WebSocket) => {
    gameManager.addConnection(ws);

    ws.on('message', (data: string) => {
      try {
        const message: GameMessage = JSON.parse(data);
        gameManager.handleMessage(ws, message);
      } catch (error) {
        console.error('Error parsing message:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      gameManager.removePlayer(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  // Periodic stats logging
  setInterval(() => {
    const stats = gameManager.getGameStats();
    console.log(`Server Stats - Games: ${stats.totalGames}, Players: ${stats.activePlayers}, Connections: ${stats.totalConnections}`);
  }, 60000); // Every minute

  server.listen(PORT, () => {
    console.log(`Fog of Tank server running on port ${PORT}`);
    console.log(`Game available at http://localhost:${PORT}`);
    console.log(`Ready for tank battles!`);
    console.log(`Features: Custom room IDs, real-time broadcasting, auto-matchmaking`);
  });
}

// Start the server
if (require.main === module) {
  startServer();
}

export { GameManager, Utils, CellState, GamePhase };

