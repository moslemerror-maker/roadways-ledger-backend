const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables from .env file (for local testing)
dotenv.config();

const app = express();

// --- 1. MIDDLEWARE & CONFIGURATION ---

// Set the allowed frontend origins (MUST be updated with your actual GitHub Pages URL)
const allowedOrigins = [
    'https://moslemerror-maker.github.io', 
    'https://roadways-ledger-frontend-xxxx.github.io', // Example GitHub Pages URL
    'https://roadways.bestcement.co.in'    // Example Custom Domain
];

app.use(express.json()); // To parse JSON bodies from frontend requests

// Configure CORS for security
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or local requests)
        if (!origin) return callback(null, true);
        
        // Check if the origin is in the allowed list
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    }
})); 

// --- 2. DATABASE CONNECTION (NEON) ---
// Render automatically injects DATABASE_URL from environment variables
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true }
});

// Test DB connection on startup
pool.connect()
    .then(() => console.log('Connected successfully to Neon for Roadways Ledger!'))
    .catch(err => console.error('Connection error', err.stack));


// Helper function to parse numerical fields safely (converts empty string/null to null)
const parseNumeric = (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? null : num; 
};


// --- 3. API ROUTES for Bilty Data (/api/bilty) ---

// GET All Bilty Data (Read)
app.get('/api/bilty', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM bilty_data ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching bilty data:', err);
        res.status(500).json({ error: 'Server error fetching bilty data.' });
    }
});


// POST New Bilty Entry (Create)
app.post('/api/bilty', async (req, res) => {
    const { 
        bilty_sl_no, lr_no, bill_no, bill_date, truck_no, destination,
        weight, freight, diesel, total_adv, balance, pump_name, 
        payment_officer, damage_if_any, margin 
    } = req.body;

    if (!bilty_sl_no || !weight) {
        return res.status(400).json({ error: 'Bilty SL No. and Weight are required.' });
    }

    try {
        const query = `
            INSERT INTO bilty_data (
                bilty_sl_no, lr_no, bill_no, bill_date, truck_no, destination,
                weight, freight, diesel, total_adv, balance, pump_name, 
                payment_officer, damage_if_any, margin
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *;`;
            
        const values = [
            bilty_sl_no, lr_no, bill_no, bill_date, truck_no, destination,
            parseNumeric(weight), parseNumeric(freight), parseNumeric(diesel), 
            parseNumeric(total_adv), parseNumeric(balance), pump_name, 
            payment_officer, damage_if_any, parseNumeric(margin)
        ];

        const result = await pool.query(query, values);
        res.status(201).json(result.rows[0]);

    } catch (err) {
        // Unique constraint violation (23505 error code)
        if (err.code === '23505') { 
            return res.status(409).json({ error: 'Bilty SL No. already exists. Please use a unique number.' });
        }
        // Not-null constraint violation (23502 error code)
        if (err.code === '23502') { 
            return res.status(400).json({ error: `Missing required data for column: ${err.column}` });
        }
        console.error('Bilty insert error:', err);
        res.status(500).json({ error: `Server error: ${err.message}` });
    }
});

// PUT Update Existing Bilty Entry (Update)
app.put('/api/bilty/:id', async (req, res) => {
    const { id } = req.params;
    const { 
        bilty_sl_no, lr_no, bill_no, bill_date, truck_no, destination,
        weight, freight, diesel, total_adv, balance, pump_name, 
        payment_officer, damage_if_any, margin 
    } = req.body;

    try {
        const query = `
            UPDATE bilty_data SET
                bilty_sl_no = $1, lr_no = $2, bill_no = $3, bill_date = $4, truck_no = $5, destination = $6,
                weight = $7, freight = $8, diesel = $9, total_adv = $10, balance = $11, pump_name = $12, 
                payment_officer = $13, damage_if_any = $14, margin = $15
            WHERE id = $16
            RETURNING *;`;
            
        const values = [
            bilty_sl_no, lr_no, bill_no, bill_date, truck_no, destination,
            parseNumeric(weight), parseNumeric(freight), parseNumeric(diesel), 
            parseNumeric(total_adv), parseNumeric(balance), pump_name, 
            payment_officer, damage_if_any, parseNumeric(margin), id
        ];

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Bilty entry not found.' });
        }
        res.json(result.rows[0]);

    } catch (err) {
        console.error('Bilty update error:', err);
        res.status(500).json({ error: `Server error: ${err.message}` });
    }
});

// DELETE Bilty Entry (Delete)
app.delete('/api/bilty/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM bilty_data WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Bilty entry not found.' });
        }
        res.status(204).send(); 
    } catch (err) {
        console.error('Bilty delete error:', err);
        res.status(500).json({ error: 'Server error deleting bilty entry.' });
    }
});


// --- 4. START SERVER ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Roadways Ledger Server running on port ${PORT}`);
});