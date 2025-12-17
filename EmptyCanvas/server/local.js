// EmptyCanvas/server/local.js
const app = require('./app');
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Local dev: http://0.0.0.0:${PORT}`));
