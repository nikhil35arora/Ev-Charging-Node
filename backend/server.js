
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config({ path: "../.env" });

const app = express();
// Charging session database structure
const sessionSchema = new mongoose.Schema(
    {
        id: {
            type: String,
            default: "",
        },
        stationId: {
            type: String,
            required: true,
        },
        stationName: {
            type: String,
            default: "",
        },
        userId: {
            type: String,
            default: "demo-user",
        },
        powerKW: {
            type: Number,
            default: 0,
        },
        energyKWh: {
            type: Number,
            default: 0,
        },
        tariff: {
            type: Number,
            default: 0,
        },
        cost: {
            type: Number,
            default: 0,
        },
        durationSeconds: {
            type: Number,
            default: 0,
        },
        startedAt: {
            type: String,
            default: "",
        },
        endedAt: {
            type: String,
            default: "",
        },
        previousHash: {
            type: String,
            default: "GENESIS",
        },
        status: {
            type: String,
            default: "completed",
        },
        hash: {
            type: String,
            default: "",
        },
        transactionHash: {
            type: String,
            default: "",
        },
    },
    {
        timestamps: true,
    }
);
const ChargingSession = mongoose.model(
    "ChargingSession",
    sessionSchema
);

app.use(cors());
app.use(express.json());

// Connect to MongoDB Atlas
mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
        console.log("MongoDB connected successfully!");
    })
    .catch((error) => {
        console.error("MongoDB connection error:", error.message);
    });

// Test route
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        message: "Backend is running",
        database:
            mongoose.connection.readyState === 1
                ? "connected"
                : "disconnected",
    });
});
// Get all charging sessions
app.get("/api/sessions", async (req, res) => {
    try {
        const sessions = await ChargingSession.find().sort({
            createdAt: -1,
        });

        res.json(sessions);
    } catch (error) {
        res.status(500).json({
            message: "Could not retrieve sessions",
            error: error.message,
        });
    }
});

// Save a charging session
app.post("/api/sessions", async (req, res) => {
    try {
        const sessionData = {
            ...req.body,
            transactionHash: req.body.hash || req.body.transactionHash || "",
        };

        const session = new ChargingSession(sessionData);
        const savedSession = await session.save();

        res.status(201).json({
            message: "Charging session saved successfully",
            session: savedSession,
        });
    } catch (error) {
        res.status(400).json({
            message: "Could not save charging session",
            error: error.message,
        });
    }
});
// Start server
const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
