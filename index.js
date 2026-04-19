const socket = io();
const gameContainer = document.getElementById("game");
const messageDisplay = document.createElement("div");
messageDisplay.id = "message-display";
document.body.insertBefore(messageDisplay, gameContainer);

// Game state variables
let gameState = Array(9)
  .fill(null)
  .map(() => Array(9).fill(null));
let boardStatus = Array(9).fill(null);
let currentPlayer = "X";
let activeBoard = null;
let playerRole = null; // "X", "O", or "spectator"
let gameActive = true;

// Create the 9x9 grid of boards and cells
function createGameBoard() {
  gameContainer.innerHTML = "";
  for (let boardIndex = 0; boardIndex < 9; boardIndex++) {
    const board = document.createElement("div");
    board.className = "board";

    board.dataset.index = boardIndex;

    for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.index = cellIndex;
      cell.addEventListener("click", () =>
        handleCellClick(boardIndex, cellIndex),
      );
      board.appendChild(cell);
    }

    gameContainer.appendChild(board);
  }
}

// Handle cell clicks with validation
function handleCellClick(boardIndex, cellIndex) {
  // Block moves if:
  // 1. Game is not active
  // 2. Player is a spectator
  // 3. It's not the player's turn
  if (
    !gameActive ||
    playerRole === "spectator" ||
    playerRole !== currentPlayer
  ) {
    return;
  }

  // Emit move to server
  socket.emit("make-move", { boardIndex, cellIndex });
}

// Render the entire game state
function renderGame(state) {
  gameState = state.gameState;
  boardStatus = state.boardStatus;
  currentPlayer = state.currentPlayer;
  activeBoard = state.activeBoard;
  gameActive = !state.gameOver;

  // Update message display
  if (state.message) {
    messageDisplay.textContent = state.message;
    messageDisplay.className = state.gameOver ? "game-over" : "turn-message";
  }

  // Update all boards and cells
  const boards = document.querySelectorAll(".board");
  boards.forEach((board, bIndex) => {
    const cells = board.querySelectorAll(".cell");
    const boardStatusClass = boardStatus[bIndex]
      ? `won-${boardStatus[bIndex].toLowerCase()}`
      : "";

    // Remove all classes first
    board.className = "board";
    if (boardStatusClass) {
      board.classList.add(boardStatusClass);
    }

    // Highlight active board
    if (activeBoard === bIndex && gameActive) {
      board.classList.add("active");
    }

    // Update each cell in the board
    cells.forEach((cell, cIndex) => {
      const cellValue = gameState[bIndex][cIndex];
      cell.textContent = cellValue || "";
      cell.className = "cell";
      if (cellValue === "X") cell.classList.add("x");
      if (cellValue === "O") cell.classList.add("o");
    });

    // Add big symbol if board is won/drawn
    const existingBigSymbol = board.querySelector(".big-symbol");
    if (boardStatus[bIndex]) {
      if (!existingBigSymbol) {
        const bigSymbol = document.createElement("div");
        bigSymbol.className = "big-symbol";
        bigSymbol.textContent =
          boardStatus[bIndex] === "draw" ? "•" : boardStatus[bIndex];
        board.appendChild(bigSymbol);
      }
    } else if (existingBigSymbol) {
      existingBigSymbol.remove();
    }
  });
  console.log(gameState);
}

// Socket event listeners
socket.on("game-state", (state) => {
  renderGame(state);
});

socket.on("role-assigned", (role) => {
  playerRole = role;
  messageDisplay.textContent = `You are ${role === "spectator" ? "a spectator" : role}.`;
  messageDisplay.className = "role-message";
});

socket.on("game-message", ({ text, type }) => {
  messageDisplay.textContent = text;
  messageDisplay.className =
    type === "error" ? "error-message" : "info-message";
});

socket.on("invalid-move", (message) => {
  messageDisplay.textContent = message;
  messageDisplay.className = "error-message";
});

socket.on("game-full", (message) => {
  messageDisplay.textContent = message;
  messageDisplay.className = "error-message";
});

// Initialize the game
createGameBoard();
