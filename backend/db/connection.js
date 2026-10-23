const {Pool, Client} = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    max: 20,
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 5000 // Return an error if connection takes > 5 seconds
});

pool.on('error', (err,client) =>{
    console.error('Unexpected error on idle database client',err);
});

module.exports = pool;