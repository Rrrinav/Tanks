let lastTime = 0;
let elapsedTime = 0;
const FPS = 60;
const FRAME_DURATION = 1000 / FPS;
const GRID_SIZE = 50;

const CANVAS = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = CANVAS.getContext('2d') as CanvasRenderingContext2D;

function resizeCanvas(): void {
  CANVAS.width = window.innerWidth;
  CANVAS.height = window.innerHeight;
}

function drawGrid(xOffset = 0, yOffset = 0, width = CANVAS.width, height = CANVAS.height): void {
  for (let x = xOffset; x < xOffset + width; x += GRID_SIZE) {
    for (let y = yOffset; y < yOffset + height; y += GRID_SIZE) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.strokeRect(x, y, GRID_SIZE, GRID_SIZE);
    }
  }
}

function drawMap(): void {
  // Top bar
  const mapHeight = CANVAS.width * 0.05;
  const gradient = ctx.createLinearGradient(0, 0, CANVAS.width, mapHeight);
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

  // Middle part
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  const middle = CANVAS.width * 0.5;
  ctx.moveTo(middle, mapHeight);
  ctx.lineTo(middle, CANVAS.height);
  ctx.stroke();

  // Grids for both parts
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 1;
  drawGrid(0, mapHeight, middle - GRID_SIZE, CANVAS.height);
  drawGrid(middle, mapHeight, CANVAS.width - GRID_SIZE, CANVAS.height);
}

function render(): void {
  ctx.clearRect(0, 0, CANVAS.width, CANVAS.height);
  drawMap();
}

function update(dt: number): void {

}


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
