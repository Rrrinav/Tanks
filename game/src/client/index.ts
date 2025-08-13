// Types and interfaces
interface GameState {
  myBoard: number[][];
  enemyBoard: number[][];
  players: Player[];
  phase: GamePhase;
  currentTurn: string;
  myTanks: number;
  enemyTanks: number;
}

interface Player {
  id: string;
  name: string;
  tanksAlive: number;
}

interface GameInfo {
  id: string;
  playerCount: number;
  maxPlayers: number;
  players: Player[];
  phase: GamePhase;
  canJoin: boolean;
}

interface ServerMessage {
  type: string;
  [key: string]: any;
}

interface ChatMessage {
  playerName: string;
  text: string;
}

interface SelectedCell {
  x: number;
  y: number;
}

type GamePhase = 'waiting' | 'placement' | 'battle' | 'gameover';

enum CellState {
  EMPTY = 0,
  TANK = 1,
  HIT = 2,
  MISS = 3,
  REVEALED = 4
}

class FogOfTankClient {
  ws: WebSocket | null = null;
  private gameState: GameState | null = null;
  private boardSize: number = 6;
  private cellSize: number = 80;
  private tanksPerPlayer: number = 3;
  private selectedCell: SelectedCell | null = null;
  private gamePhase: GamePhase = 'waiting';
  private isMyTurn: boolean = false;
  private playerId: string | null = null;
  gameId: string | null = null;

  private gameCanvas!: HTMLCanvasElement;
  private enemyCanvas!: HTMLCanvasElement;
  private gameCtx!: CanvasRenderingContext2D;
  private enemyCtx!: CanvasRenderingContext2D;

  constructor() {
    this.initializeCanvases();
    this.connectWebSocket();
  }

