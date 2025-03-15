let lastTime         = 0;
let elapsedTime      = 0;
const FPS            = 60;
const FRAME_DURATION = 1000 / FPS;
const GRID_SIZE      = 20;
const GRID_WIDTH     = 20;
const GRID_HEIGHT    = 20;

const CANVAS = document.getElementById('canvas') as HTMLCanvasElement;
const ctx    = CANVAS.getContext('2d') as CanvasRenderingContext2D;

function resizeCanvas(): void {
  CANVAS.width  = window.innerWidth;
  CANVAS.height = window.innerHeight;
}

function drawGrid(xOffset = 0, yOffset = 0, width = GRID_WIDTH, height = GRID_HEIGHT): void {
  ctx.lineWidth   = 1;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  const cellSize  = Math.min(CANVAS.width / (2 * GRID_WIDTH), CANVAS.height / GRID_HEIGHT);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const xPos = xOffset + x * cellSize;
      const yPos = yOffset + y * cellSize;
      ctx.strokeRect(xPos, yPos, cellSize, cellSize);
    }
  }
}

function drawMap(): void {
  // Top bar
  const mapHeight = CANVAS.width * 0.05;
  const gradient  = ctx.createLinearGradient(0, 0, CANVAS.width, mapHeight);

  gradient.addColorStop(0, "#444");
  gradient.addColorStop(1, "#222");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS.width, mapHeight);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, CANVAS.width, mapHeight);

  ctx.font = "bold 30px 'Fira Code', monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "white";
  ctx.fillText("Fog of Tank", CANVAS.width / 2, mapHeight / 2 + 10);

  const cellSize   = Math.min(CANVAS.width / (2 * GRID_WIDTH), CANVAS.height / GRID_HEIGHT);
  const gridHeight = GRID_HEIGHT * cellSize;
  const gridWidth  = GRID_WIDTH * cellSize;

  const xOffset    = (CANVAS.width - 2 * gridWidth) / 2;
  const yOffset    = (CANVAS.height - gridHeight) / 2 + mapHeight;

  // Left player grid
  drawGrid(xOffset, yOffset);
  // Right player grid with empty space on the right
  drawGrid(CANVAS.width / 2, yOffset);

  console.log("xOffset", xOffset);
  console.log("something", CANVAS.width / 2 - gridWidth + xOffset);

  // Divider line
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(CANVAS.width / 2, mapHeight);
  ctx.lineTo(CANVAS.width / 2, CANVAS.height);
  ctx.stroke();
}

function render(): void {
  ctx.clearRect(0, 0, CANVAS.width, CANVAS.height);
  drawMap();
}

function update(dt: number): void {}

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

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
CANVAS.style.backgroundColor = "black";
requestAnimationFrame(mainLoop);
