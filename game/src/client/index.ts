import { Socket } from "dgram";

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
type ActionState = 'attack' | 'move';

enum CellState {
  EMPTY = 0,
  TANK = 1,
  HIT = 2,
  MISS = 3,
  REVEALED = 4
}

interface Image {
  id: string;
  image: HTMLImageElement;
}

interface ImageAsset {
  id: string;
  path: string;
}


class AssetsManager {
  private images: Image[] = [];

  constructor() {
    console.log("AssetsManager initialized.");
  }

  loadImage(id: string, path: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const imageElement = new Image();
      imageElement.src = path;

      imageElement.onload = () => {
        this.images.push({ id, image: imageElement });
        console.log(`Image loaded successfully: ${id} from ${path}`);
        resolve(imageElement);
      };
      imageElement.onerror = () => {
        console.error(`Failed to load image: ${id} from ${path}`);
        reject(new Error(`Failed to load image: ${id}`));
      };
    });
  }

  getImage(id: string): HTMLImageElement | null {
    const found = this.images.find(asset => asset.id === id);
    return found ? found.image : null;
  }

  preloadAssets(imageAssets: ImageAsset[]): Promise<void> {
    console.log("Starting asset preloading...");

    const imagePromises = imageAssets.map(asset => this.loadImage(asset.id, asset.path));

    return Promise.all(imagePromises)
      .then(() => {
        console.log("All assets preloaded successfully!");
      })
      .catch(error => {
        console.error("Failed to preload all assets:", error);
        throw error;
      });
  }
}


class FogOfTankClient {
  private ws: WebSocket | null = null;
  private gameState: GameState | null = null;
  private boardSize: number = 8;
  private cellSize: number = 50;
  private tanksPerPlayer: number = 3;
  private selectedCell: SelectedCell | null = null;
  private selectedTankCell: SelectedCell | null = null;
  private gamePhase: GamePhase = 'waiting';
  private isMyTurn: boolean = false;
  private playerId: string | null = null;
  private actionState: ActionState = 'attack';
  private assetManager: AssetsManager;
  private gameId: string | null = null;

  private gameCanvas!: HTMLCanvasElement;
  private enemyCanvas!: HTMLCanvasElement;
  private gameCtx!: CanvasRenderingContext2D;
  private enemyCtx!: CanvasRenderingContext2D;

