#!/usr/bin/env node
(async () => {
  try {
    const { sendEnrollmentConfirmation } = require('../src/services/emailService');
    await sendEnrollmentConfirmation({
      to: 'test@example.com',
      event: { id: 'WK-TEST', title: 'Taller Demo', date: '2026-02-06', time: '18:00', location: 'Ruinas Resort' },
      studentName: 'Juan Pérez',
      carnet: '20230001',
    });
    console.log('Enrollment email trigger completed');
  } catch (e) {
    console.error('Failed:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
