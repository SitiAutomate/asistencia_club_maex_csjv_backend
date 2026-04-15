import express from 'express';

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    message: 'Backend funcionando correctamente',
    timestamp: new Date().toISOString(),
  });
});

export default router;
