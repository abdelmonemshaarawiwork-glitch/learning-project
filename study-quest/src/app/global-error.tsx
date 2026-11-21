"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f8f7f2", color: "#303630", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 500 }}>Something went wrong.</h1>
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px", borderRadius: 10, border: "1px solid #e4e1d7", background: "#fff", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