  private initializeCanvases(): void {
    this.gameCanvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    this.enemyCanvas = document.getElementById('enemyCanvas') as HTMLCanvasElement;

    const gameCtx = this.gameCanvas.getContext('2d');
    const enemyCtx = this.enemyCanvas.getContext('2d');

    if (!gameCtx || !enemyCtx) {
      throw new Error('Could not get canvas contexts');
    }

    this.gameCtx = gameCtx;
    this.enemyCtx = enemyCtx;

    // Set up click handlers
    this.gameCanvas.addEventListener('click', (e: MouseEvent) => { this.handleGameBoardClick(e) });
    this.enemyCanvas.addEventListener('click', (e: MouseEvent) => this.handleEnemyBoardClick(e));

    // Set up chat input
    const chatInput = document.getElementById('chatInput') as HTMLInputElement;
    chatInput.addEventListener('keypress', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        this.sendChat();
      }
    });
  }

  private connectWebSocket(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = "ws://localhost:3000"; // Fixed the protocol

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('Connected to game server');
      this.requestServerStats();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      const message: ServerMessage = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.ws.onclose = () => {
      console.log('Disconnected from server');
      this.showError('Connection lost. Trying to reconnect...');
      setTimeout(() => this.connectWebSocket(), 3000);
    };

    this.ws.onerror = (error: Event) => {
      console.error('WebSocket error:', error);
    };
  }

  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'serverStats':
        this.handleServerStats(message);
        break;
      case 'gamesList':
        this.displayGamesList(message.games as GameInfo[]);
        break;
      case 'roomCreated':
        this.handleRoomCreated(message);
        break;
      case 'joined':
        this.handleJoined(message);
        break;
      case 'gameState':
        this.handleGameState(message as GameState & { type: string });
        break;
      case 'placeTankResult':
        this.handlePlaceTankResult(message);
        break;
      case 'bombResult':
        this.handleBombResult(message);
        break;
      case 'chat':
        this.handleChat(message as ChatMessage & { type: string });
        break;
      case 'playerDisconnected':
        this.handlePlayerDisconnected(message);
        break;
      case 'leftGame':
        this.handleLeftGame(message);
        break;
      case 'newGame':
      case 'gameUpdate':
      case 'gameRemoved':
        // Auto-refresh games list if we're on browse screen
        const browseGamesMenu = document.getElementById('browseGamesMenu') as HTMLElement;
        if (browseGamesMenu.style.display !== 'none') {
          this.requestGamesList();
        }
        break;
    }
  }

  private handleServerStats(message: ServerMessage): void {
    if (message.gamesList) {
      this.displayGamesList(message.gamesList as GameInfo[]);
    }
  }

  private handleRoomCreated(message: ServerMessage): void {
    const messagesDiv = document.getElementById('createRoomMessages') as HTMLElement;
    if (message.success) {
      messagesDiv.innerHTML = `
        <div class="success-message">
          Room created! ID: <strong>${message.gameId}</strong><br>
          <button class="button" onclick="game.joinCreatedRoom('${message.gameId}')">Join Room</button>
        </div>
      `;
    } else {
      messagesDiv.innerHTML = `<div class="error-message">${message.error}</div>`;
    }
  }

  private handleJoined(message: ServerMessage): void {
    if (message.success) {
      this.gameId = message.gameId;
      this.playerId = message.playerId;
      this.boardSize = message.boardSize;
      this.tanksPerPlayer = message.tanksPerPlayer;

      const playerNameElement = document.getElementById('playerName') as HTMLElement;
      playerNameElement.textContent = message.playerName;
      this.showGameArea();
      this.clearMessages();
    } else {
      this.showError(message.error);
    }
  }

  private handleGameState(message: GameState & { type: string }): void {
    this.gameState = message;
    this.gamePhase = message.phase;
    this.isMyTurn = message.currentTurn === this.playerId;

    this.updateUI();
    this.drawBoards();
  }

  private handlePlaceTankResult(message: ServerMessage): void {
    if (!message.success) {
      this.showError('Cannot place tank there!');
    }
  }

  private handleBombResult(message: ServerMessage): void {
    this.showMessage(message.result);
    if (message.gameOver) {
      this.showMessage('🎉 Game Over! ' + message.result);
    }
  }

  private handleChat(message: ChatMessage & { type: string }): void {
    const chatMessages = document.getElementById('chatMessages') as HTMLElement;
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    messageDiv.innerHTML = `<strong>${message.playerName}:</strong> ${message.text}`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  private handlePlayerDisconnected(message: ServerMessage): void {
    this.showMessage(`${message.playerName} disconnected`);
  }

  private handleLeftGame(message: ServerMessage): void {
    if (message.success) {
      this.showMainMenu();
      this.gameState = null;
      this.gameId = null;
      this.playerId = null;
    }
  }

  // Canvas drawing methods
  private drawBoards(): void {
    if (!this.gameState) return;

    this.drawBoard(this.gameCtx, this.gameState.myBoard, true);
    this.drawBoard(this.enemyCtx, this.gameState.enemyBoard, false);
  }

  private drawBoard(ctx: CanvasRenderingContext2D, board: number[][], isMyBoard: boolean): void {
    ctx.clearRect(0, 0, this.gameCanvas.width, this.gameCanvas.height);

    // Draw grid
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;

    for (let i = 0; i <= this.boardSize; i++) {
      ctx.beginPath();
      ctx.moveTo(i * this.cellSize, 0);
      ctx.lineTo(i * this.cellSize, this.boardSize * this.cellSize);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i * this.cellSize);
      ctx.lineTo(this.boardSize * this.cellSize, i * this.cellSize);
      ctx.stroke();
    }

    // Draw coordinates
    ctx.fillStyle = '#ccc';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';

    // Column labels (A-F)
    for (let x = 0; x < this.boardSize; x++) {
      ctx.fillText(
        String.fromCharCode(65 + x),
        x * this.cellSize + this.cellSize / 2,
        -5
      );
    }

    // Row labels (1-6)
    ctx.textAlign = 'right';
    for (let y = 0; y < this.boardSize; y++) {
      ctx.fillText(
        (y + 1).toString(),
        -5,
        y * this.cellSize + this.cellSize / 2 + 5
      );
    }

    // Draw cells
    for (let y = 0; y < this.boardSize; y++) {
      for (let x = 0; x < this.boardSize; x++) {
        const cellState = board[y][x];
        this.drawCell(ctx, x, y, cellState, isMyBoard);
      }
    }

    // Highlight selected cell
    if (this.selectedCell && isMyBoard) {
      ctx.strokeStyle = '#ff6b35';
      ctx.lineWidth = 3;
      ctx.strokeRect(
        this.selectedCell.x * this.cellSize + 2,
        this.selectedCell.y * this.cellSize + 2,
        this.cellSize - 4,
        this.cellSize - 4
      );
    }
  }

  private drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, cellState: number, isMyBoard: boolean): void {
    const cellX = x * this.cellSize;
    const cellY = y * this.cellSize;

    ctx.fillStyle = this.getCellColor(cellState, isMyBoard);
    ctx.fillRect(cellX + 1, cellY + 1, this.cellSize - 2, this.cellSize - 2);

    // Draw cell symbol
    const symbol = this.getCellSymbol(cellState);
    if (symbol) {
      ctx.fillStyle = '#fff';
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(
        symbol,
        cellX + this.cellSize / 2,
        cellY + this.cellSize / 2 + 8
      );
    }
  }

  private getCellColor(cellState: number, isMyBoard: boolean): string {
    switch (cellState) {
      case CellState.TANK:
        return isMyBoard ? '#4CAF50' : '#f44336';
      case CellState.HIT:
        return '#FF9800';
      case CellState.MISS:
        return '#2196F3';
      case CellState.REVEALED:
        return '#666';
      default:
        return '#2a2a2a';
    }
  }

  private getCellSymbol(cellState: number): string {
    switch (cellState) {
      case CellState.TANK:
        return '🚗';
      case CellState.HIT:
        return '💥';
      case CellState.MISS:
        return '💦';
      default:
        return '';
    }
  }

  // Event handlers
  private handleGameBoardClick(event: MouseEvent): void {
    const rect = this.gameCanvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / this.cellSize);
    const y = Math.floor((event.clientY - rect.top) / this.cellSize);

    if (this.gamePhase === 'placement') {
      // Check if player has already placed all tanks
      const myPlayer = this.gameState?.players?.find(p => p.id === this.playerId);
      if (myPlayer && myPlayer.tanksAlive >= this.tanksPerPlayer) {
        this.showMessage('You have already placed all your tanks!');
        return;
      }
      if (x >= 0 && x < this.boardSize && y >= 0 && y < this.boardSize) {
        this.placeTank(x, y);
      }
    } else if (this.gamePhase === 'battle' ) {
    }
  }

  private handleEnemyBoardClick(event: MouseEvent): void {
    if (this.gamePhase !== 'battle' || !this.isMyTurn) return;

    const rect = this.enemyCanvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / this.cellSize);
    const y = Math.floor((event.clientY - rect.top) / this.cellSize);

    if (x >= 0 && x < this.boardSize && y >= 0 && y < this.boardSize) {
      this.bomb(x, y);
    }
  }

  // Game actions
  private placeTank(x: number, y: number): void {
    this.sendMessage({
      type: 'placeTank',
      x: x,
      y: y
    });
  }

  private bomb(x: number, y: number): void {
    this.sendMessage({
      type: 'bomb',
      x: x,
      y: y
    });
  }

  public sendChat(): void {
    const input = document.getElementById('chatInput') as HTMLInputElement;
    const text = input.value.trim();

    if (text) {
      this.sendMessage({
        type: 'chat',
        text: text
      });
      input.value = '';
    }
  }

  // UI methods
  private updateUI(): void {
    if (!this.gameState) return;

    // Update phase indicator
    const phaseIndicator = document.getElementById('phaseIndicator') as HTMLElement;
    phaseIndicator.className = `phase-indicator phase-${this.gamePhase}`;

    switch (this.gamePhase) {
      case 'waiting':
        phaseIndicator.textContent = 'Waiting for players...';
        break;
      case 'placement':
        phaseIndicator.textContent = 'Place your tanks!';
        break;
      case 'battle':
        phaseIndicator.textContent = 'Battle Phase!';
        break;
      case 'gameover':
        phaseIndicator.textContent = 'Game Over';
        break;
    }

    // Update player info
    const enemyPlayer = this.gameState.players.find(p => p.id !== this.playerId);
    if (enemyPlayer) {
      const enemyNameElement = document.getElementById('enemyName') as HTMLElement;
      const enemyTanksElement = document.getElementById('enemyTanks') as HTMLElement;
      enemyNameElement.textContent = enemyPlayer.name;
      enemyTanksElement.textContent = this.gameState.enemyTanks.toString();
    }

    const playerTanksElement = document.getElementById('playerTanks') as HTMLElement;
    playerTanksElement.textContent = this.gameState.myTanks.toString();

    // Update turn indicator
    const turnIndicator = document.getElementById('turnIndicator') as HTMLElement;
    if (this.gamePhase === 'battle') {
      if (this.isMyTurn) {
        turnIndicator.textContent = 'Your Turn - Click enemy board to bomb!';
        turnIndicator.className = 'turn-indicator your-turn';
      } else {
        turnIndicator.textContent = `${enemyPlayer?.name || 'Enemy'}'s Turn`;
        turnIndicator.className = 'turn-indicator enemy-turn';
      }
    } else if (this.gamePhase === 'placement') {
      const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
      const tanksPlaced = myPlayer ? myPlayer.tanksAlive : 0;
      turnIndicator.textContent = `Place tanks: ${tanksPlaced}/${this.tanksPerPlayer}`;

      if (tanksPlaced >= this.tanksPerPlayer) {
        turnIndicator.textContent = 'Waiting for opponent to finish placing tanks...';
      }

      turnIndicator.className = 'turn-indicator waiting-turn';
    } else {
      turnIndicator.textContent = 'Waiting...';
      turnIndicator.className = 'turn-indicator waiting-turn';
    }
  }

  public showMainMenu(): void {
    this.setElementDisplay('mainMenu', 'block');
    this.setElementDisplay('createRoomMenu', 'none');
    this.setElementDisplay('joinRoomMenu', 'none');
    this.setElementDisplay('browseGamesMenu', 'none');
    this.setElementDisplay('gameArea', 'none');
  }

  private showGameArea(): void {
    this.setElementDisplay('mainMenu', 'none');
    this.setElementDisplay('createRoomMenu', 'none');
    this.setElementDisplay('joinRoomMenu', 'none');
    this.setElementDisplay('browseGamesMenu', 'none');
    this.setElementDisplay('gameArea', 'grid');
  }

  private setElementDisplay(id: string, display: string): void {
    const element = document.getElementById(id) as HTMLElement;
    element.style.display = display;
  }

  showError(message: string): void {
    const activeMenus = ['createRoomMessages', 'joinRoomMessages', 'browseGamesMessages'];
    for (const menuId of activeMenus) {
      const element = document.getElementById(menuId) as HTMLElement;
      if (element && element.parentElement!.style.display !== 'none') {
        element.innerHTML = `<div class="error-message">${message}</div>`;
        return;
      }
    }
    console.error(message);
  }

  private showMessage(message: string): void {
    // Simple toast-like message system
    const existingToast = document.getElementById('messageToast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'messageToast';
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0,0,0,0.9);
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      border: 2px solid #ff6b35;
      z-index: 1000;
      max-width: 300px;
      font-weight: bold;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast && toast.parentNode) {
        toast.remove();
      }
    }, 4000);
  }

  public clearMessages(): void {
    const messageIds = ['createRoomMessages', 'joinRoomMessages', 'browseGamesMessages'];
    messageIds.forEach(id => {
      const element = document.getElementById(id) as HTMLElement;
      if (element) element.innerHTML = '';
    });
  }

  private displayGamesList(games: GameInfo[]): void {
    const gamesList = document.getElementById('gamesList') as HTMLElement;
    if (!games || games.length === 0) {
      gamesList.innerHTML = '<div style="padding: 20px; text-align: center; color: #ccc;">No games available</div>';
      return;
    }

    gamesList.innerHTML = games.map(game => `
      <div class="game-item ${!game.canJoin ? 'full' : ''}" ${game.canJoin ? `onclick="game.joinGameFromList('${game.id}')"` : ''}>
        <div class="game-id">Room: ${game.id}</div>
        <div class="game-players">
          Players: ${game.playerCount}/${game.maxPlayers}
          ${game.players.map(p => p.name).join(', ')}
        </div>
        <div style="margin-top: 5px; color: #ccc; font-size: 0.9em;">
          Status: ${game.phase === 'waiting' ? 'Waiting for players' :
        game.phase === 'placement' ? 'Placing tanks' :
          game.phase === 'battle' ? 'In battle' : 'Game over'}
        </div>
      </div>
    `).join('');
  }

  // WebSocket communication
  sendMessage(message: Record<string, any>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.showError('Connection lost. Please refresh the page.');
    }
  }

  private requestServerStats(): void {
    this.sendMessage({ type: 'getServerStats' });
  }

  public requestGamesList(): void {
    this.sendMessage({ type: 'getGamesList' });
  }

  // Menu actions
  public joinCreatedRoom(gameId: string): void {
    const playerNameElement = document.getElementById('playerNameCreate') as HTMLInputElement;
    const playerName = playerNameElement.value.trim();
    if (!playerName) {
      this.showError('Please enter your name');
      return;
    }

    this.sendMessage({
      type: 'join',
      gameId: gameId,
      playerName: playerName
    });
  }

  public joinGameFromList(gameId: string): void {
    const playerNameElement = document.getElementById('playerNameBrowse') as HTMLInputElement;
    const playerName = playerNameElement.value.trim();
    if (!playerName) {
      this.showError('Please enter your name first');
      return;
    }

    this.sendMessage({
      type: 'join',
      gameId: gameId,
      playerName: playerName
    });
  }
}

