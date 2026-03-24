const socket = io();
let currentLobbyCode = null;
let currentPlayer = null;
let currentQuestionId = 0;
let startTime = null;
let currentTimerInterval = null;

// Состояние игры
let currentPlayers = [];
let currentQuestion = null;
let currentQuestionNumber = 0;
let totalQuestions = 0;

// ========== ОТРИСОВКА СТРАНИЦ ==========
function renderMainMenu() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="game-header">
            <h1>🎯 QUIZ GAME</h1>
            <p>Проверь свои знания!</p>
        </div>
        
        <div class="form-section">
            <div class="card">
                <h2>👤 Введите ваше имя</h2>
                <input type="text" id="playerName" class="input-field" placeholder="Ваше имя" value="Игрок${Math.floor(Math.random() * 1000)}">
            </div>
            
            <div class="button-group">
                <button id="createBtn" class="btn btn-primary">✨ Создать лобби</button>
                <div class="divider">или</div>
                <div class="join-section">
                    <input type="text" id="lobbyCode" class="input-field" placeholder="Код лобби (6 цифр)">
                    <button id="joinBtn" class="btn btn-secondary">🔑 Присоединиться</button>
                </div>
            </div>
        </div>
    `;
    
    // Добавляем обработчики
    document.getElementById('createBtn')?.addEventListener('click', () => {
        const playerName = document.getElementById('playerName').value.trim();
        if (!playerName) {
            alert('Введите ваше имя!');
            return;
        }
        currentPlayer = playerName;
        socket.emit('createLobby', playerName);
    });
    
    document.getElementById('joinBtn')?.addEventListener('click', () => {
        const code = document.getElementById('lobbyCode').value.trim();
        const playerName = document.getElementById('playerName').value.trim();
        
        if (!code) {
            alert('Введите код лобби!');
            return;
        }
        if (!playerName) {
            alert('Введите ваше имя!');
            return;
        }
        
        currentPlayer = playerName;
        socket.emit('joinLobby', { code, playerName });
    });
}

function renderLobby(code, players) {
    currentLobbyCode = code;
    currentPlayers = players;
    
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="container">
            <div class="lobby-header">
                <h1>🎮 Игровое лобби</h1>
                <div class="lobby-code-box">
                    <span>Код комнаты:</span>
                    <strong id="lobbyCode">${code}</strong>
                    <button onclick="window.copyCode()" class="btn-small">📋 Копировать</button>
                </div>
                <div class="player-name-display" style="margin-top: 10px; color: #666;">
                    Игрок: <strong>${escapeHtml(currentPlayer)}</strong>
                </div>
            </div>
            
            <div class="players-section">
                <h2>👥 Игроки (<span id="playersCount">${players.length}</span>)</h2>
                <ul id="playersList" class="players-list">
                    ${players.map(player => `
                        <li>
                            <span class="player-name">${escapeHtml(player.name)}</span>
                            <span class="player-score">${player.score} очков</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
            
            <div class="lobby-controls">
                <button id="startGameBtn" class="btn btn-success">🚀 Начать игру</button>
                <button id="exitBtn" class="btn btn-secondary">🏠 Выйти</button>
            </div>
            
            <div class="waiting-message">
                <p>⏳ Ожидание игроков...</p>
                <p style="font-size: 14px; margin-top: 10px;">Поделитесь кодом с друзьями, чтобы они присоединились!</p>
            </div>
        </div>
    `;
    
    // Добавляем обработчики
    document.getElementById('startGameBtn')?.addEventListener('click', () => {
        socket.emit('startGame', currentLobbyCode);
    });
    
    document.getElementById('exitBtn')?.addEventListener('click', () => {
        currentLobbyCode = null;
        currentPlayer = null;
        renderMainMenu();
    });
}

function updatePlayersList(players) {
    currentPlayers = players;
    const list = document.getElementById('playersList');
    const count = document.getElementById('playersCount');
    
    if (list) {
        list.innerHTML = players.map(player => `
            <li>
                <span class="player-name">${escapeHtml(player.name)}</span>
                <span class="player-score">${player.score} очков</span>
            </li>
        `).join('');
    }
    
    if (count) count.textContent = players.length;
}

function renderGame() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="container game-container">
            <div class="game-info">
                <div class="question-counter">
                    Вопрос <span id="currentQuestion">${currentQuestionNumber}</span> / <span id="totalQuestions">${totalQuestions}</span>
                </div>
                <div class="timer">
                    ⏱️ <span id="timer">10</span> сек
                </div>
            </div>
            
            <div class="question-box">
                <h2 id="questionText">${currentQuestion ? escapeHtml(currentQuestion.text) : 'Загрузка...'}</h2>
            </div>
            
            <div id="options" class="options-grid">
                ${currentQuestion ? currentQuestion.options.map((opt, idx) => `
                    <button class="option-btn" onclick="window.answerQuestion(${idx})">${escapeHtml(opt)}</button>
                `).join('') : ''}
            </div>
            
            <div id="waitingNext" class="waiting-next" style="display: none;">
                <p>⏳ Ожидание ответов других игроков...</p>
            </div>
        </div>
    `;
    
    if (currentQuestion) {
        startTimer();
    }
}

