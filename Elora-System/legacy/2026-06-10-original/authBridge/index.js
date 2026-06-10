// authBridge/index.js
const express = require('express');
const calendarRoutes = require('./calendar');

const router = express.Router();

router.use('/calendar', calendarRoutes);
// Future: router.use('/gmail', gmailRoutes)

module.exports = router;