// Global game instance
let game: FogOfTankClient;

// Initialize game when page loads
window.addEventListener('load', () => {
  game = new FogOfTankClient();
  (window as any).game = game;

  // Expose global functions
  (window as any).showMainMenu = () => {
    game.showMainMenu();
    game.clearMessages();
  };

  (window as any).showCreateRoomMenu = () => {
    const mainMenu = document.getElementById('mainMenu') as HTMLElement;
    const createRoomMenu = document.getElementById('createRoomMenu') as HTMLElement;
    mainMenu.style.display = 'none';
    createRoomMenu.style.display = 'block';
    game.clearMessages();
  };

  (window as any).showJoinRoomMenu = () => {
    const mainMenu = document.getElementById('mainMenu') as HTMLElement;
    const joinRoomMenu = document.getElementById('joinRoomMenu') as HTMLElement;
    mainMenu.style.display = 'none';
    joinRoomMenu.style.display = 'block';
    game.clearMessages();
  };

  (window as any).showBrowseGames = () => {
    const mainMenu = document.getElementById('mainMenu') as HTMLElement;
    const browseGamesMenu = document.getElementById('browseGamesMenu') as HTMLElement;
    mainMenu.style.display = 'none';
    browseGamesMenu.style.display = 'block';
    game.clearMessages();
    game.requestGamesList();
  };

  (window as any).createRoom = () => {
    const playerNameElement = document.getElementById('playerNameCreate') as HTMLInputElement;
    const customRoomIdElement = document.getElementById('customRoomId') as HTMLInputElement;
    const playerName = playerNameElement.value.trim();
    const customRoomId = customRoomIdElement.value.trim();

    if (!playerName) {
      game.showError('Please enter your name');
      return;
    }

    game.sendMessage({
      type: 'createRoom',
      customRoomId: customRoomId || undefined
    });
  };

  (window as any).joinRoom = () => {
    const playerNameElement = document.getElementById('playerNameJoin') as HTMLInputElement;
    const roomIdElement = document.getElementById('roomIdJoin') as HTMLInputElement;
    const playerName = playerNameElement.value.trim();
    const roomId = roomIdElement.value.trim();

    if (!playerName || !roomId) {
      game.showError('Please enter both your name and room ID');
      return;
    }

    game.sendMessage({
      type: 'join',
      gameId: roomId,
      playerName: playerName
    });
  };

  (window as any).refreshGamesList = () => {
    game.requestGamesList();
  };

  (window as any).quickMatch = () => {
    const playerName = prompt('Enter your name:');
    if (!playerName) return;

    game.sendMessage({
      type: 'join',
      playerName: playerName
    });
  };

  (window as any).leaveGame = () => {
    if (confirm('Are you sure you want to leave the game?')) {
      game.sendMessage({ type: 'leaveGame' });
    }
  };

  (window as any).sendChat = () => {
    game.sendChat();
  };
});

// Handle page visibility change
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && game && game.gameId) {
    game.sendMessage({ type: 'getGameState' });
  }
});

// Handle window beforeunload
window.addEventListener('beforeunload', () => {
  if (game && game.ws && game.gameId) {
    game.sendMessage({ type: 'leaveGame' });
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    const gameArea = document.getElementById('gameArea') as HTMLElement;
    if (gameArea.style.display !== 'none') {
      if (confirm('Return to main menu?')) {
        (window as any).leaveGame();
      }
    }
  }
});

export { };
