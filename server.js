const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Настройка CORS для Socket.io
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Раздача статических файлов
app.use(express.static(path.join(__dirname, 'public')));

// Для всех маршрутов отдаем index.html (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Хранилище данных
const lobbies = new Map();

// Вопросы для викторины
const QUESTIONS = [
  {
    id: 0,
    text: "Столица Франции?",
    options: ["Лондон", "Берлин", "Париж", "Мадрид"],
    correct: 2
  },
  {
    id: 1,
    text: "2 + 2 = ?",
    options: ["3", "4", "5", "6"],
    correct: 1
  },
  {
    id: 2,
    text: "Какая планета известна как 'Красная планета'?",
    options: ["Венера", "Марс", "Юпитер", "Сатурн"],
    correct: 1
  },
  {
    id: 3,
    text: "Кто написал 'Войну и мир'?",
    options: ["Достоевский", "Тургенев", "Толстой", "Чехов"],
    correct: 2
  },
  {
    id: 4,
    text: "Сколько континентов на Земле?",
    options: ["5", "6", "7", "8"],
    correct: 2
  },
  {
    id: 5,
    text: "Какой язык программирования используется для создания этого сайта?",
    options: ["Python", "Java", "JavaScript", "C++"],
    correct: 2
  }
];

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // Создание лобби
  socket.on('createLobby', (playerName) => {
    const code = generateCode();
    const lobby = {
      code,
      players: [{ id: socket.id, name: playerName, score: 0 }],
      gameStarted: false,
      currentQuestion: 0,
      answers: new Map(),
      creatorId: socket.id
    };
    lobbies.set(code, lobby);
    socket.join(code);
    console.log(`🎮 Lobby created: ${code} by ${playerName}`);
    socket.emit('lobbyCreated', { code, players: lobby.players });
  });

  // Присоединение к лобби
  socket.on('joinLobby', ({ code, playerName }) => {
    const lobby = lobbies.get(code);
    
    if (!lobby) {
      socket.emit('error', 'Лобби не найдено');
      return;
    }
    
    if (lobby.gameStarted) {
      socket.emit('error', 'Игра уже началась');
      return;
    }
    
    if (lobby.players.some(p => p.name === playerName)) {
      socket.emit('error', 'Игрок с таким именем уже есть в лобби');
      return;
    }
    
    lobby.players.push({ id: socket.id, name: playerName, score: 0 });
    socket.join(code);
    console.log(`✅ ${playerName} joined lobby ${code}`);
    
    socket.emit('joinedLobby', { code, players: lobby.players });
    io.to(code).emit('playersUpdate', lobby.players);
  });

  // Начало игры
  socket.on('startGame', (code) => {
    const lobby = lobbies.get(code);
    if (!lobby) return;
    
    if (lobby.players.length < 2) {
      io.to(code).emit('error', 'Нужно минимум 2 игрока для начала игры');
      return;
    }
    
    lobby.gameStarted = true;
    lobby.currentQuestion = 0;
    lobby.answers.clear();
    
    io.to(code).emit('gameStarting', { questions: QUESTIONS });
    startQuestion(code);
  });

  // Ответ на вопрос
  socket.on('answer', ({ code, questionId, answerIndex, time }) => {
    const lobby = lobbies.get(code);
    if (!lobby) return;
    
    if (lobby.answers.has(socket.id)) {
      return;
    }
    
    const question = QUESTIONS[questionId];
    const isCorrect = question.correct === answerIndex;
    const player = lobby.players.find(p => p.id === socket.id);
    
    if (player && isCorrect) {
      const points = Math.max(1000 - Math.floor(time * 10), 100);
      player.score += points;
    }
    
    lobby.answers.set(socket.id, isCorrect);
    
    if (lobby.answers.size === lobby.players.length) {
      nextQuestion(code);
    }
  });

  function startQuestion(code) {
    const lobby = lobbies.get(code);
    if (!lobby) return;
    
    lobby.answers.clear();
    const question = QUESTIONS[lobby.currentQuestion];
    
    io.to(code).emit('newQuestion', {
      question: question,
      questionNumber: lobby.currentQuestion + 1,
      totalQuestions: QUESTIONS.length
    });
    
    const timer = setTimeout(() => {
      const currentLobby = lobbies.get(code);
      if (currentLobby && currentLobby.answers.size < currentLobby.players.length) {
        nextQuestion(code);
      }
    }, 10000);
    
    lobby.timer = timer;
  }
  
  function nextQuestion(code) {
    const lobby = lobbies.get(code);
    if (!lobby) return;
    
    if (lobby.timer) {
      clearTimeout(lobby.timer);
      lobby.timer = null;
    }
    
    lobby.currentQuestion++;
    
    if (lobby.currentQuestion >= QUESTIONS.length) {
      endGame(code);
    } else {
      setTimeout(() => startQuestion(code), 2000);
    }
  }
  
  function endGame(code) {
    const lobby = lobbies.get(code);
    if (!lobby) return;
    
    const sortedPlayers = [...lobby.players].sort((a, b) => b.score - a.score);
    io.to(code).emit('gameEnded', { players: sortedPlayers });
    
    setTimeout(() => {
      if (lobbies.has(code)) {
        lobbies.delete(code);
      }
    }, 300000);
  }
  
  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);
    
    for (const [code, lobby] of lobbies.entries()) {
      const playerIndex = lobby.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        const player = lobby.players[playerIndex];
        lobby.players.splice(playerIndex, 1);
        
        if (lobby.players.length === 0) {
          lobbies.delete(code);
        } else {
          io.to(code).emit('playersUpdate', lobby.players);
          if (!lobby.gameStarted) {
            io.to(code).emit('error', `${player.name} покинул лобби`);
          }
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});