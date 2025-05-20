const GROQ_API_KEY = "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";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama3-70b-8192";

const systemState = {
    isActive: false,
    isProcessing: false,
    isSpeaking: false,
    isMusicPlaying: false,
    permissionGranted: false,
    initialized: false,
    currentSong: null,
    apiRetryCount: 0,
    maxApiRetries: 3,
    recognitionActive: false,
    lastRecognitionError: null,
    abortController: null,
    speechSynthesisUtterance: null,
    recognition: null,
    isResponding: false
};

let conversationHistory = [
    {
        role: "system",
        content: `You are ASTRA, an advanced AI assistant. Follow these rules strictly:
        1. Respond concisely (25-30 words max unless more is requested)
        2. Provide only factual, verified information
        3. Never generate code or fictional data
        4. Avoid religion and politics completely
        5. Maintain professional, neutral tone
        6. Remember previous conversation context
        7. If asked about restricted topics, reply: "I don't discuss that topic"
        8. Speak in a clear, male voice`
    }
];

// DOM Elements
const container = document.getElementById('container');
const core = document.getElementById('core');
const responseEl = document.getElementById('response');
const statusEl = document.getElementById('status');
const micBtn = document.getElementById('mic-btn');
const interruptBtn = document.getElementById('interrupt-btn');
const permissionError = document.getElementById('permission-error');
const wakeHint = document.getElementById('wake-hint');
const permissionPrompt = document.getElementById('permission-prompt');
const allowBtn = document.getElementById('allow-btn');
const denyBtn = document.getElementById('deny-btn');
const songPlayer = document.getElementById('song-player');
const songList = document.getElementById('song-list');
const closePlayer = document.getElementById('close-player');
const albumArt = document.getElementById('album-art');
const logoLeft = document.getElementById('logo-left');
const logoRight = document.getElementById('logo-right');

const audioPlayer = new Audio();
const isSpeechSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

