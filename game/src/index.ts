const FPS = 60;
const FRAME_DURATION = 1000 / FPS;
const GRID_WIDTH = 18;
const GRID_HEIGHT = 15;
const DEBUG = true;

// Fixed design resolution
const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;

const CANVAS = document.getElementById("canvas") as HTMLCanvasElement;
const ctx2D = CANVAS.getContext("2d") as CanvasRenderingContext2D;

let lastTime = 0;
let elapsedTime = 0;
let scale = 1; // Scale factor for rendering

// Asset Manager for centralized resource loading
class AssetManager {
  private static instance: AssetManager;
  private assets: Map<string, HTMLImageElement> = new Map();
  private loadPromises: Promise<void>[] = [];

  private constructor() { }

  public static getInstance(): AssetManager {
    if (!AssetManager.instance) {
      AssetManager.instance = new AssetManager();
    }
    return AssetManager.instance;
  }

  public loadImage(key: string, path: string): void {
    const promise = new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.src = path;
      image.onload = () => {
        this.assets.set(key, image);
        resolve();
      };
      image.onerror = () => reject(new Error(`Failed to load image: ${path}`));
    });
    this.loadPromises.push(promise);
  }

  public getImage(key: string): HTMLImageElement {
    const image = this.assets.get(key);
    if (!image) {
      throw new Error(`Image not found: ${key}`);
    }
    return image;
  }

  public async waitForAllAssets(): Promise<void> {
    try {
      await Promise.all(this.loadPromises);
      console.log("All assets loaded successfully");
    } catch (error) {
      console.error("Failed to load assets:", error);
    }
  }
}

// Direction enum for tank orientation
enum Direction {
  UP = 0,
  RIGHT = Math.PI / 2,
  DOWN = Math.PI,
  LEFT = Math.PI * 3 / 2
}

class Grid {
  public readonly width: number;
  public height: number;
  public readonly player: number;
  public cellSize: number = 0;
  public xOffset: number = 0;
  public yOffset: number = 0;
  public readonly map: number[][];

  constructor(player: number) {
    this.width = GRID_WIDTH;
    this.height = GRID_HEIGHT;
    this.player = player;
    this.map = Array.from({ length: this.height }, () => Array(this.width).fill(0));
    this.computeDimensions();
  }

  computeDimensions(): void {
    const mapHeight = DESIGN_WIDTH * 0.05; // Top bar height
    this.cellSize = Math.min(DESIGN_WIDTH / (2 * this.width), DESIGN_HEIGHT / this.height);

    const gridWidth = this.width * this.cellSize;

    this.xOffset = this.player === 1
      ? (DESIGN_WIDTH - 2 * gridWidth) / 2
      : DESIGN_WIDTH / 2;
    this.yOffset = mapHeight;
  }

  getCellPosition(gridX: number, gridY: number): { x: number; y: number } {
    if (gridX < 0 || gridX >= this.width || gridY < 0 || gridY >= this.height) {
      throw new Error("Invalid grid coordinates");
    }
    return {
      x: this.xOffset + gridX * this.cellSize,
      y: this.yOffset + gridY * this.cellSize
    };
  }

  draw(): void {
    ctx2D.lineWidth = 1;
    ctx2D.strokeStyle = "rgba(255, 255, 255, 0.2)";

    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const { x: xPos, y: yPos } = this.getCellPosition(x, y);
        ctx2D.strokeRect(xPos, yPos, this.cellSize, this.cellSize);

        if (DEBUG) {
          ctx2D.fillStyle = "rgba(255, 255, 255, 0.4)";
          ctx2D.font = "bold 10px 'Fira Code', monospace";
          ctx2D.fillText(`${x},${y}`, xPos + 15, yPos + 15);
        }
      }
    }
  }
}

// Tank class to handle tank rendering and movement
class Tank {
  private grid: Grid;
  private x: number;
  private y: number;
  private direction: Direction;

  constructor(grid: Grid, x: number = 0, y: number = 0, direction: Direction = Direction.UP) {
    this.grid = grid;
    this.x = x;
    this.y = y;
    this.direction = direction;
  }

  public getPosition(): { x: number, y: number } {
    return { x: this.x, y: this.y };
  }

  public setPosition(x: number, y: number): void {
    if (x >= 0 && x < this.grid.width && y >= 0 && y < this.grid.height) {
      this.x = x;
      this.y = y;
    }
  }

