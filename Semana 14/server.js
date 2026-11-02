require('dotenv').config();

const { createApp } = require('./src/app');

const port = Number(process.env.PORT) || 8100;
const app = createApp();

app.listen(port, () => {
  console.log(`Auth Service disponible en http://localhost:${port}`);
});