function startTimer() {
    let timeLeft = 10;
    const timerSpan = document.getElementById('timer');
    if (timerSpan) {
        if (currentTimerInterval) clearInterval(currentTimerInterval);
        
        currentTimerInterval = setInterval(() => {
            if (timeLeft <= 0) {
                clearInterval(currentTimerInterval);
                currentTimerInterval = null;
            } else {
                timeLeft--;
                timerSpan.textContent = timeLeft;
            }
        }, 1000);
    }
    startTime = Date.now();
}

function showQuestion(data) {
    currentQuestion = data.question;
    currentQuestionNumber = data.questionNumber;
    totalQuestions = data.totalQuestions;
    
    renderGame();
}

function renderResults(players) {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="container results-container">
            <div class="results-header">
                <h1>🏆 ИГРА ЗАВЕРШЕНА 🏆</h1>
                <p>Отличная игра! Вот итоговые результаты:</p>
            </div>
            
            <div class="leaderboard-section">
                <h2>📊 Таблица лидеров</h2>
                <ol id="leaderboard" class="leaderboard-list">
                    ${players.map((player, index) => `
                        <li>
                            <div class="player-info">
                                <span class="player-name-result">${escapeHtml(player.name)}</span>
                                <span class="player-score-result">${player.score} очков</span>
                            </div>
                        </li>
                    `).join('')}
                </ol>
            </div>
            
            <div class="results-actions">
                <button id="newGameBtn" class="btn btn-primary">🎮 Новая игра</button>
                <button id="mainMenuBtn" class="btn btn-secondary">🏠 На главную</button>
            </div>
        </div>
    `;
    
    document.getElementById('newGameBtn')?.addEventListener('click', () => {
        currentLobbyCode = null;
        currentPlayer = null;
        renderMainMenu();
    });
    
    document.getElementById('mainMenuBtn')?.addEventListener('click', () => {
        currentLobbyCode = null;
        currentPlayer = null;
        renderMainMenu();
    });
}

// ========== ГЛОБАЛЬНЫЕ ФУНКЦИИ ==========
window.answerQuestion = function(answerIndex) {
    if (!currentQuestion) return;
    
    const time = (Date.now() - startTime) / 1000;
    
    // Блокируем кнопки после ответа
    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach(btn => btn.disabled = true);
    
    // Останавливаем таймер
    if (currentTimerInterval) {
        clearInterval(currentTimerInterval);
        currentTimerInterval = null;
    }
    
    socket.emit('answer', {
        code: currentLobbyCode,
        questionId: currentQuestion.id,
        answerIndex: answerIndex,
        time: time
    });
    
    // Показываем ожидание
    const waitingDiv = document.getElementById('waitingNext');
    if (waitingDiv) waitingDiv.style.display = 'block';
};

window.copyCode = function() {
    const codeElement = document.getElementById('lobbyCode');
    if (codeElement) {
        const code = codeElement.textContent;
        navigator.clipboard.writeText(code).then(() => {
            alert('Код скопирован: ' + code);
        });
    }
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== СОБЫТИЯ СОКЕТА ==========
socket.on('connect', () => {
    console.log('Connected to server with id:', socket.id);
});

socket.on('lobbyCreated', (data) => {
    currentLobbyCode = data.code;
    renderLobby(data.code, data.players);
});

socket.on('joinedLobby', (data) => {
    currentLobbyCode = data.code;
    renderLobby(data.code, data.players);
});

socket.on('playersUpdate', (players) => {
    updatePlayersList(players);
});

socket.on('gameStarting', (data) => {
    renderGame();
});

socket.on('newQuestion', (data) => {
    showQuestion(data);
});

socket.on('gameEnded', (data) => {
    if (currentTimerInterval) {
        clearInterval(currentTimerInterval);
        currentTimerInterval = null;
    }
    renderResults(data.players);
});

socket.on('error', (message) => {
    alert('Ошибка: ' + message);
});

socket.on('disconnect', () => {
    alert('Соединение с сервером потеряно. Перезагрузите страницу.');
});

// ========== ЗАПУСК ==========
renderMainMenu();