const songs = [
    { title: "Cosmic Pulse", audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", image: "disc.png" },
    { title: "Quantum Echo", audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", image: "disc.png" },
    { title: "Stellar Wind", audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", image: "disc.png" },
    { title: "Digital Mirage", audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3", image: "disc.png" },
    { title: "Lunar Tide", audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3", image: "disc.png" }
];

function updateStatus(text, isError = false, isProcessing = false) {
    statusEl.textContent = text;
    statusEl.className = 'status';
    
    if (isError) {
        statusEl.classList.add('error');
    } else if (isProcessing) {
        statusEl.classList.add('processing');
    } else if (text === "ACTIVE" || text === "SYSTEM READY") {
        statusEl.classList.add('active');
    }
}

function updateResponse(text) {
    responseEl.textContent = text;
    responseEl.style.borderColor = "var(--secondary)";
    setTimeout(() => {
        responseEl.style.borderColor = "var(--accent)";
    }, 500);
}

function showPermissionPrompt() {
    permissionPrompt.style.display = 'block';
}

function hidePermissionPrompt() {
    permissionPrompt.style.display = 'none';
}

function hideSongPlayer() {
    songPlayer.style.display = 'none';
}

function initializeSystem() {
    if (!systemState.initialized) {
        if (!isSpeechSupported) {
            updateStatus("UNSUPPORTED", true);
            updateResponse("Voice commands not supported in this browser");
            return;
        }
        
        // Check if we already have permission
        if (systemState.permissionGranted) {
            initializeVoiceRecognition();
            systemState.initialized = true;
            micBtn.querySelector('.btn-text').textContent = "ACTIVATE";
            updateStatus("READY");
            updateResponse("System ready. Say 'ACTIVATE' to begin.");
            wakeHint.style.display = 'block';
            return;
        }
        
        // Request permission through the browser's native prompt
        navigator.permissions.query({name: 'microphone'}).then(permissionStatus => {
            if (permissionStatus.state === 'granted') {
                systemState.permissionGranted = true;
                initializeVoiceRecognition();
                systemState.initialized = true;
                micBtn.querySelector('.btn-text').textContent = "ACTIVATE";
                updateStatus("READY");
                updateResponse("System ready. Say 'ACTIVATE' to begin.");
                wakeHint.style.display = 'block';
            } else {
                // Show our custom prompt if not granted
                showPermissionPrompt();
            }
        }).catch(() => {
            // Fallback if permissions API isn't supported
            showPermissionPrompt();
        });
    } else {
        toggleActivation();
    }
}

function toggleActivation() {
    systemState.isActive = !systemState.isActive;
    
    if (systemState.isActive) {
        container.classList.add('voice-active');
        micBtn.classList.add('active');
        micBtn.querySelector('.btn-text').textContent = "DEACTIVATE";
        updateStatus("ACTIVE");
        updateResponse("System active. Listening for commands...");
        if (systemState.recognition) {
            systemState.recognition.start();
        }
    } else {
        container.classList.remove('voice-active');
        micBtn.classList.remove('active');
        micBtn.querySelector('.btn-text').textContent = "ACTIVATE";
        updateStatus("READY");
        updateResponse("System standby. Say 'ACTIVATE' to begin.");
        if (systemState.recognition) {
            systemState.recognition.stop();
        }
    }
}

function requestMicrophonePermission() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            stream.getTracks().forEach(track => track.stop());
            
            systemState.permissionGranted = true;
            localStorage.setItem('microphonePermission', 'granted');
            updateStatus("READY");
            micBtn.querySelector('.btn-text').textContent = "ACTIVATE";
            micBtn.classList.remove('error');
            
            initializeVoiceRecognition();
            systemState.initialized = true;
            updateResponse("System ready. Say 'ACTIVATE' to begin.");
            wakeHint.style.display = 'block';
            hidePermissionPrompt();
        })
        .catch(error => {
            console.error("Microphone error:", error);
            permissionError.style.display = 'block';
            setTimeout(() => permissionError.style.display = 'none', 5000);
            micBtn.querySelector('.btn-text').textContent = "ALLOW MICROPHONE";
            micBtn.classList.add('error');
            
            if (error.name === 'NotAllowedError') {
                updateResponse("Microphone access was denied");
                updateStatus("PERMISSION DENIED", true);
            } else {
                updateResponse("Microphone access error");
                updateStatus("MIC ERROR", true);
            }
        });
}

function initializeVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    systemState.recognition = new SpeechRecognition();
    systemState.recognition.continuous = true;
    systemState.recognition.interimResults = true;
    
    systemState.recognition.onstart = () => {
        systemState.recognitionActive = true;
        updateStatus("LISTENING", false, true);
    };
    
    systemState.recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            }
        }
        
        if (finalTranscript && !systemState.isResponding) {
            handleVoiceCommand(finalTranscript);
        }
    };
    
    systemState.recognition.onerror = (event) => {
        systemState.lastRecognitionError = event.error;
        updateStatus("RECOGNITION ERROR", true);
    };
    
    systemState.recognition.onend = () => {
        systemState.recognitionActive = false;
        if (systemState.isActive) {
            setTimeout(() => {
                if (!systemState.recognitionActive) {
                    systemState.recognition.start();
                }
            }, 500);
        }
    };
}

