// src/App.js
import { useState, useRef, useEffect } from "react";
import {
    Box,
    Paper,
    TextField,
    IconButton,
    Typography,
    Avatar,
    ThemeProvider,
    createTheme,
    CssBaseline,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import PersonIcon from "@mui/icons-material/Person";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";

const theme = createTheme({
    palette: {
        background: { default: "#f0f2f5" },
        primary: { main: "#0088cc" },
    },
    typography: {
        fontFamily: "Inter, sans-serif",
    },
    components: {
        MuiPaper: {
            styleOverrides: {
                root: {
                    transition: "background-color 0.3s ease",
                },
            },
        },
    },
});

function App() {
    const [country, setCountry] = useState("");
    const [messages, setMessages] = useState([]); // { sender, text, timestamp }
    const [streaming, setStreaming] = useState(false);
    const [conversationId, setConversationId] = useState("");
    const chatEndRef = useRef(null);

    // автоскрол
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const addMessage = (sender, text) => {
        setMessages((prev) => [
            ...prev,
            {
                sender,
                text,
                timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            },
        ]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!country.trim() || streaming) return;

        // Нова сесія чи новий меседж
        setMessages([]);
        setConversationId("");
        addMessage("user", country.trim());
        addMessage("bot", ""); // placeholder
        setStreaming(true);

        const res = await fetch("http://localhost:8000/stream-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: country }),
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const parts = buffer.split("\n\n");
            buffer = parts.pop();

            let newText = "";
            for (const part of parts) {
                if (part.startsWith("event: conversation_id")) {
                    const id = part.split("\n")[1].replace("data: ", "").trim();
                    setConversationId(id);
                } else if (part.startsWith("event: token")) {
                    newText += part.split("\n")[1].replace("data: ", "");
                }
            }
            if (newText) {
                setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    updated[updated.length - 1] = {
                        ...last,
                        text: last.text + newText,
                        // keep the original bot timestamp
                    };
                    return updated;
                });
            }
        }

        setStreaming(false);
        setCountry("");
    };

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box
                sx={{
                    height: "100vh",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    bgcolor: "background.default",
                    p: 2,
                }}
            >
                <Paper
                    elevation={6}
                    sx={{
                        width: "100%",
                        maxWidth: 600,
                        height: "80vh",
                        display: "flex",
                        flexDirection: "column",
                        borderRadius: 2,
                        overflow: "hidden",
                    }}
                >
                    {/* Header */}
                    <Box sx={{ p: 2, bgcolor: "primary.main", color: "white" }}>
                        <Typography variant="h6" sx={{ fontWeight: 600, textAlign: "center" }}>
                            Chat &nbsp;
                            <Typography component="span" variant="caption">
                                {conversationId && `(ID: ${conversationId})`}
                            </Typography>
                        </Typography>
                    </Box>

                    {/* Chat area */}
                    <Box
                        sx={{
                            flex: 1,
                            overflowY: "auto",
                            p: 2,
                            bgcolor: "#ffffff",
                        }}
                    >
                        {messages.map((m, i) => (
                            <Box
                                key={i}
                                sx={{
                                    display: "flex",
                                    alignItems: "flex-end",
                                    justifyContent: m.sender === "user" ? "flex-end" : "flex-start",
                                    mb: 1.5,
                                }}
                            >
                                {m.sender === "bot" && (
                                    <Avatar sx={{ bgcolor: "#e0e0e0", mr: 1 }}>
                                        <SmartToyIcon color="primary" />
                                    </Avatar>
                                )}
                                <Paper
                                    sx={{
                                        p: 1.5,
                                        bgcolor: m.sender === "user" ? "#0088cc" : "#f5f5f5",
                                        color: m.sender === "user" ? "white" : "black",
                                        maxWidth: "75%",
                                        borderRadius: 2,
                                        position: "relative",
                                    }}
                                >
                                    <Typography variant="body1" sx={{ mb: 0.5 }}>
                                        {m.text}
                                    </Typography>
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            position: "absolute",
                                            bottom: 4,
                                            right: 8,
                                            opacity: 0.6,
                                        }}
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
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            p: 1,
                            bgcolor: "#fafafa",
                            borderTop: "1px solid #ddd",
                        }}
                    >
                        <TextField
                            variant="outlined"
                            placeholder="Type your message..."
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                            disabled={streaming}
                            fullWidth
                            sx={{ mr: 1 }}
                        />
                        <IconButton
                            color="primary"
                            type="submit"
                            disabled={streaming || !country.trim()}
                        >
                            <SendIcon />
                        </IconButton>
                    </Box>
                </Paper>
            </Box>
        </ThemeProvider>
    );
}

export default App;
