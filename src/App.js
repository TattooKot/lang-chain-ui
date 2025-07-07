import { useState, useRef, useEffect, useCallback } from "react";
import {
    Box,
    Paper,
    List,
    ListItemButton,
    ListItemText,
    Divider,
    Button,
    TextField,
    IconButton,
    Avatar,
    Typography,
    ThemeProvider,
    createTheme,
    CssBaseline,
    Chip,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import DeleteIcon from "@mui/icons-material/Delete";
import PersonIcon from "@mui/icons-material/Person";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import WifiIcon from "@mui/icons-material/Wifi";
import WifiOffIcon from "@mui/icons-material/WifiOff";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";

const API = "http://localhost:8000";

const theme = createTheme({
    palette: {
        background: { default: "#f0f2f5" },
        primary: { main: "#0088cc" },
    },
    typography: { fontFamily: "Inter, sans-serif" },
});

function App() {
    const [input, setInput] = useState("");
    const [sessions, setSessions] = useState([]);
    const [activeIndex, setActiveIndex] = useState(null);
    const [streaming, setStreaming] = useState(false);
    const [chimeWsConnected, setChimeWsConnected] = useState(false);
    const [currentSessionId, setCurrentSessionId] = useState(null);
    const [reconnectAttempts, setReconnectAttempts] = useState(0);
    const chatEndRef = useRef(null);
    const chimeWsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const maxReconnectAttempts = 3;

    // Завантажити список сесій із Postgres
    useEffect(() => {
        fetch(`${API}/sessions`)
            .then((r) => r.json())
            .then((data) => {
                const initial = data.sessions.map(({ id, channel_arn }) => ({
                    id,
                    channelArn: channel_arn,
                    messages: [],
                }));
                setSessions(initial);
                if (initial.length) setActiveIndex(0);
            })
            .catch(console.error);
    }, []);

    // Підвантажити історію із Chime при перемиканні активної сесії
    useEffect(() => {
        if (activeIndex === null) return;
        const sess = sessions[activeIndex];
        if (!sess || !sess.channelArn) return;
        // якщо повідомлення вже завантажені — більше не запитуємо
        if (sess.messages.length > 0) return;

        fetch(`${API}/chime/history/${sess.id}`)
            .then((r) => r.json())
            .then((history) => {
                const messages = history.map((m) => ({
                    // тут використовуємо те, що повернув бекенд: m.role
                    sender: m.role,
                    text: m.content,
                    timestamp: m?.timestamp
                        ? new Date(m.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                        })
                        : "",
                }));
                setSessions((prev) => {
                    const copy = [...prev];
                    copy[activeIndex] = { ...copy[activeIndex], messages };
                    return copy;
                });
            })
            .catch(console.error);
    }, [activeIndex]);

    // Helper function to determine if we should reconnect based on close code
    const shouldReconnectBasedOnCloseCode = useCallback((closeCode) => {
        // Based on AWS Chime SDK documentation
        const reconnectableCodes = [1001, 1006, 1011, 1012, 1013, 1014];
        const nonReconnectableCodes = [4002, 4003, 4401, 4429]; // Added 4429 for rate limiting
        
        if (reconnectableCodes.includes(closeCode)) {
            return true;
        }
        
        if (nonReconnectableCodes.includes(closeCode)) {
            return false;
        }
        
        // For 4XXX codes, be more conservative about reconnecting
        if (closeCode >= 4000 && closeCode < 5000) {
            return false; // Don't auto-reconnect for most 4XXX codes
        }
        
        return false;
    }, []);

    // Update message in session when receiving WebSocket updates
    const updateMessageInSession = useCallback((sessionId, messageId, content) => {
        setSessions((prev) => {
            const copy = [...prev];
            const sessionIndex = copy.findIndex(s => s.id === sessionId);
            
            if (sessionIndex !== -1) {
                const session = copy[sessionIndex];
                const messages = [...session.messages];
                
                // Find the message to update (usually the last assistant message)
                const messageIndex = messages.findIndex(m => 
                    m.sender === "assistant" && 
                    (m.messageId === messageId || messages.indexOf(m) === messages.length - 1)
                );
                
                if (messageIndex !== -1) {
                    messages[messageIndex] = {
                        ...messages[messageIndex],
                        text: content,
                        messageId: messageId
                    };
                    
                    copy[sessionIndex] = { ...session, messages };
                }
            }
            
            return copy;
        });
    }, []);

    // Clean up WebSocket connection
    const cleanupWebSocket = useCallback(() => {
        if (chimeWsRef.current) {
            console.log("Cleaning up WebSocket connection");
            chimeWsRef.current.close(1000, "Normal closure");
            chimeWsRef.current = null;
            setChimeWsConnected(false);
        }
        
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        
        setReconnectAttempts(0);
    }, []);

    // AWS Chime WebSocket connection management
    const connectToChimeWebSocket = useCallback(async (sessionId) => {
        // Prevent multiple connections to the same session
        if (currentSessionId === sessionId && chimeWsRef.current?.readyState === WebSocket.OPEN) {
            console.log("WebSocket already connected to session:", sessionId);
            return;
        }

        // Clean up any existing connection
        cleanupWebSocket();

        try {
            console.log("Connecting to Chime WebSocket for session:", sessionId);
            
            // Get the signed AWS Chime WebSocket URL from backend
            const response = await fetch(`${API}/chime/websocket-url/${sessionId}`);
            if (!response.ok) {
                throw new Error(`Failed to get WebSocket URL: ${response.status}, ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log("Got Chime WebSocket URL for session:", sessionId);
            
            // Connect directly to AWS Chime WebSocket with proper URL
            const chimeWs = new WebSocket(data.websocket_url);
            
            chimeWs.onopen = () => {
                console.log("Connected to AWS Chime WebSocket for session:", sessionId);
                setChimeWsConnected(true);
                setCurrentSessionId(sessionId);
                setReconnectAttempts(0);
            };
            
            chimeWs.onmessage = (chimeEvent) => {
                try {
                    const chimeData = JSON.parse(chimeEvent.data);
                    console.log("Received Chime WebSocket message:", chimeData);
                    
                    // Handle different event types according to Chime SDK documentation
                    const headers = chimeData.Headers || {};
                    const eventType = headers['x-amz-chime-event-type'];
                    
                    switch (eventType) {
                        case 'SESSION_ESTABLISHED':
                            console.log("Chime WebSocket session established");
                            break;
                            
                        case 'CREATE_CHANNEL_MESSAGE':
                        case 'UPDATE_CHANNEL_MESSAGE':
                            try {
                                const payload = JSON.parse(chimeData.Payload);
                                console.log("Channel message event:", payload);
                                
                                // Update message in session
                                if (payload.MessageId && payload.Content) {
                                    updateMessageInSession(sessionId, payload.MessageId, payload.Content);
                                }
                            } catch (payloadError) {
                                console.error("Error parsing message payload:", payloadError);
                            }
                            break;
                            
                        case 'CHANNEL_DETAILS':
                            try {
                                const payload = JSON.parse(chimeData.Payload);
                                console.log("Channel details:", payload);
                                // Handle channel details if needed
                            } catch (payloadError) {
                                console.error("Error parsing channel details:", payloadError);
                            }
                            break;
                            
                        default:
                            console.log("Unhandled Chime event type:", eventType, chimeData);
                    }
                } catch (error) {
                    console.error("Error parsing Chime WebSocket message:", error);
                }
            };
            
            chimeWs.onclose = (event) => {
                console.log("AWS Chime WebSocket disconnected", event.code, event.reason);
                setChimeWsConnected(false);
                
                // Only attempt reconnection if this is still the current session
                if (currentSessionId === sessionId) {
                    const shouldReconnect = shouldReconnectBasedOnCloseCode(event.code);
                    const canReconnect = reconnectAttempts < maxReconnectAttempts;
                    
                    if (shouldReconnect && canReconnect) {
                        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Exponential backoff, max 30s
                        console.log(`Attempting to reconnect to Chime WebSocket in ${delay}ms (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
                        
                        setReconnectAttempts(prev => prev + 1);
                        reconnectTimeoutRef.current = setTimeout(() => {
                            connectToChimeWebSocket(sessionId);
                        }, delay);
                    } else {
                        console.log("Not reconnecting:", { shouldReconnect, canReconnect, attempts: reconnectAttempts });
                        setCurrentSessionId(null);
                    }
                }
            };
            
            chimeWs.onerror = (error) => {
                console.error("AWS Chime WebSocket error:", error);
                setChimeWsConnected(false);
            };
            
            chimeWsRef.current = chimeWs;
            
        } catch (error) {
            console.error("Error connecting to Chime WebSocket:", error);
            setChimeWsConnected(false);
            setCurrentSessionId(null);
        }
    }, [currentSessionId, reconnectAttempts, shouldReconnectBasedOnCloseCode, updateMessageInSession, cleanupWebSocket]);

    // Connect to WebSocket when active session changes
    useEffect(() => {
        if (activeIndex !== null && sessions[activeIndex]?.id) {
            const sessionId = sessions[activeIndex].id;
            
            // Only connect if we're switching to a different session
            if (sessionId !== currentSessionId) {
                connectToChimeWebSocket(sessionId);
            }
        } else {
            // No active session, clean up connection
            cleanupWebSocket();
            setCurrentSessionId(null);
        }
    }, [activeIndex, sessions.length > 0 ? sessions[activeIndex]?.id : null]); // More specific dependencies

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanupWebSocket();
        };
    }, [cleanupWebSocket]);

    // автоскрол
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [sessions, activeIndex]);

    const appendToActive = (sender, text) => {
        const ts = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
        setSessions((prev) => {
            const copy = [...prev];
            const sess = copy[activeIndex];
            sess.messages = [...sess.messages, { sender, text, timestamp: ts }];
            return copy;
        });
    };

    const handleNewSession = () => {
        setSessions((prev) => [
            ...prev,
            { id: "", channelArn: "", messages: [] },
        ]);
        setActiveIndex(sessions.length);
    };

    const handleDeleteSession = async (idx) => {
        const { id } = sessions[idx];
        if (id) {
            await fetch(`${API}/sessions/${id}`, { method: "DELETE" });
        }
        setSessions((prev) => {
            const copy = prev.filter((_, i) => i !== idx);
            if (activeIndex === idx) setActiveIndex(copy.length ? 0 : null);
            else if (activeIndex > idx) setActiveIndex(activeIndex - 1);
            return copy;
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const text = input.trim();
        if (!text || streaming || activeIndex === null) return;

        appendToActive("user", text);
        appendToActive("assistant", ""); // placeholder

        setStreaming(true);
        setInput("");

        const sess = sessions[activeIndex];
        const body = { message: text };
        if (sess.id) body.conversation_id = sess.id;

        const res = await fetch(`${API}/chime/post-question`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            console.error("422 Validation error:", await res.json());
            setStreaming(false);
            return;
        }
    };

    const active = sessions[activeIndex] || { id: "", channelArn: "", messages: [] };

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box sx={{ display: "flex", height: "100vh", bgcolor: "background.default" }}>
                {/* Sidebar */}
                <Box sx={{ width: 260, borderRight: 1, borderColor: "#ddd", bgcolor: "#fff" }}>
                    <Box sx={{ p: 1 }}>
                        <Button variant="contained" fullWidth onClick={handleNewSession}>
                            New Chat
                        </Button>
                    </Box>
                    <Divider />
                    <List>
                        {sessions.map((s, i) => (
                            <ListItemButton
                                key={s.id || i}
                                selected={i === activeIndex}
                                onClick={() => setActiveIndex(i)}
                            >
                                <IconButton
                                    edge="start"
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteSession(i);
                                    }}
                                    disabled={streaming}
                                    sx={{ mr: 1 }}
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                                <ListItemText
                                    primary={s.id ? `Chat ${i + 1}` : "New Chat"}
                                    secondary={s.id}
                                    primaryTypographyProps={{ noWrap: true }}
                                    secondaryTypographyProps={{ noWrap: true }}
                                />
                            </ListItemButton>
                        ))}
                    </List>
                </Box>

                {/* Chat */}
                <Paper
                    elevation={3}
                    sx={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        m: 2,
                        borderRadius: 2,
                        overflow: "hidden",
                    }}
                >
                    {/* Header */}
                    <Box sx={{ p: 2, bgcolor: "primary.main", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Box>
                            <Typography variant="h6">
                                {active.id ? `Chat #${activeIndex + 1}` : "New Chat"}
                            </Typography>
                            {active.id && <Typography variant="caption">ID: {active.id}</Typography>}
                        </Box>
                        <Box sx={{ display: "flex", gap: 1 }}>
                            <Chip
                                icon={chimeWsConnected ? <WifiIcon /> : <WifiOffIcon />}
                                label="Chime WebSocket"
                                size="small"
                                color={chimeWsConnected ? "success" : "error"}
                                variant="outlined"
                                sx={{ color: "white", borderColor: "white" }}
                            />
                        </Box>
                    </Box>

                    {/* Messages */}
                    <Box sx={{ flex: 1, overflowY: "auto", p: 2, bgcolor: "#f9f9f9" }}>
                        {active.messages.map((m, idx) => (
                            <Box
                                key={idx}
                                sx={{
                                    display: "flex",
                                    justifyContent: m.sender === "user" ? "flex-end" : "flex-start",
                                    mb: 1.5,
                                }}
                            >
                                {m.sender === "assistant" && (
                                    <Avatar sx={{ bgcolor: "#e0e0e0", mr: 1 }}>
                                        <SmartToyIcon color="primary" />
                                    </Avatar>
                                )}
                                <Paper
                                    sx={{
                                        p: 1.5,
                                        bgcolor: m.sender === "user" ? "#0088cc" : "#fff",
                                        color: m.sender === "user" ? "white" : "black",
                                        maxWidth: "75%",
                                        position: "relative",
                                    }}
                                    elevation={1}
                                >
                                    <Typography variant="body1" sx={{ mb: 0.5 }}>
                                        {m.text}
                                    </Typography>
                                    <Typography
                                        variant="caption"
                                        sx={{ position: "absolute", bottom: 4, right: 8, opacity: 0.6 }}
                                    >
                                        {m.timestamp}
                                    </Typography>
                                </Paper>
                                {m.sender === "user" && (
                                    <Avatar sx={{ bgcolor: "#0088cc", ml: 1 }}>
                                        <PersonIcon sx={{ color: "white" }} />
                                    </Avatar>
                                )}
                            </Box>
                        ))}
                        <div ref={chatEndRef} />
                    </Box>

                    {/* Input */}
                    <Box
                        component="form"
                        onSubmit={handleSubmit}
                        sx={{ display: "flex", p: 1, borderTop: 1, borderColor: "#ddd" }}
                    >
                        <TextField
                            variant="outlined"
                            placeholder="Type your message..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={streaming}
                            fullWidth
                            sx={{ mr: 1 }}
                        />
                        <IconButton color="primary" type="submit" disabled={streaming || !input.trim()}>
                            <SendIcon />
                        </IconButton>
                    </Box>
                </Paper>
            </Box>
        </ThemeProvider>
    );
}

export default App;