async function handleVoiceCommand(command) {
    if (!command || systemState.isSpeaking || systemState.isProcessing || systemState.isResponding) return;
    
    command = command.trim().toLowerCase();
    
    // Handle activation command
    if (command.includes('activate') && !systemState.isActive) {
        toggleActivation();
        return;
    }
    
    // Handle deactivation command
    if ((command.includes('deactivate') || command.includes('standby')) {
        if (systemState.isActive) {
            toggleActivation();
        }
        return;
    }
    
    // Only process commands when active
    if (!systemState.isActive) return;
    
    // Handle music commands
    if (command.includes('play music') || command.includes('play song')) {
        showSongPlayer();
        return;
    }
    
    if (command.includes('stop music') || command.includes('pause music')) {
        if (systemState.isMusicPlaying) {
            interruptAll();
            updateResponse("Music stopped");
        }
        return;
    }
    
    // Process other commands through AI
    systemState.isResponding = true;
    systemState.isProcessing = true;
    try {
        const response = await queryAI(command);
        updateResponse(response);
        await speak(response);
    } catch (error) {
        console.error("Command handling error:", error);
        updateResponse("Error processing command");
        updateStatus("ERROR", true);
    } finally {
        systemState.isProcessing = false;
        systemState.isResponding = false;
    }
}

function showSongPlayer() {
    songList.innerHTML = '';
    songs.forEach(song => {
        const songItem = document.createElement('div');
        songItem.className = 'song-item';
        songItem.textContent = song.title;
        songItem.addEventListener('click', () => {
            playSong(song);
            hideSongPlayer();
        });
        songList.appendChild(songItem);
    });
    
    songPlayer.style.display = 'block';
}

async function queryAI(prompt) {
    if (!prompt) return "Invalid input";
    
    systemState.abortController = new AbortController();
    updateStatus("PROCESSING", false, true);
    updateResponse("Processing request...");
    conversationHistory.push({ role: "user", content: prompt });

    if (prompt.toLowerCase().includes('bafsk')) {
        return "BAF Shaheen College Kurmitola is a prestigious educational institution in Bangladesh.";
    }

    try {
        const timeout = setTimeout(() => systemState.abortController.abort(), 10000);
        
        let response;
        for (let attempt = 0; attempt < systemState.maxApiRetries; attempt++) {
            try {
                response = await fetch(GROQ_API_URL, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${GROQ_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: GROQ_MODEL,
                        messages: conversationHistory,
                        temperature: 0.3,
                        max_tokens: 1000
                    }),
                    signal: systemState.abortController.signal
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error?.message || `API error ${response.status}`);
                }

                const contentType = response.headers.get('content-type');
                if (!contentType?.includes('application/json')) {
                    throw new Error("Invalid response format");
                }

                const data = await response.json();
                const aiResponse = data.choices[0].message.content.trim();
                conversationHistory.push({ role: "assistant", content: aiResponse });
                if (conversationHistory.length > 6) {
                    conversationHistory = conversationHistory.slice(-6);
                }
                
                return aiResponse;
            } catch (error) {
                if (attempt === systemState.maxApiRetries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            } finally {
                clearTimeout(timeout);
            }
        }
    } catch (error) {
        console.error("AI Error:", error);
        return error.name === 'AbortError' ? "Request interrupted" : `System error: ${error.message}. Please try again.`;
    }
}

function speak(text) {
    return new Promise((resolve) => {
        if (!text || systemState.isSpeaking) return resolve();
        
        systemState.isSpeaking = true;
        updateStatus("SPEAKING", false, true);
        interruptBtn.style.display = 'block';
        
        window.speechSynthesis.cancel();
        
        // Wait for voices to be loaded
        const getVoices = () => {
            const voices = speechSynthesis.getVoices();
            if (voices.length) {
                return voices;
            }
            return new Promise(resolve => {
                speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
            });
        };
        
        getVoices().then(voices => {
            systemState.speechSynthesisUtterance = new SpeechSynthesisUtterance(text);
            
            // Find a male voice or use default
            const maleVoice = voices.find(v => v.name.includes('Male') || v.name.includes('male'));
            if (maleVoice) {
                systemState.speechSynthesisUtterance.voice = maleVoice;
            }
            
            systemState.speechSynthesisUtterance.rate = 0.9;
            systemState.speechSynthesisUtterance.pitch = 0.8;
            
            systemState.speechSynthesisUtterance.onend = () => {
                systemState.isSpeaking = false;
                systemState.speechSynthesisUtterance = null;
                updateStatus(systemState.isActive ? "ACTIVE" : "READY");
                interruptBtn.style.display = 'none';
                resolve();
            };
            
            systemState.speechSynthesisUtterance.onerror = (e) => {
                console.error("Speech error:", e);
                systemState.isSpeaking = false;
                systemState.speechSynthesisUtterance = null;
                updateStatus(systemState.isActive ? "ACTIVE" : "READY");
                interruptBtn.style.display = 'none';
                resolve();
            };
            
            window.speechSynthesis.speak(systemState.speechSynthesisUtterance);
        });
    });
}

