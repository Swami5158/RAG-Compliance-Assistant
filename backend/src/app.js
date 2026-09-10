const express = require("express");
require("dotenv").config();

const app = express();
const pool = require("./db/connection");



app.use(express.json());

app.get("/", (req, res) => {
    res.json({
      message: "RAG Compliance Assistant Backend is running",
    });
})

app.get("/db-test", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");
        res.json({
            message: "Database connected",
            time: result.rows[0].now
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Database connection failed"
        });
    }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
})