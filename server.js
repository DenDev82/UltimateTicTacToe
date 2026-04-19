const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
app.use(express.static(__dirname));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Game state structure:
// - gameState: 9x9 grid (9 small boards, each with 9 cells)
// - boardStatus: Tracks winner of each small board ("X", "O", or "draw")
// - currentPlayer: "X" or "O"
// - activeBoard: Index of the board where the next move must be played (null = any board)
let game = createNewGame();
const players = {}; // Maps socket IDs to "X" or "O"
let gameActive = true;

function createNewGame() {
  return {
    gameState: Array(9)
      .fill(null)
      .map(() => Array(9).fill(null)),
    boardStatus: Array(9).fill(null),
    currentPlayer: "X",
    activeBoard: null,
  };
}

// Checks if a player has won a 3x3 board
function checkWin(board) {
  const winPatterns = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8], // Rows
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8], // Columns
    [0, 4, 8],
    [2, 4, 6], // Diagonals
  ];

  for (const [a, b, c] of winPatterns) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a]; // Returns "X" or "O"
    }
  }
  return null;
}

// Checks if a 3x3 board is completely filled
function isBoardFull(board) {
  return board.every((cell) => cell !== null);
}

// Checks if the entire game is over (all small boards won/drawn)
function isGameOver() {
  return game.boardStatus.every((status) => status !== null);
}

io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Assign roles: First player is X, second is O, others are spectators
  if (!Object.values(players).includes("X")) {
    players[socket.id] = "X";
    socket.emit("role-assigned", "X");
    socket.emit("game-message", {
      text: "You are X. Waiting for opponent...",
      type: "info",
    });
  } else if (!Object.values(players).includes("O")) {
    players[socket.id] = "O";
    socket.emit("role-assigned", "O");
    io.emit("game-message", {
      text: "Opponent joined! X's turn.",
      type: "info",
    });
  } else {
    socket.emit("game-full", "Game is full. You are a spectator.");
    socket.emit("role-assigned", "spectator");
    return;
  }

  // Send initial game state
  socket.emit("game-state", {
    ...game,
    message: gameActive ? `${game.currentPlayer}'s turn` : "Game over",
    yourRole: players[socket.id],
  });

  // Handle player moves
  socket.on("make-move", ({ boardIndex, cellIndex }) => {
    // --- VALIDATION ---
    // 1. Game must be active
    if (!gameActive) {
      socket.emit("invalid-move", "Game is already over.");
      return;
    }

    // 2. Must be the player's turn
    if (players[socket.id] !== game.currentPlayer) {
      socket.emit("invalid-move", "Not your turn!");
      return;
    }

    // 3. Move must be in the active board (or any board if activeBoard is null)
    if (game.activeBoard !== null && game.activeBoard !== boardIndex) {
      socket.emit(
        "invalid-move",
        `You must play in board ${game.activeBoard + 1}`,
      );
      return;
    }

    // 4. Cell must be empty
    if (game.gameState[boardIndex][cellIndex] !== null) {
      socket.emit("invalid-move", "Cell already taken!");
      return;
    }

    // 5. Small board must not already be won/drawn
    if (game.boardStatus[boardIndex] !== null) {
      socket.emit("invalid-move", "This board is already finished!");
      return;
    }

    // --- EXECUTE MOVE ---
    game.gameState[boardIndex][cellIndex] = game.currentPlayer;

    // Check if this move won the small board
    const smallBoardWinner = checkWin(game.gameState[boardIndex]);
    if (smallBoardWinner) {
      game.boardStatus[boardIndex] = smallBoardWinner;
    } else if (isBoardFull(game.gameState[boardIndex])) {
      game.boardStatus[boardIndex] = "draw";
    }

    // Check if this move won the entire game
    const gameWinner = checkWin(game.boardStatus);
    if (gameWinner) {
      gameActive = false;
      io.emit("game-state", {
        ...game,
        message: `Player ${gameWinner} wins the game!`,
        gameOver: true,
      });
      setTimeout(() => {
        game = createNewGame();
        gameActive = true;
        io.emit("game-state", {
          ...game,
          message: "New game started! X's turn.",
          gameOver: false,
        });
      }, 3000);
      return;
    } else if (isGameOver()) {
      gameActive = false;
      io.emit("game-state", {
        ...game,
        message: "Game ended in a draw!",
        gameOver: true,
      });
      setTimeout(() => {
        game = createNewGame();
        gameActive = true;
        io.emit("game-state", {
          ...game,
          message: "New game started! X's turn.",
          gameOver: false,
        });
      }, 3000);
      return;
    }

    // Switch player and set active board for next move
    game.currentPlayer = game.currentPlayer === "X" ? "O" : "X";
    game.activeBoard = game.boardStatus[cellIndex] === null ? cellIndex : null;

    // Broadcast updated state to all players
    io.emit("game-state", {
      ...game,
      message: `${game.currentPlayer}'s turn`,
      gameOver: false,
    });
  });

  // Handle disconnections
  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);
    if (players[socket.id] === "X" || players[socket.id] === "O") {
      const disconnectedPlayer = players[socket.id];
      delete players[socket.id];
      gameActive = false;
      io.emit("game-message", {
        text: `Player ${disconnectedPlayer} disconnected! Game aborted.`,
        type: "error",
      });
      setTimeout(() => {
        game = createNewGame();
        gameActive = true;
        io.emit("game-state", {
          ...game,
          message: "Game reset. Waiting for players...",
          gameOver: false,
        });
      }, 3000);
    }
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