  public setDirection(direction: Direction): void {
    this.direction = direction;
  }

  public move(dx: number, dy: number): void {
    const newX = this.x + dx;
    const newY = this.y + dy;

    // Update direction based on movement
    if (dx > 0) this.direction = Direction.RIGHT;
    else if (dx < 0) this.direction = Direction.LEFT;
    else if (dy > 0) this.direction = Direction.DOWN;
    else if (dy < 0) this.direction = Direction.UP;

    // Move if within bounds
    if (newX >= 0 && newX < this.grid.width && newY >= 0 && newY < this.grid.height) {
      this.x = newX;
      this.y = newY;
    }
  }

  public draw(): void {
    const assetManager = AssetManager.getInstance();
    const hull = assetManager.getImage("hull");
    const track = assetManager.getImage("track");
    const weapon = assetManager.getImage("weapon");

    const { x, y } = this.grid.getCellPosition(this.x, this.y);
    const cellSize = this.grid.cellSize;
    const tankSize = cellSize * 0.9; // Make tank slightly smaller than cell

    // Center of the cell
    const centerX = x + cellSize / 2;
    const centerY = y + cellSize / 2;

    ctx2D.save(); // Save current state
    ctx2D.translate(centerX, centerY); // Move to center of the cell
    ctx2D.rotate(this.direction); // Rotate according to direction

    // Draw tracks first (they should be behind the hull)
    const trackWidth = tankSize * 0.25;
    const trackHeight = tankSize * 0.8;
    ctx2D.drawImage(track, -trackWidth * 1.25, -trackHeight / 2, trackWidth, trackHeight);
    ctx2D.drawImage(track, trackWidth * 0.25, -trackHeight / 2, trackWidth, trackHeight);

    // Draw hull on top of tracks
    const hullSize = tankSize * 0.7;
    ctx2D.drawImage(hull, -hullSize / 2, -hullSize / 2, hullSize, hullSize);

    // Draw weapon on top of hull
    const weaponWidth = tankSize * 0.3;
    const weaponHeight = tankSize * 0.6;
    ctx2D.drawImage(weapon, -weaponWidth / 2, -weaponHeight / 2, weaponWidth, weaponHeight);

    ctx2D.restore(); // Restore original state
  }
}

// Create grid instances
let p1Grid = new Grid(1);
let p2Grid = new Grid(2);

// Create tank instances
let p1Tank = new Tank(p1Grid, 0, 0, Direction.DOWN);
let p2Tank = new Tank(p2Grid, 0, 0, Direction.DOWN);

const resizeCanvas = (): void => {
  // Set the canvas size to match the window
  CANVAS.width = window.innerWidth;
  CANVAS.height = window.innerHeight;

  // Calculate scale factor to fit the design resolution
  const widthRatio = window.innerWidth / DESIGN_WIDTH;
  const heightRatio = window.innerHeight / DESIGN_HEIGHT;

  // Use the smaller ratio to ensure entire game is visible
  scale = Math.min(widthRatio, heightRatio);

  // Set canvas CSS to scale while maintaining aspect ratio
  const scaledWidth = Math.floor(DESIGN_WIDTH * scale);
  const scaledHeight = Math.floor(DESIGN_HEIGHT * scale);

  // Center the canvas
  const leftMargin = Math.max(0, Math.floor((window.innerWidth - scaledWidth) / 2));
  const topMargin = Math.max(0, Math.floor((window.innerHeight - scaledHeight) / 2));

  CANVAS.style.width = `${scaledWidth}px`;
  CANVAS.style.height = `${scaledHeight}px`;
  CANVAS.style.position = 'absolute';
  CANVAS.style.left = `${leftMargin}px`;
  CANVAS.style.top = `${topMargin}px`;

  // Set actual canvas dimensions to design resolution for consistent rendering
  CANVAS.width = DESIGN_WIDTH;
  CANVAS.height = DESIGN_HEIGHT;

  // No need to recompute grid dimensions since they're based on fixed design values
};

