require('dotenv').config();
console.log(!!process.env.DATABASE_URL, (process.env.DATABASE_URL||'').length);
