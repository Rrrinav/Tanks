let lastTime         = 0;
let elapsedTime      = 0;
const FPS            = 60;
const FRAME_DURATION = 1000 / FPS;
const GRID_WIDTH     = 20;
const GRID_HEIGHT    = 20;
const DEBUG          = true;

const CANVAS = document.getElementById('canvas') as HTMLCanvasElement;
const ctx2D  = CANVAS.getContext('2d') as CanvasRenderingContext2D;
const ctxGL  = CANVAS.getContext('webgl2') as WebGL2RenderingContext;

var p1Map: Array<Array<number>> = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(0));
var p2Map: Array<Array<number>> = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(0));

function resizeCanvas(): void {
  CANVAS.width  = window.innerWidth;
  CANVAS.height = window.innerHeight;
}

function drawGrid(xOffset = 0, yOffset = 0, width = GRID_WIDTH, height = GRID_HEIGHT): void {
  ctx2D.lineWidth   = 1;
  ctx2D.strokeStyle = "rgba(255, 255, 255, 0.2)";
  const cellSize    = Math.min(CANVAS.width / (2 * GRID_WIDTH), CANVAS.height / GRID_HEIGHT);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const xPos = xOffset + x * cellSize;
      const yPos = yOffset + y * cellSize;
      ctx2D.strokeRect(xPos, yPos, cellSize, cellSize);
      if (DEBUG) {
        ctx2D.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx2D.font = "bold 10px 'Fira Code', monospace";
        const text = x.toString() + "," + y.toString();
        ctx2D.fillText(text, xPos + 15, yPos + 15);
      }
    }
  }
}

function drawMap(): void {
  // Top bar
  const mapHeight = CANVAS.width * 0.05;
  const gradient  = ctx2D.createLinearGradient(0, 0, CANVAS.width, mapHeight);

  gradient.addColorStop(0, "#444");
  gradient.addColorStop(1, "#222");

  ctx2D.fillStyle = gradient;
  ctx2D.fillRect(0, 0, CANVAS.width, mapHeight);

  ctx2D.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx2D.lineWidth   = 3;
  ctx2D.strokeRect(0, 0, CANVAS.width, mapHeight);

  ctx2D.font      = "bold 30px 'Fira Code', monospace";
  ctx2D.textAlign = "center";
  ctx2D.fillStyle = "white";
  ctx2D.fillText("Fog of Tank", CANVAS.width / 2, mapHeight / 2 + 10);

  const cellSize   = Math.min(CANVAS.width / (2 * GRID_WIDTH), CANVAS.height / GRID_HEIGHT);
  const gridHeight = GRID_HEIGHT * cellSize;
  const gridWidth  = GRID_WIDTH * cellSize;

  const xOffset = (CANVAS.width - 2 * gridWidth) / 2;
  const yOffset = (CANVAS.height - gridHeight) / 2 + mapHeight;

  // Left player grid
  drawGrid(xOffset, yOffset);
  // Right player grid with empty space on the right
  drawGrid(CANVAS.width / 2, yOffset);

  console.log("xOffset", xOffset);
  console.log("something", CANVAS.width / 2 - gridWidth + xOffset);

  // Divider line
  ctx2D.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx2D.lineWidth = 3;
  ctx2D.beginPath();
  ctx2D.moveTo(CANVAS.width / 2, mapHeight);
  ctx2D.lineTo(CANVAS.width / 2, CANVAS.height);
  ctx2D.stroke();
}

function render(): void {
  ctx2D.clearRect(0, 0, CANVAS.width, CANVAS.height);
  drawMap();
}

function update(dt: number): void { }

function mainLoop(timestamp: number): void {
  requestAnimationFrame(mainLoop);

  const deltaTime = timestamp - lastTime;

  if (deltaTime >= FRAME_DURATION) {
    lastTime = timestamp - (deltaTime % FRAME_DURATION); // Smooth time correction
    elapsedTime += deltaTime;
    update(deltaTime);
    render();
  }
}

function main(): void {
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  CANVAS.style.backgroundColor = "black";
  requestAnimationFrame(mainLoop);
}
main();
