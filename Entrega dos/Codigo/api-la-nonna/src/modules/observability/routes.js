const express = require('express');
const { requireRole, requireSession } = require('../auth/middleware');

const router = express.Router();

router.get('/', requireSession, requireRole('admin'), (req, res) => {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  return res.json({
    uptime_seconds: Math.round(process.uptime()),
    memory_bytes: {
      rss: memory.rss,
      heap_used: memory.heapUsed,
      heap_total: memory.heapTotal,
      external: memory.external
    },
    cpu_microseconds: {
      user: cpu.user,
      system: cpu.system
    }
  });
});

module.exports = router;
