const express = require('express');
const path = require('node:path');
const fs = require('node:fs');

const app = express();
const directory = path.resolve(__dirname, '../../frontend');
const gatewayPort = Number(process.env.GATEWAY_PUBLIC_PORT || 4000);
if (!Number.isInteger(gatewayPort) || gatewayPort < 1 || gatewayPort > 65535) throw new Error('Puerto de gateway invalido');
const index = fs.readFileSync(path.join(directory, 'index.html'), 'utf8')
  .replace('<head>', '<head><meta name="gateway-port" content="' + gatewayPort + '">');
app.get(['/','/index.html'], (_req, res) => res.type('html').send(index));
app.use(express.static(directory));
app.listen(8080, '0.0.0.0', () => console.log('Frontend disponible en el puerto 8080'));