function interruptAll() {
    if (systemState.isSpeaking && systemState.speechSynthesisUtterance) {
        window.speechSynthesis.cancel();
        systemState.isSpeaking = false;
        systemState.speechSynthesisUtterance = null;
    }
    
    if (systemState.isProcessing && systemState.abortController) {
        systemState.abortController.abort();
        systemState.isProcessing = false;
        systemState.abortController = null;
    }
    
    if (systemState.isMusicPlaying) {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        systemState.isMusicPlaying = false;
        albumArt.style.opacity = '0';
    }
    
    if (systemState.recognition && systemState.recognitionActive) {
        systemState.recognition.stop();
    }
    
    systemState.isResponding = false;
    updateStatus(systemState.isActive ? "ACTIVE" : "READY");
    interruptBtn.style.display = 'none';
    
    if (systemState.isProcessing || systemState.isSpeaking) {
        updateResponse("Operation interrupted");
    }
}

function playSong(song) {
    interruptAll();
    
    systemState.currentSong = song;
    systemState.isMusicPlaying = true;
    
    audioPlayer.src = song.audio;
    albumArt.onload = () => {
        albumArt.classList.add('visible', 'spinning');
    };
    albumArt.src = song.image || 'disc.png';
    audioPlayer.play().then(() => {
        updateStatus("PLAYING MUSIC");
        updateResponse(`Now playing: ${song.title}`);
        interruptBtn.style.display = 'block';
    }).catch(e => {
        console.error("Playback error:", e);
        systemState.isMusicPlaying = false;
        albumArt.classList.remove('visible', 'spinning');
        updateStatus("PLAYBACK ERROR", true);
        updateResponse(`Could not play: ${song.title}`);
    });
    
    audioPlayer.onended = () => {
        systemState.isMusicPlaying = false;
        albumArt.classList.remove('visible', 'spinning');
        updateStatus(systemState.isActive ? "ACTIVE" : "READY");
        interruptBtn.style.display = 'none';
    };
}

// Event Listeners
micBtn.addEventListener('click', initializeSystem);
interruptBtn.addEventListener('click', interruptAll);
allowBtn.addEventListener('click', () => {
    hidePermissionPrompt();
    requestMicrophonePermission();
});
denyBtn.addEventListener('click', () => {
    hidePermissionPrompt();
    updateStatus("PERMISSION REQUIRED", true);
    updateResponse("Microphone access is required");
    micBtn.querySelector('.btn-text').textContent = "ALLOW MICROPHONE";
    micBtn.classList.add('error');
    micBtn.disabled = false;
});

closePlayer.addEventListener('click', hideSongPlayer);

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    try {
        updateStatus("SYSTEM STANDBY");
        
        // Check speech support and update UI accordingly
        if (!isSpeechSupported) {
            updateResponse("Voice commands not supported in this browser");
            micBtn.disabled = true;
            return;
        }
        
        wakeHint.style.display = 'none';
        
        // Check for existing permission
        if (localStorage.getItem('microphonePermission') === 'granted') {
            systemState.permissionGranted = true;
            updateResponse("Click button to initialize system");
        } else {
            updateResponse("Microphone access required - click to allow");
        }
    } catch (error) {
        console.error("Startup failed:", error);
        updateStatus("STARTUP ERROR", true);
        updateResponse("System initialization failed");
        micBtn.disabled = true;
    }
});