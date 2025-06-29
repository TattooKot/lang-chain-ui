import { useState, useRef, useEffect } from "react";
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
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import DeleteIcon from "@mui/icons-material/Delete";
import PersonIcon from "@mui/icons-material/Person";
import SmartToyIcon from "@mui/icons-material/SmartToy";
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
    // sessions: { id: string, channelArn: string, messages: [] }
    const [sessions, setSessions] = useState([]);
    const [activeIndex, setActiveIndex] = useState(null);
    const [streaming, setStreaming] = useState(false);
    const chatEndRef = useRef(null);

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

        fetch(`${API}/chime/history/${sess.id}`)
            .then((r) => r.json())
            .then((history) => {
                const messages = history.map((m) => {
                    let role = "assistant";
                    if (m.metadata) {
                        try {
                            const md = JSON.parse(m.metadata);
                            if (md.sender_role === "user" || md.sender_role === "assistant") {
                                role = md.sender_role;
                            }
                        } catch {}
                    }
                    return {
                        sender: role,
                        text: m.content,
                        timestamp: m.timestamp
                            ? new Date(m.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                            })
                            : "",
                    };
                });
                setSessions((prev) => {
                    const copy = [...prev];
                    copy[activeIndex] = { ...copy[activeIndex], messages };
                    return copy;
                });
            })
            .catch(console.error);
    }, [activeIndex, sessions]);

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

        const res = await fetch(`${API}/chime/stream-chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            console.error("422 Validation error:", await res.json());
            setStreaming(false);
            return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const parts = buf.split("\n\n");
            buf = parts.pop();

            let newText = "";
            let newId = null;

            parts.forEach((p) => {
                if (p.startsWith("event: conversation_id")) {
                    newId = p.split("\n")[1].replace("data: ", "").trim();
                } else if (p.startsWith("event: token")) {
                    newText += p.split("\n")[1].replace("data: ", "");
                }
            });

            if (newId) {
                setSessions((prev) => {
                    const copy = [...prev];
                    copy[activeIndex] = {
                        ...copy[activeIndex],
                        id: newId,
                        channelArn: copy[activeIndex].channelArn || newId,
                    };
                    return copy;
                });
            }

            if (newText) {
                setSessions((prev) => {
                    const copy = [...prev];
                    const msgs = copy[activeIndex].messages;
                    msgs[msgs.length - 1] = {
                        ...msgs[msgs.length - 1],
                        text: msgs[msgs.length - 1].text + newText,
                    };
                    return copy;
                });
            }
        }

        setStreaming(false);
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
                    <Box sx={{ p: 2, bgcolor: "primary.main", color: "white" }}>
                        <Typography variant="h6">
                            {active.id ? `Chat #${activeIndex + 1}` : "New Chat"}
                        </Typography>
                        {active.id && <Typography variant="caption">ID: {active.id}</Typography>}
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
