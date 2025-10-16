#!/usr/bin/env node
/*
 End-to-end smoke test:
 - Register student
 - Login student
 - Login admin and create a bank (if none)
 - Student uploads a deposit (multipart)
 - Admin approves the deposit
 - Student enrolls in sample workshop (WK-TEST)
 - Verifies enrollment and deposit status
*/

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const db = require('../src/db');
const QRCode = require('qrcode');

const BASE = process.env.BASE_URL || 'http://localhost:4000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@miumg.edu.gt';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Admin1234';
const WORKSHOP_ID = process.env.WORKSHOP_ID || 'WK-TEST';

function rand(n=100000) { return Math.floor(Math.random() * n); }

async function main() {
  const studentEmail = `student${Date.now()}${rand()}@miumg.edu.gt`;
  const studentPass = 'Test1234!';
  const studentName = 'Estudiante Prueba';
  const carnet = `0904-22-${10000 + rand(80000)}`;

  console.log('1) Register student:', studentEmail);
  const register = await axios.post(`${BASE}/auth/register`, {
    fullName: studentName,
    email: studentEmail,
    password: studentPass,
    carnetNumber: carnet,
  }, { validateStatus: () => true });
  if (!(register.status === 201 || register.status === 200)) {
    console.error('Register response:', register.status, register.data);
    throw new Error('Register failed');
  }
  const studentAccess = register.data.accessToken;
  if (!studentAccess) throw new Error('No student access token in register response');

  console.log('2) Login admin');
  const adminLogin = await axios.post(`${BASE}/auth/login`, { email: ADMIN_EMAIL, password: ADMIN_PASS }, { validateStatus: () => true });
  if (adminLogin.status !== 200) {
    console.error('Admin login response:', adminLogin.status, adminLogin.data);
    throw new Error('Admin login failed');
  }
  const adminAccess = adminLogin.data.accessToken;

  console.log('3) Ensure bank exists');
  // Try fetch banks first
  let bank;
  try {
    const banksResp = await axios.get(`${BASE}/banks`, { validateStatus: () => true });
    if (banksResp.status === 200 && Array.isArray(banksResp.data) && banksResp.data.length > 0) {
      bank = banksResp.data[0];
    }
  } catch {}
  if (!bank) {
    // Make sure table exists, then create via API as admin
    try {
      await db.query(`CREATE TABLE IF NOT EXISTS banks (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        color VARCHAR(20),
        account_number TEXT NOT NULL,
        account_holder TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    } catch {}
    const bankCreate = await axios.post(`${BASE}/banks`, {
      name: 'Banco Demo ' + rand(),
      color: '#0044cc',
      accountNumber: '001-123456-7',
      accountHolder: 'Universidad Mariano Gálvez',
      isActive: true,
    }, { headers: { Authorization: `Bearer ${adminAccess}` }, validateStatus: () => true });
    if (bankCreate.status !== 201) {
      console.error('Bank create response:', bankCreate.status, bankCreate.data);
      throw new Error('Bank create failed');
    }
    bank = bankCreate.data;
  }

  console.log('4) Student uploads deposit');
  // Prepare a valid PNG file using QRCode buffer to satisfy file type filter
  const qrbuf = await QRCode.toBuffer('RECIBO-DEMO-' + rand(), { width: 256, margin: 1, errorCorrectionLevel: 'L' });
  const fd = new FormData();
  fd.append('receipt', qrbuf, { filename: 'receipt.png', contentType: 'image/png' });
  fd.append('bankId', String(bank.id));
  fd.append('documentNumber', 'DOC-' + rand());
  fd.append('fullName', studentName);
  fd.append('email', studentEmail);
  fd.append('amount', '100');
  fd.append('referenceNumber', 'REF-' + rand());
  fd.append('carnetNumber', carnet);
  const depResp = await axios.post(`${BASE}/deposits`, fd, {
    headers: { ...fd.getHeaders(), Authorization: `Bearer ${studentAccess}` },
    maxBodyLength: Infinity,
    validateStatus: () => true,
  });
  if (depResp.status !== 201) {
    console.error('Deposit response:', depResp.status, depResp.data);
    throw new Error('Deposit create failed');
  }
  const deposit = depResp.data;
  console.log('   Deposit id:', deposit.id, 'status:', deposit.status);

  console.log('5) Admin approves deposit');
  const approve = await axios.post(`${BASE}/deposits/${deposit.id}/review`, { action: 'approve', notes: 'OK' }, { headers: { Authorization: `Bearer ${adminAccess}` }, validateStatus: () => true });
  if (approve.status !== 200) {
    console.error('Approve response:', approve.status, approve.data);
    throw new Error('Deposit approve failed');
  }

  console.log('6) Student enrolls in workshop', WORKSHOP_ID);
  const enroll = await axios.post(`${BASE}/workshops/${encodeURIComponent(WORKSHOP_ID)}/enroll`, {}, { headers: { Authorization: `Bearer ${studentAccess}` }, validateStatus: () => true });
  if (!(enroll.status === 201 || enroll.status === 409)) {
    console.error('Enroll response:', enroll.status, enroll.data);
    throw new Error('Enroll failed');
  }

  console.log('7) Verify deposit status is approved');
  const depCheck = await axios.get(`${BASE}/deposits`, { params: { email: studentEmail }, headers: { Authorization: `Bearer ${studentAccess}` }, validateStatus: () => true });
  if (depCheck.status !== 200) {
    console.error('Deposit check response:', depCheck.status, depCheck.data);
    throw new Error('Deposit check failed');
  }
  if (!depCheck.data || String(depCheck.data.status).toLowerCase() !== 'approved') {
    console.error('Deposit check body:', depCheck.data);
    throw new Error('Deposit not approved in check');
  }

  console.log('8) Verify enrollment');
  const enrCheck = await axios.get(`${BASE}/workshops/${encodeURIComponent(WORKSHOP_ID)}/enrollment`, { headers: { Authorization: `Bearer ${studentAccess}` }, validateStatus: () => true });
  if (enrCheck.status !== 200) {
    console.error('Enrollment check response:', enrCheck.status, enrCheck.data);
    throw new Error('Enrollment check failed');
  }
  if (!enrCheck.data || !enrCheck.data.enrolled) {
    console.error('Enrollment body:', enrCheck.data);
    throw new Error('Not enrolled');
  }

  console.log('\n✅ Smoke test passed for', { studentEmail, workshopId: WORKSHOP_ID });
}

main().catch((e) => {
  console.error('❌ Smoke test failed:', e && e.message ? e.message : e);
  process.exit(1);
});