  constructor() {
    const images: ImageAsset[] = [
      { id: "myHull", path: "../../assets/tanks/PNG/Hulls_Color_A/Hull_02.png" },
      { id: "enemyHull", path: "../../assets/tanks/PNG/Hulls_Color_B/Hull_01.png" },
      { id: "myWeapon", path: "../../assets/tanks/PNG/Weapon_Color_A_256X256/Gun_06.png" },
      { id: "enemyWeapon", path: "../../assets/tanks/PNG/Weapon_Color_B_256X256/Gun_01.png" },
      { id: "mist", path: "../../assets/mist.png" },
      { id: "grave", path: "../../assets/grave.png" },
      { id: "damaged", path: "../../assets/damaged.png" },
      { id: "non-damaged", path: "../../assets/non-damaged.png" }
    ]
    this.initializeCanvases();
    this.connectWebSocket();
    this.assetManager = new AssetsManager();
    this.assetManager.preloadAssets(images);
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
    const wsUrl = "ws://localhost:3000";

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
      case 'moveTankResult':
        this.handleMoveResult(message);
        if (message.success) {
          this.resetSelection()
        }
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

      let idInfo = document.getElementById("game-id-info") as HTMLElement;
      idInfo.innerHTML = `(id: ${this.gameId})`;

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
      const turnIndicator = document.getElementById('turnIndicator') as HTMLElement;
      turnIndicator.textContent = message.result;
    }
    // Reset selection after action
    this.resetSelection();
  }

  private handleMoveResult(message: ServerMessage): void {
    if (message.success) {
      this.showMessage('Tank moved successfully!');
    } else {
      this.showError(message.error || 'Cannot move tank there!');
    }
    // Reset selection after action
    this.resetSelection();
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
      this.resetSelection();
    }
  }

  // Canvas drawing methods
  drawBoards(): void {
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

    // Highlight selected tank (source for move)
    if (this.selectedTankCell && isMyBoard) {
      ctx.strokeStyle = '#ff6b35';
      ctx.lineWidth = 4;
      ctx.strokeRect(
        this.selectedTankCell.x * this.cellSize + 2,
        this.selectedTankCell.y * this.cellSize + 2,
        this.cellSize - 4,
        this.cellSize - 4
      );
    }

    // Show valid move positions if in move mode and tank is selected
    if (this.actionState === 'move' && this.selectedTankCell && isMyBoard) {
      this.highlightValidMoves(ctx, this.selectedTankCell.x, this.selectedTankCell.y, board);
    }
  }

  private highlightValidMoves(ctx: CanvasRenderingContext2D, tankX: number, tankY: number, board: number[][]): void {
    const moves = [
      { x: tankX - 1, y: tankY },     // Left
      { x: tankX - 2, y: tankY },     // Left + 1
      { x: tankX + 1, y: tankY },     // Right
      { x: tankX + 2, y: tankY },     // Right + 1
      { x: tankX, y: tankY - 1 }, // Up
      { x: tankX, y: tankY - 2 }, // Up + 1
      { x: tankX, y: tankY + 1 },  // Down
      { x: tankX, y: tankY + 2 },  // Down + 1
      { x: tankX + 1, y: tankY + 1 },
      { x: tankX - 1, y: tankY - 1 },
      { x: tankX - 1, y: tankY + 1 },
      { x: tankX + 1, y: tankY - 1 },
    ];

    ctx.fillStyle = 'rgba(76, 175, 80, 0.3)'; // Semi-transparent green
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 2;

    moves.forEach(move => {
      if (this.isValidMove(move.x, move.y, board)) {
        const cellX = move.x * this.cellSize;
        const cellY = move.y * this.cellSize;

        ctx.fillRect(cellX + 1, cellY + 1, this.cellSize - 2, this.cellSize - 2);
        ctx.strokeRect(cellX + 1, cellY + 1, this.cellSize - 2, this.cellSize - 2);
      }
    });
  }

  private isValidMove(x: number, y: number, board: number[][]): boolean {
    // Check bounds
    if (x < 0 || x >= this.boardSize || y < 0 || y >= this.boardSize) {
      return false;
    }

    // Check if cell is empty
    return board[y][x] === CellState.EMPTY;
  }

  private drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, cellState: number, isMyBoard: boolean): void {
    const cellX = x * this.cellSize;
    const cellY = y * this.cellSize;

    const ground = this.assetManager.getImage("non-damaged");
    if (ground && isMyBoard && cellState !== CellState.HIT)
      ctx.drawImage(ground, cellX + 1, cellY + 1, this.cellSize - 1, this.cellSize - 1);

    // Set the fill style for the cell background
    const cellImage = this.getCellImage(cellState, isMyBoard);
    if (cellImage)
      ctx.drawImage(cellImage, cellX + 1, cellY + 1, this.cellSize - 1, this.cellSize - 1);

    if (cellState === CellState.TANK) {
      const ground = this.assetManager.getImage("non-damaged");
      if (ground && !isMyBoard)
        ctx.drawImage(ground, cellX, cellY, this.cellSize, this.cellSize);

      // Check if the tank images are loaded before drawing
      const hullImage = isMyBoard ? this.assetManager.getImage('myHull') : this.assetManager.getImage('enemyHull');
      const weaponImage = isMyBoard ? this.assetManager.getImage('myWeapon') : this.assetManager.getImage('enemyWeapon');

      if (hullImage && weaponImage) {
        // Calculate the scaling factor to fit the image inside the cell
        const scale = Math.min(this.cellSize / hullImage.width, this.cellSize / hullImage.height);
        const scaledWidth = hullImage.width * scale;
        const scaledHeight = hullImage.height * scale;

        // Save the current canvas state before applying transformations
        ctx.save();
        // Move the origin to the center of the cell for rotation
        ctx.translate(cellX + this.cellSize / 2, cellY + this.cellSize / 2);

        // Apply the rotation based on which board it is
        if (isMyBoard) {
          ctx.rotate(Math.PI / 2); // Rotate 90 degrees (pi/2 radians)
        } else {
          ctx.rotate(-(Math.PI / 2)); // Rotate -90 degrees (-pi/2 radians)
        }

        // Draw the hull and weapon relative to the new origin (0,0)
        // The images are centered by subtracting half their scaled width and height
        ctx.drawImage(hullImage, -scaledWidth / 2, -scaledHeight / 2, scaledWidth, scaledHeight);

        // Cleaned up weapon drawing logic without changing the original offsets
        // These are hardcoded offsets relative to the hull's top-left corner
        ctx.drawImage(weaponImage, -scaledWidth / 2, -scaledHeight / 2, weaponImage.width * scale, weaponImage.height * scale);

        // Restore the canvas state to remove the transformations
        ctx.restore();
      }
    } else {
      // Draw other symbols as before
    }
  }

  private getCellImage(cellState: number, isMyBoard: boolean): HTMLImageElement | null {
    switch (cellState) {
      case CellState.HIT:
        return this.assetManager.getImage("grave");
      case CellState.MISS:
        return this.assetManager.getImage("damaged");
      case CellState.REVEALED:
        return this.assetManager.getImage("non-damaged");
      default:
        if (!isMyBoard) return this.assetManager.getImage("mist");
        else return null;
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
    } else if (this.gamePhase === 'battle' && this.isMyTurn) {
      if (x >= 0 && x < this.boardSize && y >= 0 && y < this.boardSize) {
        this.handleBattlePhaseClick(x, y);
      }
    }
  }

  private handleBattlePhaseClick(x: number, y: number): void {
    if (!this.gameState) return;

    const cellState = this.gameState.myBoard[y][x];

    if (this.actionState === 'attack') {
      if (cellState === CellState.TANK) {
        this.selectedTankCell = { x, y };
        this.toggleActionMode()
        this.drawBoards();
      }
    } else if (this.actionState === 'move') {
      if (cellState === CellState.TANK && this.selectedTankCell) {
        if (x === this.selectedTankCell.x && y === this.selectedTankCell.y) { // Toggle move mode if clicked itself
          this.showMessage("Move mode disabled");
          this.selectedTankCell = null;
          this.toggleActionMode()
          this.drawBoards();
        } else { // Select other tank if clicked on other tank
          this.selectedTankCell = { x, y };
          this.showMessage("Another tank selected to move");
          this.drawBoards();
        }
      } else if (cellState === CellState.EMPTY && this.selectedTankCell) {
        // Try to move selected tank to this empty cell
        if (this.isValidMovePosition(x, y)) {
          this.moveTank(this.selectedTankCell.x, this.selectedTankCell.y, x, y);
          this.drawBoards();
        } else {
          this.showError('You can only move to highlighted empty cells!');
        }
      }
    }
  }

  private isValidMovePosition(targetX: number, targetY: number): boolean {
    if (!this.selectedTankCell || !this.gameState) return false;

    const { x: fromX, y: fromY } = this.selectedTankCell;

    const dx = Math.abs(targetX - fromX);
    const dy = Math.abs(targetY - fromY);

    // Allow up to 2 steps in straight lines
    if ((dx <= 2 && dy === 0) || (dy <= 2 && dx === 0)) {
      return true;
    }

    // Allow exactly 1 step diagonally
    if (dx === 1 && dy === 1) {
      return true;
    }

    return false;
  }

  private handleEnemyBoardClick(event: MouseEvent): void {
    if (this.gamePhase !== 'battle' || !this.isMyTurn) return;

    const rect = this.enemyCanvas.getBoundingClientRect();

    // Get the actual canvas dimensions
    const canvasWidth = this.enemyCanvas.width;
    const canvasHeight = this.enemyCanvas.height;

    // Calculate the actual cell size based on canvas dimensions
    const actualCellWidth = canvasWidth / this.boardSize;
    const actualCellHeight = canvasHeight / this.boardSize;

    // Get relative position within the canvas
    const relativeX = event.clientX - rect.left;
    const relativeY = event.clientY - rect.top;

    // Account for canvas scaling (display size vs actual size)
    const scaleX = canvasWidth / rect.width;
    const scaleY = canvasHeight / rect.height;

    // Calculate the grid coordinates
    const x = Math.floor((relativeX * scaleX) / actualCellWidth);
    const y = Math.floor((relativeY * scaleY) / actualCellHeight);

    // Validate coordinates
    if (x >= 0 && x < this.boardSize && y >= 0 && y < this.boardSize) {
      if (this.actionState === 'attack') {
        console.log(`Bombing at (${x}, ${y})`); // Debug log
        this.bomb(x, y);
      } else {
        this.showMessage('Switch to Attack mode to bomb enemy positions!');
      }
    } else {
      console.log(`Invalid coordinates: (${x}, ${y}), canvas: ${canvasWidth}x${canvasHeight}, rect: ${rect.width}x${rect.height}`);
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

  private moveTank(fromX: number, fromY: number, toX: number, toY: number): void {
    this.sendMessage({
      type: 'moveTank',
      fromX: fromX,
      fromY: fromY,
      toX: toX,
      toY: toY
    });
  }

  public toggleActionMode(): void {
    if (this.gamePhase !== 'battle') return;

    this.actionState = this.actionState === 'attack' ? 'move' : 'attack';
    this.updateUI();
    this.drawBoards();
  }

  resetSelection(): void {
    this.selectedCell = null;
    this.selectedTankCell = null;
    this.actionState = 'attack';
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

    // Update turn indicator and action mode
    const turnIndicator = document.getElementById('turnIndicator') as HTMLElement;
    if (this.gamePhase === 'battle') {
      if (this.isMyTurn) {
        const actionText = this.actionState === 'attack' ? 'Attack Mode - Click enemy board to bomb!' : 'Move Mode - click highlighted cell to move or tank cell to disable';
        turnIndicator.textContent = `Your Turn - ${actionText}`;
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
    } else if (this.gamePhase === 'gameover') {
    } else {
      turnIndicator.textContent = 'Waiting...';
      turnIndicator.className = 'turn-indicator waiting-turn';
    }

    // Update action mode button
    const actionButton = document.getElementById('actionModeButton') as HTMLButtonElement;
    if (actionButton) {
      if (this.gamePhase === 'battle' && this.isMyTurn) {
        actionButton.style.display = 'inline-block';
        actionButton.textContent = this.actionState === 'attack' ? 'Switch to Move' : 'Switch to Attack';
        actionButton.className = `button ${this.actionState === 'attack' ? 'attack-mode' : 'move-mode'}`;
      } else {
        actionButton.style.display = 'none';
      }
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

  public getActionState(): ActionState { return this.actionState; }
  public getGameID(): string | null { return this.gameId; }
  public getWs(): WebSocket | null { return this.ws; }
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

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (game.getActionState() === 'move') {
        game.resetSelection();
        game.drawBoards();
        return;
      }
      const gameArea = document.getElementById('gameArea') as HTMLElement;
      if (gameArea.style.display !== 'none') {
        if (confirm('Return to main menu?')) {
          (window as any).leaveGame();
        }
      }
    }
  });
});

// Handle page visibility change
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && game && game.getGameID()) {
    game.sendMessage({ type: 'getGameState' });
  }
});

// Handle window beforeunload
window.addEventListener('beforeunload', () => {
  if (game && game.getWs() && game.getGameID()) {
    game.sendMessage({ type: 'leaveGame' });
  }
});

export { };