const drawMap = (): void => {
  const mapHeight = DESIGN_WIDTH * 0.05;
  const gradient = ctx2D.createLinearGradient(0, 0, DESIGN_WIDTH, mapHeight);
  gradient.addColorStop(0, "#444");
  gradient.addColorStop(1, "#222");

  ctx2D.fillStyle = gradient;
  ctx2D.fillRect(0, 0, DESIGN_WIDTH, mapHeight);
  ctx2D.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx2D.lineWidth = 3;
  ctx2D.strokeRect(0, 0, DESIGN_WIDTH, mapHeight);
  ctx2D.font = "bold 30px 'Fira Code', monospace";
  ctx2D.textAlign = "center";
  ctx2D.fillStyle = "white";
  ctx2D.fillText("Fog of Tank", DESIGN_WIDTH / 2, mapHeight / 2 + 10);

  // Draw both grids
  p1Grid.draw();
  p2Grid.draw();

  // Divider line
  ctx2D.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx2D.lineWidth = 3;
  ctx2D.beginPath();
  ctx2D.moveTo(DESIGN_WIDTH / 2, mapHeight);
  ctx2D.lineTo(DESIGN_WIDTH / 2, DESIGN_HEIGHT);
  ctx2D.stroke();
};

// Convert screen coordinates to design coordinates for input handling
const convertToDesignCoordinates = (clientX: number, clientY: number): { x: number, y: number } => {
  const rect = CANVAS.getBoundingClientRect();
  const x = (clientX - rect.left) / scale;
  const y = (clientY - rect.top) / scale;
  return { x, y };
};

// Setup keyboard controls
const setupControls = (): void => {
  window.addEventListener("keydown", (event) => {
    switch (event.key) {
      // Player 1 controls
      case "w":
        p1Tank.move(0, -1);
        break;
      case "a":
        p1Tank.move(-1, 0);
        break;
      case "s":
        p1Tank.move(0, 1);
        break;
      case "d":
        p1Tank.move(1, 0);
        break;

      // Player 2 controls
      case "ArrowUp":
        p2Tank.move(0, -1);
        break;
      case "ArrowLeft":
        p2Tank.move(-1, 0);
        break;
      case "ArrowDown":
        p2Tank.move(0, 1);
        break;
      case "ArrowRight":
        p2Tank.move(1, 0);
        break;
    }
  });

  // Add touch controls for mobile
  CANVAS.addEventListener("touchstart", (event) => {
    event.preventDefault(); // Prevent scrolling
    const touch = event.touches[0];
    const { x, y } = convertToDesignCoordinates(touch.clientX, touch.clientY);

    // Determine which half of the screen was touched to identify player
    if (x < DESIGN_WIDTH / 2) {
      // Player 1 side - implement touch controls later if needed
    } else {
      // Player 2 side - implement touch controls later if needed
    }
  });
};

const render = (): void => {
  ctx2D.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

  // Fill background
  ctx2D.fillStyle = "black";
  ctx2D.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

  drawMap();

  // Draw tanks
  p1Tank.draw();
  p2Tank.draw();
};

const update = (dt: number): void => {
  // Game logic updates here
};

const mainLoop = (timestamp: number): void => {
  requestAnimationFrame(mainLoop);

  const deltaTime = timestamp - lastTime;
  if (deltaTime >= FRAME_DURATION) {
    lastTime = timestamp - (deltaTime % FRAME_DURATION); // Smooth time correction
    elapsedTime += deltaTime;
    update(deltaTime);
    render();
  }
};

const main = async (): Promise<void> => {
  // Add an outer container div for the canvas
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.overflow = 'hidden';
  container.style.backgroundColor = 'black';
  document.body.appendChild(container);
  container.appendChild(CANVAS);

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // Initialize asset manager
  const assetManager = AssetManager.getInstance();

  // Load assets
  assetManager.loadImage("hull", "../assets/PNG/Hulls_Color_A/Hull_01.png");
  assetManager.loadImage("track", "../assets/PNG/Tracks/Track_1_A.png");
  assetManager.loadImage("weapon", "../assets/PNG/Weapon_Color_A/Gun_01.png");

  // Wait for all assets to load
  await assetManager.waitForAllAssets();

  // Set initial tank positions (center of bottom row)
  p1Tank.setPosition(Math.floor(GRID_WIDTH / 2), GRID_HEIGHT - 1);
  p2Tank.setPosition(Math.floor(GRID_WIDTH / 2), GRID_HEIGHT - 1);

  // Setup controls
  setupControls();

  requestAnimationFrame(mainLoop);
};

// Add a CSS reset to ensure consistent behavior across browsers
const style = document.createElement('style');
style.textContent = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  body, html {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background-color: black;
  }
`;
document.head.appendChild(style);

main();
