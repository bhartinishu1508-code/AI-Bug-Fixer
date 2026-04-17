// ================== IMPORTS ==================
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const cors = require("cors");
const Groq = require("groq-sdk");

// ================== INIT ==================
const app = express();

// ================== MIDDLEWARE ==================
app.use(express.json());
app.use(cors());

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

// ================== DB CONNECT ==================
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.log("❌ DB Error:", err));

// ================== MODEL ==================
const ErrorSchema = new mongoose.Schema({
  error: String,
  solution: String,
}, { timestamps: true });

const ErrorModel = mongoose.model("Error", ErrorSchema);

// ================== GROQ INIT ==================
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ================== GET HISTORY ==================
app.get("/api/history", async (req, res) => {
  try {
    const data = await ErrorModel.find()
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// ================== CLEAR MEMORY ==================
app.delete("/api/history", async (req, res) => {
  try {
    await ErrorModel.deleteMany({});
    res.json({ message: "Memory cleared" });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear memory" });
  }
});

// ================== FIX ERROR ==================
app.post("/api/fix-error", async (req, res) => {
  const { error } = req.body;

  if (!error) {
    return res.status(400).json({
      solution: "❌ Please provide an error",
      source: "validation"
    });
  }

  try {
    // Check memory
    const existing = await ErrorModel.findOne({ error });

    if (existing) {
      return res.json({
        solution: existing.solution,
        source: "memory"
      });
    }

    // AI call
    const chat = await groq.chat.completions.create({
      messages: [
        { role: "system", content: "You are an expert programmer. Give short correct solutions." },
        { role: "user", content: `Fix this error:\n${error}` }
      ],
      model: "llama-3.1-8b-instant",
    });

    const solution = chat.choices[0].message.content;

    // Save memory
    await ErrorModel.create({ error, solution });

    res.json({
      solution,
      source: "AI"
    });

  } catch (err) {
    console.log("ERROR:", err.message);

    if (err.status === 429) {
      return res.json({
        solution: "Too many requests. Try again later.",
        source: "limit"
      });
    }

    res.status(500).json({
      solution: "Something went wrong",
      source: "server"
    });
  }
});

// ================== DEFAULT ==================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ================== START ==================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Running on http://localhost:${PORT}`);
});