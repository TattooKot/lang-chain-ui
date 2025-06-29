// src/App.js
import { useState, useRef, useEffect } from "react";
import {
    Box,
    Paper,
    TextField,
    IconButton,
    Typography,
    ThemeProvider,
    createTheme,
    CssBaseline,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";

const theme = createTheme({
    palette: {
        background: {
            default: "#1a1a1a",
        },
        primary: { main: "#0088cc" },
    },
    typography: {
        fontFamily: "Inter, sans-serif",
    },
});

function App() {
    const [country, setCountry] = useState("");
    const [messages, setMessages] = useState([]);
    const [streaming, setStreaming] = useState(false);
    const [conversationId, setConversationId] = useState("");
    const chatEndRef = useRef(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!country.trim() || streaming) return;

        // Очищаємо попередні повідомлення та ID
        setMessages([{ sender: "user", text: country.trim() }, { sender: "bot", text: "" }]);
        setConversationId("");
        setStreaming(true);

        const res = await fetch("http://localhost:8000/stream-capital", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ country }),
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
                    const id = part.replace("event: conversation_id\n", "").replace("data: ", "").trim();
                    setConversationId(id);
                }
                else if (part.startsWith("event: token")) {
                    const chunk = part.replace(/^event: token\n/, "").replace(/^data: /, "");
                    newText += chunk;
                }
                // ігноруємо event: done
            }
            if (newText) {
                setMessages((prev) => {
                    const updated = [...prev];
                    // додаємо новий текст до останнього повідомлення bot
                    const last = updated[updated.length - 1];
                    updated[updated.length - 1] = { ...last, text: last.text + newText };
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
                    p: 2,
                    backgroundColor: "#1a1a1a",
                    backgroundImage: `url(${process.env.PUBLIC_URL}/bg/chat-bg.png)`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center center",
                    backgroundSize: "cover",
                }}
            >
                <Paper
                    elevation={4}
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
                    <Box sx={{ p: 2, bgcolor: "primary.main" }}>
                        <Typography
                            variant="h6"
                            sx={{ color: "white", fontWeight: 600, textAlign: "center" }}
                        >
                            Capital Finder
                        </Typography>
                        {conversationId && (
                            <Typography
                                variant="body2"
                                sx={{ color: "white", textAlign: "center", mt: 0.5 }}
                            >
                                ID діалогу: {conversationId}
                            </Typography>
                        )}
                    </Box>

                    {/* Messages */}
                    <Box
                        sx={{
                            flex: 1,
                            overflowY: "auto",
                            p: 2,
                            bgcolor: "#f0f0f0",
                        }}
                    >
                        {messages.map((m, i) => (
                            <Box
                                key={i}
                                sx={{
                                    display: "flex",
                                    justifyContent:
                                        m.sender === "user" ? "flex-end" : "flex-start",
                                    mb: 1.5,
                                }}
                            >
                                <Paper
                                    sx={{
                                        p: 1.5,
                                        bgcolor: m.sender === "user" ? "primary.main" : "white",
                                        color: m.sender === "user" ? "white" : "black",
                                        maxWidth: "75%",
                                        borderRadius: 2,
                                        borderTopRightRadius:
                                            m.sender === "user" ? 0 : 2,
                                        borderTopLeftRadius:
                                            m.sender === "user" ? 2 : 0,
                                    }}
                                    elevation={1}
                                >
                                    <Typography variant="body1">{m.text}</Typography>
                                </Paper>
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
                            bgcolor: "#ffffff",
                        }}
                    >
                        <TextField
                            variant="outlined"
                            placeholder="Enter country..."
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
