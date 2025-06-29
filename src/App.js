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
    List,
    ListItemButton,
    ListItemText,
    Divider,
    Button,
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
        secondary: { main: "#ffffff" },
    },
    typography: { fontFamily: "Inter, sans-serif" },
});

function App() {
    // Сесії: кожна має id та масив повідомлень
    const [sessions, setSessions] = useState([
        { id: "", messages: [] }
    ]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [input, setInput] = useState("");
    const [streaming, setStreaming] = useState(false);
    const chatEndRef = useRef(null);

    // Автоскрол на нові повідомлення
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [sessions, activeIndex]);

    const activeSession = sessions[activeIndex];

    // Додати нову порцію тексту до активної сесії
    const appendToActive = (sender, text) => {
        const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setSessions(prev => {
            const copy = [...prev];
            copy[activeIndex] = {
                ...copy[activeIndex],
                messages: [
                    ...copy[activeIndex].messages,
                    { sender, text, timestamp }
                ]
            };
            return copy;
        });
    };

    // Створити нову сесію
    const handleNewSession = () => {
        setSessions(prev => [...prev, { id: "", messages: [] }]);
        setActiveIndex(sessions.length);
    };

    const handleSubmit = async e => {
        e.preventDefault();
        const text = input.trim();
        if (!text || streaming) return;

        appendToActive("user", text);
        appendToActive("bot", "");

        setStreaming(true);
        setInput("");

        // Формуємо тіло з conversation_id
        const body = { message: text };
        if (activeSession.id) body.conversation_id = activeSession.id;

        const res = await fetch("http://localhost:8000/stream-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
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
            let gotId = null;

            for (const part of parts) {
                if (part.startsWith("event: conversation_id")) {
                    gotId = part.split("\n")[1].replace("data: ", "").trim();
                } else if (part.startsWith("event: token")) {
                    newText += part.split("\n")[1].replace("data: ", "");
                }
            }

            if (gotId) {
                // Прописуємо id сесії
                setSessions(prev => {
                    const copy = [...prev];
                    copy[activeIndex] = { ...copy[activeIndex], id: gotId };
                    return copy;
                });
            }
            if (newText) {
                // Додаємо токени до останнього bot-повідомлення
                setSessions(prev => {
                    const copy = [...prev];
                    const msgs = [...copy[activeIndex].messages];
                    const last = msgs[msgs.length - 1];
                    msgs[msgs.length - 1] = { ...last, text: last.text + newText };
                    copy[activeIndex] = { ...copy[activeIndex], messages: msgs };
                    return copy;
                });
            }
        }

        setStreaming(false);
    };

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box sx={{ display: "flex", height: "100vh", bgcolor: "background.default" }}>
                {/* Сайдбар сесій */}
                <Box sx={{ width: 240, borderRight: 1, borderColor: "#ddd", bgcolor: "#fff" }}>
                    <Box sx={{ p: 1 }}>
                        <Button variant="contained" fullWidth onClick={handleNewSession}>
                            New Chat
                        </Button>
                    </Box>
                    <Divider />
                    <List>
                        {sessions.map((s, idx) => (
                            <ListItemButton
                                key={idx}
                                selected={idx === activeIndex}
                                onClick={() => setActiveIndex(idx)}
                            >
                                <ListItemText
                                    primary={s.id ? `Chat ${idx + 1}` : `New Chat`}
                                    secondary={s.id}
                                    primaryTypographyProps={{ noWrap: true }}
                                    secondaryTypographyProps={{ noWrap: true }}
                                />
                            </ListItemButton>
                        ))}
                    </List>
                </Box>

                {/* Головна область чату */}
                <Paper
                    elevation={3}
                    sx={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        margin: 2,
                        borderRadius: 2,
                        overflow: "hidden",
                    }}
                >
                    {/* Хедер */}
                    <Box sx={{ p: 2, bgcolor: "primary.main", color: "white" }}>
                        <Typography variant="h6">
                            {activeSession.id ? `Chat ${activeIndex + 1}` : "New Chat"}
                        </Typography>
                        {activeSession.id && (
                            <Typography variant="caption">ID: {activeSession.id}</Typography>
                        )}
                    </Box>

                    {/* Повідомлення */}
                    <Box sx={{ flex: 1, overflowY: "auto", p: 2, bgcolor: "#f9f9f9" }}>
                        {activeSession.messages.map((m, i) => (
                            <Box
                                key={i}
                                sx={{
                                    display: "flex",
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
                                        bgcolor: m.sender === "user" ? "#0088cc" : "#fff",
                                        color: m.sender === "user" ? "white" : "black",
                                        maxWidth: "75%",
                                        position: "relative",
                                    }}
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

                    {/* Інпут */}
                    <Box
                        component="form"
                        onSubmit={handleSubmit}
                        sx={{ display: "flex", p: 1, borderTop: 1, borderColor: "#ddd" }}
                    >
                        <TextField
                            variant="outlined"
                            placeholder="Type your message..."
                            value={input}
                            onChange={e => setInput(e.target.value)}
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
