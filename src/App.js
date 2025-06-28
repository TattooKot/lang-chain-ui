import { useState } from "react";

function App() {
  const [country, setCountry] = useState("");
  const [response, setResponse] = useState("");
  const [streaming, setStreaming] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!country.trim()) return;

    setResponse("");
    setStreaming(true);

    const res = await fetch("http://localhost:8000/stream-capital", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      setResponse((prev) => prev + decoder.decode(value));
    }

    setStreaming(false);
  };

  return (
      <div style={{ maxWidth: 600, margin: "2rem auto", fontFamily: "sans-serif" }}>
        <h1>Capital Finder</h1>
        <form onSubmit={handleSubmit}>
          <input
              type="text"
              placeholder="Enter country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={streaming}
              style={{ width: "80%", padding: "0.5rem", fontSize: "1rem" }}
          />
          <button type="submit" disabled={streaming} style={{ padding: "0.5rem 1rem", marginLeft: 8 }}>
            {streaming ? "Loading…" : "Send"}
          </button>
        </form>

        <div
            style={{
              whiteSpace: "pre-wrap",
              marginTop: "1rem",
              padding: "1rem",
              border: "1px solid #ddd",
              minHeight: "4rem",
            }}
        >
          {response || (streaming ? "Waiting for response…" : "Response will appear here")}
        </div>
      </div>
  );
}

export default App;
