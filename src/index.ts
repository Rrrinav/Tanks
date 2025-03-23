const FPS            = 60;
const FRAME_DURATION = 1000 / FPS;
const GRID_WIDTH     = 15;
const GRID_HEIGHT    = 15;
const DEBUG          = false;

const CANVAS = document.getElementById("canvas") as HTMLCanvasElement;
const ctx2D  = CANVAS.getContext("2d") as CanvasRenderingContext2D;
const ctxGL  = CANVAS.getContext("webgl2") as WebGL2RenderingContext;

let lastTime    = 0;
let elapsedTime = 0;

class Grid {
  public readonly width: number;
  public readonly height: number;
  public readonly player: number;
  public cellSize: number = 0;
  public xOffset: number  = 0;
  public yOffset: number  = 0;
  public readonly map: number[][];

  constructor(player: number) {
    this.width = GRID_WIDTH;
    this.height = GRID_HEIGHT;
    this.player = player;
    this.map = Array.from({ length: this.height }, () => Array(this.width).fill(0));
    this.computeDimensions();
  }

  computeDimensions(): void {
    const mapHeight = CANVAS.width * 0.05; // Top bar height
    this.cellSize = Math.min(CANVAS.width / (2 * this.width), CANVAS.height / this.height);

    const gridHeight = this.height * this.cellSize;
    const gridWidth  = this.width * this.cellSize;

    this.xOffset = this.player === 1
      ? (CANVAS.width - 2 * gridWidth) / 2
      : CANVAS.width / 2;
    this.yOffset = (CANVAS.height - gridHeight) / 2 + mapHeight;
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

// Create grid instances
let p1Grid = new Grid(1);
let p2Grid = new Grid(2);

const resizeCanvas = (): void => {
  CANVAS.width = window.innerWidth;
  CANVAS.height = window.innerHeight;

  p1Grid.computeDimensions();
  p2Grid.computeDimensions();
};

const drawMap = (): void => {
  const mapHeight = CANVAS.width * 0.05;
  const gradient = ctx2D.createLinearGradient(0, 0, CANVAS.width, mapHeight);
  gradient.addColorStop(0, "#444");
  gradient.addColorStop(1, "#222");

  ctx2D.fillStyle = gradient;
  ctx2D.fillRect(0, 0, CANVAS.width, mapHeight);
  ctx2D.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx2D.lineWidth = 3;
  ctx2D.strokeRect(0, 0, CANVAS.width, mapHeight);
  ctx2D.font = "bold 30px 'Fira Code', monospace";
  ctx2D.textAlign = "center";
  ctx2D.fillStyle = "white";
  ctx2D.fillText("Fog of Tank", CANVAS.width / 2, mapHeight / 2 + 10);

  // Draw both grids
  p1Grid.draw();
  p2Grid.draw();

  // Divider line
  ctx2D.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx2D.lineWidth = 3;
  ctx2D.beginPath();
  ctx2D.moveTo(CANVAS.width / 2, mapHeight);
  ctx2D.lineTo(CANVAS.width / 2, CANVAS.height);
  ctx2D.stroke();
};

// Image loading function
const loadImage = (path: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.src = path;
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${path}`));
  });
};

// Image variable
let image: HTMLImageElement = new Image();

const render = (): void => {
  ctx2D.clearRect(0, 0, CANVAS.width, CANVAS.height);
  drawMap();

  const { x, y } = p1Grid.getCellPosition(0, 0);
  const imgSize = p1Grid.cellSize - 5;
  const rotationAngle = -Math.PI / 2; // Rotate 90 degrees counterclockwise

  ctx2D.save(); // Save current state
  ctx2D.translate(x + imgSize / 2, y + imgSize / 2); // Move to center
  ctx2D.rotate(rotationAngle); // Rotate 90° left
  ctx2D.drawImage(image, -imgSize / 2, -imgSize / 2, imgSize, imgSize); // Draw image
  ctx2D.restore(); // Restore original state
};

const update = (dt: number): void => {};

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
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  image = await loadImage("../assets/PNG/Hulls_Color_A/Hull_01.png");
  CANVAS.style.backgroundColor = "black";
  requestAnimationFrame(mainLoop);
};

main();
